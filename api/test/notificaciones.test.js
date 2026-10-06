import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterNotificaciones } from "../src/routes/notificaciones.js";
import { manejarErrores } from "../src/middleware/errores.js";
import {
  crearNotificaciones, filtroNotificaciones, validarCursor, validarLimite, validarSoloNoLeidas,
  LIMITE_MAXIMO, LIMITE_POR_DEFECTO,
} from "../src/services/notificaciones.js";

// ---------- Validación y servicio (sin DB) ----------

test("validarLimite: por defecto, y solo enteros de 1 al máximo", () => {
  assert.equal(validarLimite(undefined), LIMITE_POR_DEFECTO);
  assert.equal(validarLimite(""), LIMITE_POR_DEFECTO);
  assert.equal(validarLimite("10"), 10);
  assert.equal(validarLimite(String(LIMITE_MAXIMO)), LIMITE_MAXIMO);
  for (const v of ["0", "-1", "1.5", "abc", String(LIMITE_MAXIMO + 1)]) assert.throws(() => validarLimite(v), (e) => e.status === 400);
});

test("validarCursor y validarSoloNoLeidas", () => {
  assert.equal(validarCursor(undefined), null);
  assert.equal(validarCursor("7"), 7);
  for (const v of ["0", "x", "1.2", "99999999999"]) assert.throws(() => validarCursor(v), (e) => e.status === 400);
  assert.equal(validarSoloNoLeidas(undefined), false);
  assert.equal(validarSoloNoLeidas("true"), true);
  assert.equal(validarSoloNoLeidas("false"), false);
  assert.throws(() => validarSoloNoLeidas("si"), (e) => e.status === 400);
});

test("filtroNotificaciones: siempre incluye al usuario; suma no leídas y cursor", () => {
  assert.deepEqual(filtroNotificaciones(5), { usuarioId: 5 });
  assert.deepEqual(filtroNotificaciones(5, { soloNoLeidas: true, antesDeId: 9 }), { usuarioId: 5, leidaEn: null, id: { lt: 9 } });
});

test("crearNotificaciones: una fila por destinatario, sin repetidos y con texto limpio", async () => {
  let guardado;
  const db = { notificacion: { createMany: async (args) => { guardado = args; return { count: args.data.length }; } } };
  const r = await crearNotificaciones(db, [1, 2, 2, 3], { tipo: "AVISO_DOCENTE", titulo: "  Cambio   de aula ", mensaje: "Mañana en el aula 3", materiaId: 4 });
  assert.deepEqual(r, { creadas: 3 });
  assert.deepEqual(guardado.data.map((d) => d.usuarioId), [1, 2, 3]);
  assert.equal(guardado.data[0].titulo, "Cambio de aula");
  assert.equal(guardado.data[0].materiaId, 4);
});

test("crearNotificaciones: sin destinatarios no escribe, y rechaza tipo o texto inválidos", async () => {
  const db = { notificacion: { createMany: async () => { throw new Error("no debería llamarse"); } } };
  assert.deepEqual(await crearNotificaciones(db, [], { tipo: "AVISO_DOCENTE", titulo: "a", mensaje: "b" }), { creadas: 0 });
  await assert.rejects(crearNotificaciones(db, [1], { tipo: "OTRO", titulo: "a", mensaje: "b" }), (e) => e.status === 400);
  await assert.rejects(crearNotificaciones(db, [1], { tipo: "AVISO_DOCENTE", titulo: " ", mensaje: "b" }), (e) => e.status === 400);
  await assert.rejects(crearNotificaciones(db, [1], { tipo: "AVISO_DOCENTE", titulo: "a", mensaje: "x".repeat(1001) }), (e) => e.status === 400);
});

// ---------- Contrato HTTP (DB en memoria) ----------

// Imita lo justo de Prisma para estas rutas: filtra por usuarioId / leidaEn / id.
function dbEnMemoria(filas) {
  const cumple = (f, where = {}) =>
    (where.usuarioId == null || f.usuarioId === where.usuarioId) &&
    (where.id == null || (typeof where.id === "object" ? f.id < where.id.lt : f.id === where.id)) &&
    (where.leidaEn !== null || f.leidaEn == null);
  return {
    tarea: { findMany: async () => [] }, // el alumno consulta recordatorios al abrir su historial
    notificacion: {
      findMany: async ({ where, take, select }) => filas
        .filter((f) => cumple(f, where)).sort((a, b) => b.id - a.id).slice(0, take)
        .map((f) => Object.fromEntries(Object.keys(select).map((k) => [k, f[k]]))), // como Prisma: solo lo pedido
      count: async ({ where }) => filas.filter((f) => cumple(f, where)).length,
      findFirst: async ({ where }) => filas.find((f) => cumple(f, where)) ?? null,
      update: async ({ where, data }) => Object.assign(filas.find((f) => f.id === where.id), data),
      updateMany: async ({ where, data }) => {
        const mias = filas.filter((f) => cumple(f, where));
        mias.forEach((f) => Object.assign(f, data));
        return { count: mias.length };
      },
    },
  };
}

const nueva = (id, usuarioId, extra = {}) => ({ id, usuarioId, tipo: "AVISO_DOCENTE", titulo: `N${id}`, mensaje: "m", creadoEn: new Date(), leidaEn: null, materia: null, ...extra });

async function conAPI(db, fn, usuarioId = 2) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/notificaciones", crearRouterNotificaciones(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, { token = true, rol = "ALUMNO" } = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/notificaciones${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${jwt.sign({ id: usuarioId, rol }, process.env.JWT_SECRET)}` } : {}) },
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP: exige login", async () => {
  await conAPI(dbEnMemoria([]), async (request) => {
    assert.equal((await request("GET", "/", { token: false })).status, 401);
    assert.equal((await request("POST", "/leer-todas", { token: false })).status, 401);
    assert.equal((await request("POST", "/1/leer", { token: false })).status, 401);
  });
});

test("HTTP: el historial es solo del usuario del token, de la más nueva a la más vieja, con las leídas incluidas", async () => {
  const filas = [nueva(1, 2, { leidaEn: new Date() }), nueva(2, 2), nueva(3, 99), nueva(4, 2)];
  await conAPI(dbEnMemoria(filas), async (request) => {
    const r = await request("GET", "/");
    assert.equal(r.status, 200);
    const cuerpo = await r.json();
    assert.deepEqual(cuerpo.notificaciones.map((n) => n.id), [4, 2, 1]);
    assert.deepEqual(cuerpo.notificaciones.map((n) => n.leida), [false, false, true]);
    assert.equal(cuerpo.noLeidas, 2);
    assert.equal(cuerpo.hayMas, false);
    assert.ok(!JSON.stringify(cuerpo).includes("usuarioId"), "no expone el destinatario");
  });
});

test("HTTP: soloNoLeidas filtra y limite + antesDeId paginan", async () => {
  const filas = [nueva(1, 2), nueva(2, 2, { leidaEn: new Date() }), nueva(3, 2), nueva(4, 2)];
  await conAPI(dbEnMemoria(filas), async (request) => {
    assert.deepEqual((await (await request("GET", "/?soloNoLeidas=true")).json()).notificaciones.map((n) => n.id), [4, 3, 1]);
    const pagina1 = await (await request("GET", "/?limite=2")).json();
    assert.deepEqual(pagina1.notificaciones.map((n) => n.id), [4, 3]);
    assert.equal(pagina1.hayMas, true);
    const pagina2 = await (await request("GET", "/?limite=2&antesDeId=3")).json();
    assert.deepEqual(pagina2.notificaciones.map((n) => n.id), [2, 1]);
    assert.equal(pagina2.hayMas, false);
    assert.equal((await request("GET", "/?limite=0")).status, 400);
    assert.equal((await request("GET", "/?soloNoLeidas=quizas")).status, 400);
  });
});

test("HTTP: marcar como leída funciona solo con las propias (las ajenas dan 404)", async () => {
  const filas = [nueva(1, 2), nueva(2, 99)];
  await conAPI(dbEnMemoria(filas), async (request) => {
    assert.equal((await request("POST", "/2/leer")).status, 404);
    assert.equal(filas[1].leidaEn, null, "la ajena no se toca");
    assert.equal((await request("POST", "/77/leer")).status, 404);
    assert.equal((await request("POST", "/abc/leer")).status, 400);
    const r = await request("POST", "/1/leer");
    assert.equal(r.status, 200);
    assert.ok(filas[0].leidaEn instanceof Date);
    const primera = filas[0].leidaEn;
    assert.equal((await request("POST", "/1/leer")).status, 200);
    assert.equal(filas[0].leidaEn, primera, "leerla de nuevo no cambia la fecha");
  });
});

test("HTTP: leer-todas marca solo las propias", async () => {
  const filas = [nueva(1, 2), nueva(2, 2, { leidaEn: new Date() }), nueva(3, 99)];
  await conAPI(dbEnMemoria(filas), async (request) => {
    const r = await request("POST", "/leer-todas");
    assert.deepEqual(await r.json(), { marcadas: 1 });
    assert.ok(filas[0].leidaEn);
    assert.equal(filas[2].leidaEn, null);
  });
});

test("HTTP: otros roles también tienen su propio historial", async () => {
  await conAPI(dbEnMemoria([nueva(1, 2)]), async (request) => {
    const r = await request("GET", "/", { rol: "DOCENTE" });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).notificaciones.length, 1);
  });
});

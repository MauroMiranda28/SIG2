import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterDocentes } from "../src/routes/docentes.js";
import { manejarErrores } from "../src/middleware/errores.js";
import { validarAviso } from "../src/services/notificaciones.js";

test("validarAviso: limpia el texto y rechaza vacío, sin cuerpo o demasiado largo", () => {
  assert.deepEqual(validarAviso({ titulo: "  Parcial   movido ", mensaje: "Será el viernes\ncon aula nueva" }), {
    titulo: "Parcial movido", mensaje: "Será el viernes\ncon aula nueva",
  });
  for (const body of [null, [], {}, { titulo: "a" }, { titulo: " ", mensaje: "b" }, { titulo: "a", mensaje: 5 },
    { titulo: "x".repeat(121), mensaje: "b" }, { titulo: "a", mensaje: "x".repeat(1001) }]) {
    assert.throws(() => validarAviso(body), (e) => e.status === 400, JSON.stringify(body)?.slice(0, 40));
  }
});

// DB simulada: la materia 5 la dicta el docente 7; la 6 es de otro docente. Los alumnos 21 y 22 cursan la 5.
function dbAvisos({ alumnos = [{ id: 21 }, { id: 22 }] } = {}) {
  const guardado = { filtroAlumnos: null, notificaciones: [] };
  return {
    guardado,
    materia: { findUnique: async ({ where }) => ({ 5: { id: 5, nombre: "Programación I", codigo: "PROG1" }, 6: { id: 6, nombre: "Base de Datos", codigo: "BD1" } })[where.id] ?? null },
    materiaDocente: { findUnique: async ({ where }) => (where.materiaId_docenteId.materiaId === 5 && where.materiaId_docenteId.docenteId === 7 ? { materiaId: 5 } : null) },
    usuario: { findMany: async ({ where }) => { guardado.filtroAlumnos = where; return alumnos; } },
    notificacion: { createMany: async ({ data }) => { guardado.notificaciones.push(...data); return { count: data.length }; } },
  };
}

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/docentes", crearRouterDocentes(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (ruta, rol, body, id = 7) => fetch(`http://127.0.0.1:${server.address().port}/api/docentes${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id, rol }, process.env.JWT_SECRET)}` } : {}) },
    body: JSON.stringify(body),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

const AVISO = { titulo: "Cambio de aula", mensaje: "El jueves cursamos en el aula 3." };

test("HTTP avisos: exige login y rol DOCENTE o ADMIN", async () => {
  const db = dbAvisos();
  await conAPI(db, async (request) => {
    assert.equal((await request("/materias/5/avisos", null, AVISO)).status, 401);
    assert.equal((await request("/materias/5/avisos", "ALUMNO", AVISO, 21)).status, 403);
    assert.equal(db.guardado.notificaciones.length, 0);
  });
});

test("HTTP avisos: el docente asignado le avisa a los alumnos de la materia, firmado y con la materia", async () => {
  const db = dbAvisos();
  await conAPI(db, async (request) => {
    const r = await request("/materias/5/avisos", "DOCENTE", AVISO);
    assert.equal(r.status, 201);
    assert.deepEqual(await r.json(), { materia: { id: 5, nombre: "Programación I", codigo: "PROG1" }, enviadas: 2 });
    assert.deepEqual(db.guardado.notificaciones.map((n) => n.usuarioId), [21, 22]);
    for (const n of db.guardado.notificaciones) {
      assert.equal(n.tipo, "AVISO_DOCENTE");
      assert.equal(n.materiaId, 5);
      assert.equal(n.autorId, 7, "el autor sale del token");
      assert.equal(n.titulo, AVISO.titulo);
    }
    // Los destinatarios son los alumnos de ESA materia (cursada o comisión elegida).
    assert.equal(db.guardado.filtroAlumnos.rol, "ALUMNO");
    assert.deepEqual(db.guardado.filtroAlumnos.OR[0], { cursadas: { some: { materiaId: 5 } } });
  });
});

test("HTTP avisos: un docente NO asignado recibe 403 y no se envía nada", async () => {
  const db = dbAvisos();
  await conAPI(db, async (request) => {
    assert.equal((await request("/materias/6/avisos", "DOCENTE", AVISO)).status, 403);
    assert.equal((await request("/materias/5/avisos", "DOCENTE", AVISO, 8)).status, 403, "otro docente");
    assert.equal((await request("/materias/99/avisos", "DOCENTE", AVISO)).status, 404);
    assert.equal(db.guardado.notificaciones.length, 0);
  });
});

test("HTTP avisos: ADMIN puede avisar en cualquier materia", async () => {
  const db = dbAvisos();
  await conAPI(db, async (request) => {
    assert.equal((await request("/materias/6/avisos", "ADMIN", AVISO, 1)).status, 201);
    assert.equal(db.guardado.notificaciones[0].materiaId, 6);
  });
});

test("HTTP avisos: no acepta destinatarios del cliente (ignora alumnoIds, usuarioId, autorId, materiaId)", async () => {
  const db = dbAvisos();
  await conAPI(db, async (request) => {
    const r = await request("/materias/5/avisos", "DOCENTE", { ...AVISO, alumnoIds: [999], usuarioId: 999, autorId: 999, materiaId: 6 });
    assert.equal(r.status, 201);
    assert.deepEqual(db.guardado.notificaciones.map((n) => n.usuarioId), [21, 22]);
    assert.ok(db.guardado.notificaciones.every((n) => n.autorId === 7 && n.materiaId === 5));
  });
});

test("HTTP avisos: valida título y mensaje, y avisa si no hay alumnos", async () => {
  const db = dbAvisos();
  await conAPI(db, async (request) => {
    assert.equal((await request("/materias/5/avisos", "DOCENTE", { titulo: "", mensaje: "x" })).status, 400);
    assert.equal((await request("/materias/5/avisos", "DOCENTE", { titulo: "x" })).status, 400);
    assert.equal((await request("/materias/abc/avisos", "DOCENTE", AVISO)).status, 400);
    assert.equal(db.guardado.notificaciones.length, 0);
  });
  await conAPI(dbAvisos({ alumnos: [] }), async (request) => {
    assert.equal((await request("/materias/5/avisos", "DOCENTE", AVISO)).status, 409);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterRevisiones } from "../src/routes/revisiones.js";
import { manejarErrores } from "../src/middleware/errores.js";
import { validarResolucion } from "../src/services/revisiones.js";

// ---------- Validación (sin DB) ----------

test("validarResolucion: acepta resuelta o rechazada con respuesta, y rechaza el resto", () => {
  assert.deepEqual(validarResolucion({ estado: "RESUELTA", respuesta: "  Revisé   el examen y tenés razón. " }), { estado: "RESUELTA", respuesta: "Revisé el examen y tenés razón." });
  assert.equal(validarResolucion({ estado: "RECHAZADA", respuesta: "La nota es correcta." }).estado, "RECHAZADA");
  for (const body of [null, [], {}, { estado: "PENDIENTE", respuesta: "Hola mundo" }, { estado: "OTRO", respuesta: "Hola mundo" },
    { estado: "RESUELTA" }, { estado: "RESUELTA", respuesta: "   " }, { estado: "RESUELTA", respuesta: "ok" }, { estado: "RESUELTA", respuesta: 5 },
    { estado: "RESUELTA", respuesta: "a".repeat(1001) }]) {
    assert.throws(() => validarResolucion(body), (e) => e.status === 400, JSON.stringify(body)?.slice(0, 50));
  }
});

// ---------- Contrato HTTP (DB en memoria) ----------

// La solicitud 9 es de Ana (alumno 21) por un parcial de la materia 3, que dicta el docente 7; la 10 es de la materia 4.
function dbResolver({ estado = "PENDIENTE" } = {}) {
  const e = { solicitudes: { 9: { estado, respuesta: null }, 10: { estado: "PENDIENTE", respuesta: null } }, notificaciones: [], filtroListado: null };
  const MATERIA_DE = { 9: 3, 10: 4 };
  const evaluacion = (materiaId) => ({ id: 5, tipo: "PARCIAL", nota: 4, fecha: new Date("2026-05-12T00:00:00Z"), cursada: { materia: { id: materiaId, nombre: materiaId === 3 ? "Base de Datos" : "Redes", codigo: "X" } } });
  const db = {
    estado: e,
    materia: { findUnique: async ({ where }) => ({ id: where.id, nombre: "Base de Datos", codigo: "BD1" }) },
    materiaDocente: { findUnique: async ({ where }) => (where.materiaId_docenteId.materiaId === 3 && where.materiaId_docenteId.docenteId === 7 ? { materiaId: 3 } : null) },
    solicitudRevision: {
      findUnique: async ({ where, select }) => {
        const s = e.solicitudes[where.id];
        if (!s) return null;
        if (select.evaluacion && !select.motivo) return { evaluacion: { cursada: { materiaId: MATERIA_DE[where.id] } } };
        return { id: where.id, motivo: "No coincide con la grilla", estado: s.estado, creadoEn: new Date(), respuesta: s.respuesta, resueltaEn: s.resueltaEn ?? null, alumnoId: 21, evaluacion: evaluacion(MATERIA_DE[where.id]) };
      },
      findMany: async ({ where }) => {
        e.filtroListado = where;
        return [
          { id: 8, motivo: "vieja", estado: "RESUELTA", creadoEn: new Date("2026-09-01"), respuesta: "ok", resueltaEn: new Date(), alumno: { id: 22, nombre: "Beto", apellido: "Gómez", email: "b@x" }, evaluacion: evaluacion(3) },
          { id: 9, motivo: "nueva", estado: "PENDIENTE", creadoEn: new Date("2026-09-20"), respuesta: null, resueltaEn: null, alumno: { id: 21, nombre: "Ana", apellido: "Díaz", email: "a@x" }, evaluacion: evaluacion(3) },
        ];
      },
      updateMany: async ({ where, data }) => {
        const s = e.solicitudes[where.id];
        if (!s || s.estado !== where.estado) return { count: 0 };
        Object.assign(s, data);
        return { count: 1 };
      },
    },
    notificacion: { createMany: async ({ data }) => { e.notificaciones.push(...data); return { count: data.length }; } },
  };
  // Transacción con rollback: si algo falla se restaura lo que había.
  db.$transaction = async (fn) => {
    const copia = { solicitudes: JSON.parse(JSON.stringify(e.solicitudes)), notificaciones: [...e.notificaciones] };
    try { return await fn(db); } catch (err) { Object.assign(e, copia); throw err; }
  };
  return db;
}

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/revisiones", crearRouterRevisiones(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol, body, id = 7) => fetch(`http://127.0.0.1:${server.address().port}/api/revisiones${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

const RESOLUCION = { estado: "RESUELTA", respuesta: "Revisé el examen y corregí la nota en el sistema." };

test("HTTP docente: exige login y rol DOCENTE o ADMIN (el alumno no resuelve ni lista)", async () => {
  const db = dbResolver();
  await conAPI(db, async (request) => {
    for (const [metodo, ruta, body] of [["GET", "/materias/3"], ["PATCH", "/9/resolver", RESOLUCION]]) {
      assert.equal((await request(metodo, ruta, null, body)).status, 401, `${metodo} sin login`);
      assert.equal((await request(metodo, ruta, "ALUMNO", body, 21)).status, 403, `${metodo} alumno`);
    }
  });
  assert.equal(db.estado.solicitudes[9].estado, "PENDIENTE");
});

test("HTTP docente: lista las solicitudes de la materia, primero las pendientes, con el alumno y la evaluación", async () => {
  const db = dbResolver();
  await conAPI(db, async (request) => {
    const r = await request("GET", "/materias/3", "DOCENTE");
    assert.equal(r.status, 200);
    const { materia, solicitudes } = await r.json();
    assert.equal(materia.id, 3);
    assert.deepEqual(solicitudes.map((s) => [s.id, s.estado]), [[9, "PENDIENTE"], [8, "RESUELTA"]], "pendientes primero");
    assert.equal(solicitudes[0].alumno.apellido, "Díaz");
    assert.equal(solicitudes[0].evaluacion.tipo, "PARCIAL");
  });
  assert.deepEqual(db.estado.filtroListado, { evaluacion: { cursada: { materiaId: 3 } } }, "solo de ESA materia");
});

test("HTTP docente: resolver deja el estado, la respuesta y quién la resolvió, y le avisa al alumno", async () => {
  const db = dbResolver();
  await conAPI(db, async (request) => {
    const r = await request("PATCH", "/9/resolver", "DOCENTE", RESOLUCION);
    assert.equal(r.status, 200);
    const resuelta = await r.json();
    assert.equal(resuelta.estado, "RESUELTA");
    assert.equal(resuelta.respuesta, RESOLUCION.respuesta);
    assert.ok(!("alumnoId" in resuelta));
  });
  const s = db.estado.solicitudes[9];
  assert.equal(s.estado, "RESUELTA");
  assert.equal(s.resueltaPorId, 7, "quién la resolvió sale del token");
  assert.ok(s.resueltaEn instanceof Date);
  assert.equal(db.estado.notificaciones.length, 1);
  const n = db.estado.notificaciones[0];
  assert.equal(n.usuarioId, 21);
  assert.equal(n.tipo, "REVISION_RESUELTA");
  assert.equal(n.autorId, 7);
  assert.equal(n.titulo, "Tu solicitud de revisión en Base de Datos fue resuelta");
  assert.equal(n.mensaje, "Parcial del 12/5/2026 (nota 4). Respuesta del docente: Revisé el examen y corregí la nota en el sistema.");
});

test("HTTP docente: rechazar avisa que fue rechazada", async () => {
  const db = dbResolver();
  await conAPI(db, async (request) => {
    assert.equal((await request("PATCH", "/9/resolver", "DOCENTE", { estado: "RECHAZADA", respuesta: "La nota coincide con la grilla." })).status, 200);
  });
  assert.equal(db.estado.solicitudes[9].estado, "RECHAZADA");
  assert.equal(db.estado.notificaciones[0].titulo, "Tu solicitud de revisión en Base de Datos fue rechazada");
});

test("HTTP docente: una solicitud ya resuelta no se resuelve de nuevo (409) y no avisa otra vez", async () => {
  const db = dbResolver({ estado: "RESUELTA" });
  await conAPI(db, async (request) => {
    assert.equal((await request("PATCH", "/9/resolver", "DOCENTE", RESOLUCION)).status, 409);
  });
  assert.equal(db.estado.notificaciones.length, 0);
});

test("HTTP docente: un docente NO asignado recibe 403; una solicitud inexistente, 404", async () => {
  const db = dbResolver();
  await conAPI(db, async (request) => {
    assert.equal((await request("GET", "/materias/3", "DOCENTE", undefined, 8)).status, 403, "otro docente");
    assert.equal((await request("PATCH", "/9/resolver", "DOCENTE", RESOLUCION, 8)).status, 403, "otro docente");
    assert.equal((await request("PATCH", "/10/resolver", "DOCENTE", RESOLUCION)).status, 403, "solicitud de otra materia");
    assert.equal((await request("PATCH", "/99/resolver", "DOCENTE", RESOLUCION)).status, 404);
    assert.equal((await request("PATCH", "/abc/resolver", "DOCENTE", RESOLUCION)).status, 400);
  });
  assert.equal(db.estado.solicitudes[9].estado, "PENDIENTE");
  assert.equal(db.estado.solicitudes[10].estado, "PENDIENTE");
  assert.equal(db.estado.notificaciones.length, 0);
});

test("HTTP docente: ADMIN puede resolver en cualquier materia; datos inválidos no resuelven", async () => {
  const db = dbResolver();
  await conAPI(db, async (request) => {
    assert.equal((await request("PATCH", "/9/resolver", "ADMIN", { estado: "RESUELTA" }, 1)).status, 400);
    assert.equal((await request("PATCH", "/9/resolver", "ADMIN", { estado: "PENDIENTE", respuesta: "Hola mundo" }, 1)).status, 400);
    assert.equal(db.estado.solicitudes[9].estado, "PENDIENTE");
    assert.equal((await request("PATCH", "/10/resolver", "ADMIN", RESOLUCION, 1)).status, 200);
  });
});

test("HTTP docente: si falla el aviso no queda resuelta la solicitud (misma transacción)", async () => {
  const db = dbResolver();
  db.notificacion.createMany = async () => { throw new Error("falla notificacion"); };
  await conAPI(db, async (request) => {
    assert.equal((await request("PATCH", "/9/resolver", "DOCENTE", RESOLUCION)).status, 500);
  });
  assert.equal(db.estado.solicitudes[9].estado, "PENDIENTE");
});

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterRevisiones } from "../src/routes/revisiones.js";
import { validarIdEvaluacion, validarSolicitudRevision } from "../src/services/revisiones.js";

const valida = () => ({ evaluacionId: 5, motivo: "  La nota no coincide con la grilla   de corrección publicada.  " });

// ---------- Validación (sin DB) ----------

test("valida y normaliza el motivo", () => {
  const solicitud = validarSolicitudRevision(valida());
  assert.equal(solicitud.evaluacionId, 5);
  assert.equal(solicitud.motivo, "La nota no coincide con la grilla de corrección publicada.");
});

test("rechaza datos faltantes o inválidos", () => {
  const casos = [
    null, [], {},
    { ...valida(), evaluacionId: 0 }, { ...valida(), evaluacionId: "abc" }, { ...valida(), evaluacionId: 1.5 },
    { ...valida(), motivo: "" }, { ...valida(), motivo: "   " }, { ...valida(), motivo: 5 },
    { ...valida(), motivo: "muy corto" },
    { ...valida(), motivo: "a".repeat(1001) },
  ];
  for (const body of casos) assert.throws(() => validarSolicitudRevision(body), (e) => e.status === 400, JSON.stringify(body));
});

test("validarIdEvaluacion: solo enteros positivos", () => {
  assert.equal(validarIdEvaluacion("7"), 7);
  for (const id of ["0", "-1", "1.5", "abc"]) assert.throws(() => validarIdEvaluacion(id), (e) => e.status === 400);
});

// ---------- Contrato HTTP (DB simulada) ----------

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/revisiones", crearRouterRevisiones(db));
  app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol, body) => fetch(`http://127.0.0.1:${server.address().port}/api/revisiones${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id: 2, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP: exige login y rol ALUMNO", async () => {
  await conAPI({}, async (request) => {
    assert.equal((await request("GET", "/mis-solicitudes", null)).status, 401);
    for (const rol of ["DOCENTE", "ADMIN"]) {
      assert.equal((await request("GET", "/mis-solicitudes", rol)).status, 403);
      assert.equal((await request("POST", "/", rol, valida())).status, 403);
    }
  });
});

// DB falsa: la evaluación 5 es del alumno 2 (Ana Díaz) en la materia 3, que dictan los docentes 7 y 8.
// $transaction restaura lo guardado si algo falla (como un rollback).
function dbSolicitud({ docentes = [7, 8], pendiente = null, fallaAviso = false } = {}) {
  const estado = { solicitudes: [], notificaciones: [], consultaDocentes: null };
  const creada = (data) => ({
    id: 1, motivo: data.motivo, estado: "PENDIENTE", creadoEn: new Date(),
    evaluacion: { id: 5, tipo: "PARCIAL", nota: 4, fecha: new Date("2026-05-12T00:00:00Z"), cursada: { materia: { nombre: "Base de Datos", codigo: "BD1" } } },
  });
  const db = {
    estado,
    evaluacion: { findFirst: async () => ({
      id: 5, tipo: "PARCIAL", nota: 4, fecha: new Date("2026-05-12T00:00:00Z"),
      cursada: { materia: { id: 3, nombre: "Base de Datos" }, alumno: { nombre: "Ana", apellido: "Díaz" } },
    }) },
    solicitudRevision: { findFirst: async () => pendiente, create: async ({ data }) => { estado.solicitudes.push(data); return creada(data); } },
    materiaDocente: { findMany: async ({ where }) => { estado.consultaDocentes = where; return docentes.map((docenteId) => ({ docenteId })); } },
    notificacion: { createMany: async ({ data }) => {
      if (fallaAviso) throw new Error("falla notificacion");
      estado.notificaciones.push(...data); return { count: data.length };
    } },
  };
  db.$transaction = async (fn) => {
    const copia = { solicitudes: [...estado.solicitudes], notificaciones: [...estado.notificaciones] };
    try { return await fn(db); } catch (e) { Object.assign(estado, copia); throw e; }
  };
  return db;
}

test("HTTP: crea la solicitud cuando la evaluación es del alumno", async () => {
  await conAPI(dbSolicitud(), async (request) => {
    const r = await request("POST", "/", "ALUMNO", valida());
    assert.equal(r.status, 201);
    assert.equal((await r.json()).evaluacion.materia.codigo, "BD1");
  });
});

test("HTTP: al pedir la revisión, los docentes de la materia reciben la notificación con los datos del reclamo", async () => {
  const db = dbSolicitud();
  await conAPI(db, async (request) => {
    assert.equal((await request("POST", "/", "ALUMNO", valida())).status, 201);
  });
  assert.deepEqual(db.estado.consultaDocentes, { materiaId: 3 }, "solo los docentes de ESA materia");
  assert.deepEqual(db.estado.notificaciones.map((n) => n.usuarioId), [7, 8]);
  for (const n of db.estado.notificaciones) {
    assert.equal(n.tipo, "SOLICITUD_REVISION");
    assert.equal(n.materiaId, 3);
    assert.equal(n.autorId, 2, "figura el alumno que la pidió (sale del token)");
    assert.equal(n.titulo, "Solicitud de revisión en Base de Datos");
    assert.equal(n.mensaje, "Ana Díaz pidió la revisión de su parcial del 12/5/2026 (nota 4). Motivo: La nota no coincide con la grilla de corrección publicada.");
  }
});

test("HTTP: sin docentes asignados la solicitud se crea igual, sin avisar a nadie", async () => {
  const db = dbSolicitud({ docentes: [] });
  await conAPI(db, async (request) => {
    assert.equal((await request("POST", "/", "ALUMNO", valida())).status, 201);
  });
  assert.equal(db.estado.solicitudes.length, 1);
  assert.equal(db.estado.notificaciones.length, 0);
});

test("HTTP: un motivo larguísimo se acorta en el aviso sin romper la solicitud", async () => {
  const db = dbSolicitud();
  await conAPI(db, async (request) => {
    assert.equal((await request("POST", "/", "ALUMNO", { evaluacionId: 5, motivo: "a".repeat(1000) })).status, 201);
  });
  const mensaje = db.estado.notificaciones[0].mensaje;
  assert.equal(mensaje.length, 1000);
  assert.ok(mensaje.endsWith("…"));
});

test("HTTP: si falla el aviso no queda guardada la solicitud (misma transacción)", async () => {
  const db = dbSolicitud({ fallaAviso: true });
  await conAPI(db, async (request) => {
    assert.equal((await request("POST", "/", "ALUMNO", valida())).status, 500);
  });
  assert.equal(db.estado.solicitudes.length, 0);
  assert.equal(db.estado.notificaciones.length, 0);
});

test("HTTP: rechaza evaluación ajena, solicitud duplicada y datos inválidos, sin avisar", async () => {
  await conAPI({ evaluacion: { findFirst: async () => null } }, async (request) => {
    assert.equal((await request("POST", "/", "ALUMNO", valida())).status, 404);
    assert.equal((await request("POST", "/", "ALUMNO", { evaluacionId: 0 })).status, 400);
  });
  const db = dbSolicitud({ pendiente: { id: 9 } });
  await conAPI(db, async (request) => {
    assert.equal((await request("POST", "/", "ALUMNO", valida())).status, 409);
    assert.equal((await request("POST", "/", "ALUMNO", { evaluacionId: 5, motivo: "corto" })).status, 400);
  });
  assert.equal(db.estado.notificaciones.length, 0);
});

test("HTTP: lista mis solicitudes más recientes primero", async () => {
  const solicitudes = [{ id: 2, motivo: "x", estado: "PENDIENTE", creadoEn: new Date(), evaluacion: { id: 6, tipo: "FINAL", nota: 5, fecha: new Date(), cursada: { materia: { nombre: "Programación I", codigo: "PROG1" } } } }];
  await conAPI({ solicitudRevision: { findMany: async (args) => { assert.deepEqual(args.orderBy, { creadoEn: "desc" }); return solicitudes; } } }, async (request) => {
    const r = await request("GET", "/mis-solicitudes", "ALUMNO");
    assert.equal(r.status, 200);
    assert.equal((await r.json())[0].evaluacion.materia.codigo, "PROG1");
  });
});

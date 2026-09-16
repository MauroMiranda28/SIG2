import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterPlanes } from "../src/routes/planes.js";
import { resolverPlanAlumno, validarPlan } from "../src/services/planes.js";

const valido = () => ({ nombre: " Plan 2026 ", anio: 2026, carreraId: 1, materias: [
  { nombre: " Programación I ", codigo: " prog26 ", anio: 1, cuatrimestre: 1, cargaHoraria: 96 },
] });

test("normaliza datos y permite crear un plan vacío", () => {
  const plan = validarPlan(valido());
  assert.equal(plan.nombre, "Plan 2026"); assert.equal(plan.materias[0].codigo, "PROG26");
  assert.equal(validarPlan({ ...valido(), materias: [] }).materias.length, 0);
});
test("rechaza datos inválidos y códigos repetidos antes de acceder a DB", () => {
  const casos = [{ nombre: " " }, { anio: 1.5 }, { carreraId: 0 }, { vigente: "true" }, { materias: {} }, { materias: [null] }, { materias: [{ ...valido().materias[0], cuatrimestre: 3 }] }, { materias: [{ ...valido().materias[0], cargaHoraria: -1 }] }, { materias: [valido().materias[0], { ...valido().materias[0], codigo: "PROG26" }] }];
  for (const cambio of casos) assert.throws(() => validarPlan({ ...valido(), ...cambio }), e => e.status === 400);
});
function dbAlumno(alumno, planes = [], asignado = null) {
  return { usuario: { findUnique: async () => alumno }, planEstudio: { findMany: async () => planes, findUnique: async () => asignado } };
}
test("consulta plan explícito aunque no sea vigente", async () => {
  assert.equal(await resolverPlanAlumno(dbAlumno({ carreraId: 1, planEstudioId: 9 }, [], { id: 9, carreraId: 1, vigente: false }), 2), 9);
});
test("compatibilidad: usa el único plan vigente de la carrera", async () => {
  assert.equal(await resolverPlanAlumno(dbAlumno({ carreraId: 1 }, [{ id: 3 }]), 2), 3);
});
test("no elige arbitrariamente entre dos versiones", async () => {
  await assert.rejects(resolverPlanAlumno(dbAlumno({ carreraId: 1 }, [{ id: 3 }, { id: 4 }]), 2), e => e.status === 409);
});
test("maneja usuario inexistente, sin carrera y sin plan", async () => {
  for (const [alumno, status] of [[null, 401], [{ carreraId: null }, 404], [{ carreraId: 1 }, 404]]) {
    await assert.rejects(resolverPlanAlumno(dbAlumno(alumno), 2), e => e.status === status);
  }
});
test("rechaza un plan asignado de otra carrera", async () => {
  await assert.rejects(resolverPlanAlumno(dbAlumno({ carreraId: 1, planEstudioId: 9 }, [], { id: 9, carreraId: 2 }), 2), e => e.status === 409);
});

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/planes", crearRouterPlanes(db));
  app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const request = (ruta, rol, body, id = 2) => fetch(`http://127.0.0.1:${server.address().port}/api/planes${ruta}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise(resolve => server.close(resolve)); }
}
test("HTTP: exige login y deniega creación a alumno y docente", async () => {
  await conAPI({}, async request => {
    assert.equal((await request("/", null, valido())).status, 401);
    for (const rol of ["ALUMNO", "DOCENTE"]) assert.equal((await request("/", rol, valido())).status, 403);
    assert.equal((await request("/mi-plan", "ADMIN")).status, 403);
    assert.equal((await request("/carreras", "ALUMNO")).status, 403);
  });
});
test("HTTP: crea plan y materias con escritura anidada en transacción serializable", async () => {
  let recibido;
  const tx = { carrera: { findUnique: async () => ({ vigente: true }) }, planEstudio: { findFirst: async () => null, create: async args => { recibido = args; return { id: 7, ...args.data }; } } };
  await conAPI({ $transaction: async (fn, opts) => { assert.equal(opts.isolationLevel, "Serializable"); return fn(tx); } }, async request => {
    const r = await request("/", "ADMIN", valido()); assert.equal(r.status, 201);
    assert.equal((await r.json()).id, 7); assert.equal(recibido.data.materias.create[0].codigo, "PROG26");
  });
});
test("HTTP: rechaza carrera inactiva y plan duplicado", async () => {
  for (const [vigente, duplicado, status] of [[false, null, 400], [true, { id: 1 }, 409]]) {
    const tx = { carrera: { findUnique: async () => ({ vigente }) }, planEstudio: { findFirst: async () => duplicado, create: async () => assert.fail("No debe guardar") } };
    await conAPI({ $transaction: fn => fn(tx) }, async request => assert.equal((await request("/", "ADMIN", valido())).status, status));
  }
});
test("HTTP: códigos existentes y conflictos de concurrencia retornan 409", async () => {
  for (const code of ["P2002", "P2034"]) await conAPI({ $transaction: async () => { throw { code }; } }, async request => {
    assert.equal((await request("/", "ADMIN", valido())).status, 409);
  });
});
test("HTTP: consulta usa identidad JWT e incluye todas las materias sin filtrar aprobadas", async () => {
  const materias = [{ id: 10, nombre: "Programación" }, { id: 11, nombre: "Álgebra" }];
  const db = { usuario: { findUnique: async args => { assert.equal(args.where.id, 2); return { carreraId: 1, planEstudioId: 9 }; } }, planEstudio: {
    findUnique: async args => args.include ? (assert.equal(args.include.materias.where, undefined), { id: 9, materias }) : { id: 9, carreraId: 1 },
  } };
  await conAPI(db, async request => {
    const r = await request("/mi-plan?alumnoId=999", "ALUMNO"); assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).materias, materias);
  });
});

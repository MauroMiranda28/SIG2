import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterAsistencias } from "../src/routes/asistencias.js";
import { calcularPresentismo, validarAsistencia, validarEstadoAsistencia, validarFechaAsistencia, validarIdMateria } from "../src/services/asistencias.js";

const hoy = () => new Date().toISOString().slice(0, 10);
const valida = () => ({ materiaId: 2, fecha: hoy(), estado: "PRESENTE" });

// ---------- Validación (sin DB) ----------

test("valida una asistencia completa", () => {
  const asistencia = validarAsistencia(valida());
  assert.equal(asistencia.materiaId, 2);
  assert.equal(asistencia.estado, "PRESENTE");
  assert.equal(asistencia.fecha.toISOString().slice(0, 10), hoy());
});

test("rechaza datos faltantes o inválidos", () => {
  const casos = [null, [], {}, { ...valida(), materiaId: 0 }, { ...valida(), estado: "REGULAR" }];
  for (const body of casos) assert.throws(() => validarAsistencia(body), (e) => e.status === 400, JSON.stringify(body));
});

test("validarFechaAsistencia: exige AAAA-MM-DD y no admite fechas futuras", () => {
  for (const valor of ["2026-01-01", "31-01-2026", "", 5, null]) {
    if (valor === "2026-01-01") continue;
    assert.throws(() => validarFechaAsistencia(valor), (e) => e.status === 400, JSON.stringify(valor));
  }
  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.throws(() => validarFechaAsistencia(manana), (e) => e.status === 400);
});

test("validarIdMateria y validarEstadoAsistencia", () => {
  assert.equal(validarIdMateria("3"), 3);
  for (const id of ["0", "-1", "abc"]) assert.throws(() => validarIdMateria(id), (e) => e.status === 400);
  for (const estado of ["PRESENTE", "AUSENTE", "TARDE"]) assert.equal(validarEstadoAsistencia(estado), estado);
  assert.throws(() => validarEstadoAsistencia("REGULAR"), (e) => e.status === 400);
});

test("calcularPresentismo: tarde cuenta como presente, vacío es null", () => {
  assert.equal(calcularPresentismo([]), null);
  assert.equal(calcularPresentismo([{ estado: "PRESENTE" }, { estado: "AUSENTE" }]), 50);
  assert.equal(calcularPresentismo([{ estado: "PRESENTE" }, { estado: "TARDE" }, { estado: "AUSENTE" }]), 66.7);
});

// ---------- Contrato HTTP (DB simulada) ----------

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/asistencias", crearRouterAsistencias(db));
  app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol, body) => fetch(`http://127.0.0.1:${server.address().port}/api/asistencias${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id: 2, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP: exige login y rol ALUMNO", async () => {
  await conAPI({}, async (request) => {
    assert.equal((await request("GET", "/", null)).status, 401);
    for (const rol of ["DOCENTE", "ADMIN"]) {
      assert.equal((await request("GET", "/", rol)).status, 403);
      assert.equal((await request("POST", "/", rol, valida())).status, 403);
    }
  });
});

test("HTTP: asienta la asistencia solo si el alumno está cursando esa materia", async () => {
  let datosUpsert;
  const db = {
    cursada: { findFirst: async () => ({ id: 1 }) },
    asistencia: { upsert: async (args) => { datosUpsert = args; return { id: 1, ...args.create, materia: { id: 2, nombre: "Base de Datos", codigo: "BD1" } }; } },
  };
  await conAPI(db, async (request) => {
    const r = await request("POST", "/", "ALUMNO", valida());
    assert.equal(r.status, 201);
    assert.equal(datosUpsert.create.estado, "PRESENTE");
    assert.equal((await r.json()).materia.codigo, "BD1");
  });
});

test("HTTP: rechaza materia que no está cursando", async () => {
  await conAPI({ cursada: { findFirst: async () => null } }, async (request) => {
    assert.equal((await request("POST", "/", "ALUMNO", valida())).status, 404);
  });
});

test("HTTP: lista mis asistencias con el presentismo calculado", async () => {
  const asistencias = [{ id: 1, estado: "PRESENTE", fecha: new Date(), materia: { id: 2, nombre: "Base de Datos", codigo: "BD1" } }];
  await conAPI({ asistencia: { findMany: async () => asistencias } }, async (request) => {
    const r = await request("GET", "/", "ALUMNO");
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { asistencias: JSON.parse(JSON.stringify(asistencias)), presentismo: 100 });
  });
});

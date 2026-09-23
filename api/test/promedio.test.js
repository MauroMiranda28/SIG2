import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterPromedio } from "../src/routes/promedio.js";
import { calcularPromedio, simularPromedio, validarMateriaId, validarNotaSimulada } from "../src/services/promedio.js";

// ---------- Cálculo y validación (sin DB) ----------

test("calcularPromedio: promedia y redondea a 2 decimales, null si no hay notas", () => {
  assert.equal(calcularPromedio([]), null);
  assert.equal(calcularPromedio([8]), 8);
  assert.equal(calcularPromedio([7, 8, 9]), 8);
  assert.equal(calcularPromedio([7, 8, 10]), 8.33);
});

test("simularPromedio: compara el promedio actual con el que resultaría de aprobar la pendiente", () => {
  assert.deepEqual(simularPromedio([8, 6], 10), { promedioActual: 7, promedioSimulado: 8, diferencia: 1 });
  assert.deepEqual(simularPromedio([8, 6], 4), { promedioActual: 7, promedioSimulado: 6, diferencia: -1 });
  assert.deepEqual(simularPromedio([], 9), { promedioActual: null, promedioSimulado: 9, diferencia: null });
});

test("validarNotaSimulada: acepta 0 a 10 y redondea, rechaza el resto", () => {
  assert.equal(validarNotaSimulada(7), 7);
  assert.equal(validarNotaSimulada("8.456"), 8.46);
  assert.equal(validarNotaSimulada(0), 0);
  assert.equal(validarNotaSimulada(10), 10);
  for (const valor of [-1, 10.01, "abc", null, undefined, NaN]) {
    assert.throws(() => validarNotaSimulada(valor), (e) => e.status === 400);
  }
});

test("validarMateriaId: solo enteros positivos", () => {
  assert.equal(validarMateriaId("5"), 5);
  for (const id of ["0", "-1", "1.5", "abc", null]) assert.throws(() => validarMateriaId(id), (e) => e.status === 400);
});

// ---------- Contrato HTTP (DB simulada) ----------

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/promedio", crearRouterPromedio(db));
  app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol, body) => fetch(`http://127.0.0.1:${server.address().port}/api/promedio${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id: 2, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

function dbBase({ cursadasAprobadas = [], pendientes = [], materia = null } = {}) {
  return {
    usuario: { findUnique: async () => ({ carreraId: 1, planEstudioId: null }) },
    planEstudio: { findMany: async () => [{ id: 3 }], findUnique: async () => null },
    cursada: { findMany: async () => cursadasAprobadas },
    materia: {
      findMany: async () => pendientes,
      findFirst: async () => materia,
    },
  };
}

test("HTTP: exige login y rol ALUMNO", async () => {
  await conAPI({}, async (request) => {
    assert.equal((await request("GET", "/", null)).status, 401);
    for (const rol of ["DOCENTE", "ADMIN"]) {
      assert.equal((await request("GET", "/", rol)).status, 403);
      assert.equal((await request("POST", "/simular", rol, { materiaId: 1, nota: 8 })).status, 403);
    }
  });
});

test("HTTP: GET / devuelve el promedio actual y las materias pendientes", async () => {
  const db = dbBase({
    cursadasAprobadas: [{ nota: 8 }, { nota: 6 }],
    pendientes: [{ id: 5, nombre: "Base de Datos", codigo: "BD1" }],
  });
  await conAPI(db, async (request) => {
    const r = await request("GET", "/", "ALUMNO");
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), {
      promedioActual: 7,
      materiasPendientes: [{ id: 5, nombre: "Base de Datos", codigo: "BD1" }],
    });
  });
});

test("HTTP: GET / responde promedioActual null cuando todavía no aprobó nada", async () => {
  await conAPI(dbBase(), async (request) => {
    const r = await request("GET", "/", "ALUMNO");
    assert.deepEqual((await r.json()).promedioActual, null);
  });
});

test("HTTP: POST /simular calcula el promedio hipotético", async () => {
  const db = dbBase({
    cursadasAprobadas: [{ nota: 8 }, { nota: 6 }],
    materia: { id: 5, nombre: "Base de Datos", codigo: "BD1", cursadas: [{ estado: "EN_CURSO" }] },
  });
  await conAPI(db, async (request) => {
    const r = await request("POST", "/simular", "ALUMNO", { materiaId: 5, nota: 10 });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), {
      materia: { id: 5, nombre: "Base de Datos", codigo: "BD1" },
      notaSimulada: 10,
      promedioActual: 7,
      promedioSimulado: 8,
      diferencia: 1,
    });
  });
});

test("HTTP: POST /simular rechaza materia ajena, ya aprobada o datos inválidos", async () => {
  await conAPI(dbBase({ materia: null }), async (request) => {
    assert.equal((await request("POST", "/simular", "ALUMNO", { materiaId: 999, nota: 8 })).status, 404);
    assert.equal((await request("POST", "/simular", "ALUMNO", { materiaId: 0, nota: 8 })).status, 400);
    assert.equal((await request("POST", "/simular", "ALUMNO", { materiaId: 1, nota: 11 })).status, 400);
  });
  const yaAprobada = dbBase({ materia: { id: 1, nombre: "X", codigo: "X1", cursadas: [{ estado: "APROBADA" }] } });
  await conAPI(yaAprobada, async (request) => {
    assert.equal((await request("POST", "/simular", "ALUMNO", { materiaId: 1, nota: 8 })).status, 409);
  });
});

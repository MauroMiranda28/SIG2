import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterCorrelatividades } from "../src/routes/correlatividades.js";
import {
  validarCorrelatividad, situacionRequisito, cumpleRequisito, generaCiclo, correlatividadesDelAlumno,
} from "../src/services/correlatividades.js";
import { manejarErrores } from "../src/middleware/errores.js";

const AHORA = new Date("2026-10-06T00:00:00Z");

// ---------- Reglas (sin DB) ----------

test("validarCorrelatividad: materia, requerida y tipo válidos", () => {
  assert.deepEqual(validarCorrelatividad({ materiaId: "3", requiereId: 1, tipo: "DEBIL" }), { materiaId: 3, requiereId: 1, tipo: "DEBIL" });
  for (const body of [null, {}, { materiaId: 3, requiereId: 3, tipo: "FUERTE" }, { materiaId: 3, requiereId: 1, tipo: "MEDIA" }, { materiaId: 0, requiereId: 1, tipo: "FUERTE" }]) {
    assert.throws(() => validarCorrelatividad(body), (e) => e.status === 400, JSON.stringify(body));
  }
});

test("situacionRequisito: aprobada, regular vigente o falta (regular vencida y libre = falta)", () => {
  assert.equal(situacionRequisito({ estado: "APROBADA" }, AHORA), "APROBADA");
  assert.equal(situacionRequisito({ estado: "REGULAR", regularDesde: new Date("2025-07-01T00:00:00Z") }, AHORA), "REGULAR");
  assert.equal(situacionRequisito({ estado: "REGULAR", regularDesde: new Date("2024-07-01T00:00:00Z") }, AHORA), "FALTA", "vencida");
  for (const cursada of [undefined, { estado: "EN_CURSO" }, { estado: "LIBRE" }, { estado: "PENDIENTE" }]) {
    assert.equal(situacionRequisito(cursada, AHORA), "FALTA", JSON.stringify(cursada));
  }
});

test("cumpleRequisito: fuerte exige aprobada; débil acepta regular o aprobada", () => {
  assert.equal(cumpleRequisito("FUERTE", "APROBADA"), true);
  assert.equal(cumpleRequisito("FUERTE", "REGULAR"), false);
  assert.equal(cumpleRequisito("DEBIL", "REGULAR"), true);
  assert.equal(cumpleRequisito("DEBIL", "APROBADA"), true);
  assert.equal(cumpleRequisito("DEBIL", "FALTA"), false);
});

// Correlatividades guardadas como pares [materia, requerida].
function dbGrafo(pares) {
  return { correlatividad: { findMany: async ({ where }) => pares.filter(([m]) => where.materiaId.in.includes(m)).map(([, r]) => ({ requiereId: r })) } };
}

test("generaCiclo: detecta ciclos directos e indirectos", async () => {
  const db = dbGrafo([[2, 1], [3, 2]]); // 2 requiere 1, 3 requiere 2
  assert.equal(await generaCiclo(db, 1, 2), true, "1 → 2 → 1");
  assert.equal(await generaCiclo(db, 1, 3), true, "1 → 3 → 2 → 1");
  assert.equal(await generaCiclo(db, 4, 3), false);
  assert.equal(await generaCiclo(db, 3, 1), false, "3 también puede requerir 1 directamente");
});

test("correlatividadesDelAlumno: una materia con correlativas fuertes y débiles, según el estado del alumno", async () => {
  const consultas = [];
  const db = {
    usuario: { findUnique: async (args) => { consultas.push(args.where); return { carreraId: 1, planEstudioId: 9 }; } },
    planEstudio: { findUnique: async () => ({ id: 9, carreraId: 1 }) },
    materia: {
      findMany: async (args) => {
        consultas.push(args.where);
        assert.deepEqual(args.select.cursadas.where, { alumnoId: 4 }, "las cursadas son las del alumno logueado");
        return [
          { id: 1, nombre: "Álgebra", codigo: "ALG", anio: 1, requiere: [], cursadas: [{ estado: "APROBADA" }] },
          { id: 2, nombre: "Programación I", codigo: "PROG1", anio: 1, requiere: [], cursadas: [{ estado: "REGULAR", regularDesde: new Date("2026-07-01T00:00:00Z") }] },
          { id: 3, nombre: "Física", codigo: "FIS", anio: 1, requiere: [], cursadas: [] },
          {
            id: 4, nombre: "Programación II", codigo: "PROG2", anio: 2, cursadas: [],
            requiere: [
              { tipo: "DEBIL", requiere: { id: 2, nombre: "Programación I", codigo: "PROG1" } },
              { tipo: "FUERTE", requiere: { id: 1, nombre: "Álgebra", codigo: "ALG" } },
            ],
          },
          { id: 5, nombre: "Física II", codigo: "FIS2", anio: 2, cursadas: [], requiere: [{ tipo: "DEBIL", requiere: { id: 3, nombre: "Física", codigo: "FIS" } }] },
          { id: 6, nombre: "Algoritmos", codigo: "ALGO", anio: 2, cursadas: [], requiere: [{ tipo: "FUERTE", requiere: { id: 2, nombre: "Programación I", codigo: "PROG1" } }] },
        ];
      },
    },
  };

  const materias = await correlatividadesDelAlumno(db, 4, AHORA);
  assert.deepEqual(consultas[0], { id: 4 });
  const por = Object.fromEntries(materias.map((m) => [m.codigo, m]));

  assert.equal(por.ALG.puedeCursar, true, "sin correlativas");
  assert.equal(por.PROG2.puedeCursar, true, "fuerte aprobada + débil regular");
  assert.deepEqual(por.PROG2.requisitos.map((r) => [r.tipo, r.materia.codigo, r.situacion, r.cumple]),
    [["FUERTE", "ALG", "APROBADA", true], ["DEBIL", "PROG1", "REGULAR", true]], "fuertes primero");
  assert.equal(por.FIS2.puedeCursar, false, "débil sin regularizar");
  assert.equal(por.ALGO.puedeCursar, false, "fuerte que solo está regular");
  assert.equal("cursadas" in por.ALG, false);
});

// ---------- Contrato HTTP (DB simulada) ----------

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/correlatividades", crearRouterCorrelatividades(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol, body) => fetch(`http://127.0.0.1:${server.address().port}/api/correlatividades${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id: 1, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP: el alumno consulta; solo ADMIN carga, cambia o quita", async () => {
  await conAPI({}, async (request) => {
    assert.equal((await request("GET", "/", null)).status, 401);
    for (const rol of ["DOCENTE", "ADMIN"]) assert.equal((await request("GET", "/", rol)).status, 403, rol);
    for (const rol of ["ALUMNO", "DOCENTE"]) {
      assert.equal((await request("GET", "/planes", rol)).status, 403);
      assert.equal((await request("POST", "/", rol, { materiaId: 2, requiereId: 1, tipo: "FUERTE" })).status, 403);
      assert.equal((await request("PATCH", "/1", rol, { tipo: "DEBIL" })).status, 403);
      assert.equal((await request("DELETE", "/1", rol)).status, 403);
    }
  });
});

function dbAdmin({ materias = [{ id: 2, planId: 9 }, { id: 1, planId: 9 }], existente = null, pares = [] } = {}) {
  const creadas = [];
  return {
    creadas,
    materia: { findMany: async () => materias },
    correlatividad: {
      findUnique: async () => existente,
      findMany: dbGrafo(pares).correlatividad.findMany,
      create: async ({ data }) => { creadas.push(data); return { id: 7, ...data }; },
    },
  };
}

test("HTTP: ADMIN agrega una correlativa válida", async () => {
  const db = dbAdmin();
  await conAPI(db, async (request) => {
    const r = await request("POST", "/", "ADMIN", { materiaId: 2, requiereId: 1, tipo: "DEBIL" });
    assert.equal(r.status, 201);
  });
  assert.deepEqual(db.creadas, [{ materiaId: 2, requiereId: 1, tipo: "DEBIL" }]);
});

test("HTTP: rechaza materias de otro plan, inexistentes, repetidas o que arman un ciclo", async () => {
  const casos = [
    [dbAdmin({ materias: [{ id: 2, planId: 9 }, { id: 1, planId: 8 }] }), 400, /mismo plan/],
    [dbAdmin({ materias: [{ id: 2, planId: 9 }] }), 404, /no existe/],
    [dbAdmin({ existente: { id: 3 } }), 409, /ya existe/],
    [dbAdmin({ pares: [[1, 2]] }), 400, /ya necesita/],
  ];
  for (const [db, status, mensaje] of casos) {
    await conAPI(db, async (request) => {
      const r = await request("POST", "/", "ADMIN", { materiaId: 2, requiereId: 1, tipo: "FUERTE" });
      assert.equal(r.status, status);
      assert.match((await r.json()).error, mensaje);
    });
    assert.equal(db.creadas.length, 0);
  }
});

test("HTTP: ADMIN cambia el tipo o quita; 404 si no existe", async () => {
  let actualizado, borrado;
  const db = {
    correlatividad: {
      findUnique: async ({ where }) => (where.id === 7 ? { id: 7 } : null),
      update: async (args) => { actualizado = args; return { id: 7, tipo: args.data.tipo }; },
      delete: async (args) => { borrado = args.where; },
    },
  };
  await conAPI(db, async (request) => {
    assert.equal((await request("PATCH", "/7", "ADMIN", { tipo: "DEBIL" })).status, 200);
    assert.equal((await request("PATCH", "/7", "ADMIN", { tipo: "OTRO" })).status, 400);
    assert.equal((await request("PATCH", "/8", "ADMIN", { tipo: "DEBIL" })).status, 404);
    assert.equal((await request("DELETE", "/7", "ADMIN")).status, 200);
    assert.equal((await request("DELETE", "/8", "ADMIN")).status, 404);
  });
  assert.deepEqual(actualizado.data, { tipo: "DEBIL" });
  assert.deepEqual(borrado, { id: 7 });
});

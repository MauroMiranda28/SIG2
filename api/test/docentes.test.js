import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterDocentes } from "../src/routes/docentes.js";
import { verificarAccesoMateria, validarBloqueHorario, validarId } from "../src/services/docentes.js";
import { manejarErrores } from "../src/middleware/errores.js";

// ---------- Acceso a materias asignadas (Seg-05) ----------

function dbAcceso({ materia = { id: 5, nombre: "Programación I", codigo: "PROG1" }, asignada = false } = {}) {
  const llamadas = [];
  return {
    llamadas,
    materia: { findUnique: async () => materia },
    materiaDocente: { findUnique: async (args) => { llamadas.push(args.where); return asignada ? { materiaId: 5 } : null; } },
  };
}

test("acceso: el docente asignado puede, se busca la asignación con su propio id", async () => {
  const db = dbAcceso({ asignada: true });
  assert.equal((await verificarAccesoMateria(db, { id: 7, rol: "DOCENTE" }, 5)).id, 5);
  assert.deepEqual(db.llamadas[0], { materiaId_docenteId: { materiaId: 5, docenteId: 7 } });
});

test("acceso: un docente NO asignado recibe 403", async () => {
  await assert.rejects(verificarAccesoMateria(dbAcceso(), { id: 7, rol: "DOCENTE" }, 5), (e) => e.status === 403);
});

test("acceso: ADMIN puede en cualquier materia sin consultar asignaciones", async () => {
  const db = dbAcceso();
  await verificarAccesoMateria(db, { id: 1, rol: "ADMIN" }, 5);
  assert.equal(db.llamadas.length, 0);
});

test("acceso: alumno o usuario sin rol reciben 403; materia inexistente 404", async () => {
  for (const usuario of [{ id: 2, rol: "ALUMNO" }, undefined]) {
    await assert.rejects(verificarAccesoMateria(dbAcceso({ asignada: true }), usuario, 5), (e) => e.status === 403);
  }
  await assert.rejects(verificarAccesoMateria(dbAcceso({ materia: null }), { id: 7, rol: "DOCENTE" }, 5), (e) => e.status === 404);
});

// ---------- Validación de bloques horarios ----------

const bloque = () => ({ comisionId: 1, dia: "LUNES", horaInicio: "18:00", horaFin: "20:00", aulaId: 2 });

test("bloque: acepta uno válido y aula opcional", () => {
  assert.deepEqual(validarBloqueHorario(bloque()), bloque());
  assert.equal(validarBloqueHorario({ ...bloque(), aulaId: "" }).aulaId, null);
});

test("bloque: rechaza datos inválidos", () => {
  const casos = [null, [], { ...bloque(), comisionId: 0 }, { ...bloque(), dia: "DOMINGO" }, { ...bloque(), horaInicio: "8:00" },
    { ...bloque(), horaFin: "24:00" }, { ...bloque(), horaInicio: "20:00", horaFin: "18:00" }, { ...bloque(), horaFin: "18:00" }, { ...bloque(), aulaId: -1 }];
  for (const body of casos) assert.throws(() => validarBloqueHorario(body), (e) => e.status === 400, JSON.stringify(body));
});

test("validarId: solo enteros positivos", () => {
  assert.equal(validarId("3"), 3);
  for (const v of ["0", "abc", "1.5", "-2"]) assert.throws(() => validarId(v), (e) => e.status === 400);
});

// ---------- HTTP: GET /api/docentes/mis-materias ----------

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/docentes", crearRouterDocentes(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (ruta, rol, id = 7) => fetch(`http://127.0.0.1:${server.address().port}/api/docentes${ruta}`, {
    headers: rol ? { Authorization: `Bearer ${jwt.sign({ id, rol }, process.env.JWT_SECRET)}` } : {},
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP: mis-materias exige login y rol DOCENTE", async () => {
  await conAPI({}, async (request) => {
    assert.equal((await request("/mis-materias", null)).status, 401);
    for (const rol of ["ALUMNO", "ADMIN"]) assert.equal((await request("/mis-materias", rol)).status, 403);
    assert.equal((await request("/aulas", "ALUMNO")).status, 403);
  });
});

test("HTTP: mis-materias filtra por el docente del token e ignora ?docenteId", async () => {
  let where;
  const db = { materia: { findMany: async (args) => { where = args.where; return [
    { id: 5, nombre: "Programación I", programaUrl: "materia-5.pdf", programa: { vigente: true }, comisiones: [] },
    { id: 6, nombre: "Bases de Datos", programaUrl: null, programa: null, comisiones: [] },
  ]; } } };
  await conAPI(db, async (request) => {
    const r = await request("/mis-materias?docenteId=999", "DOCENTE", 7);
    assert.equal(r.status, 200);
    assert.deepEqual(where, { docentes: { some: { docenteId: 7 } } });
    const [conPdf, sinPdf] = await r.json();
    assert.equal(conPdf.tienePdf, true); assert.equal(conPdf.tieneProgramaTexto, true);
    assert.equal(sinPdf.tienePdf, false); assert.equal(sinPdf.tieneProgramaTexto, false);
    assert.equal("programaUrl" in conPdf, false, "no expone el nombre del archivo en el servidor");
  });
});

test("HTTP: un error interno no filtra detalles al cliente", async () => {
  const db = { materia: { findMany: async () => { throw new Error("Invalid `prisma` invocation: passwordHash: \"$2a$10$secreto\""); } } };
  const original = console.error; console.error = () => {};
  try {
    await conAPI(db, async (request) => {
      const r = await request("/mis-materias", "DOCENTE");
      assert.equal(r.status, 500);
      const { error } = await r.json();
      assert.doesNotMatch(error, /prisma|passwordHash|\$2a\$/);
    });
  } finally { console.error = original; }
});

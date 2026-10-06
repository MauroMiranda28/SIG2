import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterProgramas } from "../src/routes/programas.js";
import materiasRouter from "../src/routes/materias.js";
import { prisma } from "../src/db.js";

const valido = { materiaId: 4, contenidos: " Unidad 1\nIntroducción ", bibliografia: " Libro de prueba " };
async function conAPI(db, fn, consultaExistente = false) {
  process.env.JWT_SECRET = "programas-pruebas-locales";
  const app = express(); app.use(express.json());
  app.use("/api/programas", crearRouterProgramas(db));
  if (consultaExistente) app.use("/api/materias", materiasRouter);
  app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const request = (ruta, rol, body) => fetch(`http://127.0.0.1:${server.address().port}/api${ruta}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id: 2, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise(resolve => server.close(resolve)); }
}
test("sin login y con rol alumno/docente no se puede cargar ni listar el catálogo administrativo", async () => {
  await conAPI({}, async request => {
    for (const [rol, status] of [[null, 401], ["ALUMNO", 403], ["DOCENTE", 403]]) {
      assert.equal((await request("/programas", rol, valido)).status, status);
      assert.equal((await request("/programas/materias", rol)).status, status);
    }
  });
});
test("catálogo para ADMIN no requiere carrera asignada y distingue carrera y plan", async () => {
  const items = [{ id: 4, nombre: "Programación", plan: { nombre: "Plan 2026", carrera: { nombre: "Informática" } }, programa: null }];
  await conAPI({ materia: { findMany: async args => { assert.equal(args.where, undefined); assert.ok(args.select.plan); return items; } } }, async request => {
    const r = await request("/programas/materias", "ADMIN"); assert.equal(r.status, 200); assert.deepEqual(await r.json(), items);
  });
});
test("ADMIN publica contenidos multilínea, opcional bibliografía, vigencia y versión impuestas por servidor", async () => {
  let data;
  const db = { materia: { findUnique: async () => ({ id: 4 }) }, programa: { create: async args => { data = args.data; return { id: 10, ...data }; } } };
  await conAPI(db, async request => {
    const r = await request("/programas", "ADMIN", { ...valido, vigente: false, version: 999 });
    assert.equal(r.status, 201); assert.equal(data.contenidos, "Unidad 1\nIntroducción"); assert.equal(data.bibliografia, "Libro de prueba");
    assert.equal(data.vigente, true); assert.equal(data.version, 1);
    assert.equal((await request("/programas", "ADMIN", { ...valido, bibliografia: "   " })).status, 201);
    assert.equal(data.bibliografia, null);
  });
});
test("validación rechaza contenido vacío, tipos incorrectos, excesos de tamaño e IDs inválidos", async () => {
  await conAPI({}, async request => {
    for (const cambios of [{ materiaId: "4" }, { materiaId: -1 }, { materiaId: 1.2 }, { contenidos: "  " }, { contenidos: {} }, { contenidos: "a".repeat(20001) }, { bibliografia: [] }, { bibliografia: "a".repeat(10001) }]) {
      assert.equal((await request("/programas", "ADMIN", { ...valido, ...cambios })).status, 400);
    }
  });
});
test("materia inexistente produce 404 sin escribir", async () => {
  await conAPI({ materia: { findUnique: async () => null } }, async request => assert.equal((await request("/programas", "ADMIN", valido)).status, 404));
});
test("programa duplicado produce 409, incluyendo carreras simultáneas, sin reemplazar contenido", async () => {
  const db = { materia: { findUnique: async () => ({ id: 4 }) }, programa: { create: async () => { throw { code: "P2002" }; } } };
  await conAPI(db, async request => assert.equal((await request("/programas", "ADMIN", valido)).status, 409));
});
test("borrado concurrente de materia se informa como 404", async () => {
  const db = { materia: { findUnique: async () => ({ id: 4 }) }, programa: { create: async () => { throw { code: "P2003" }; } } };
  await conAPI(db, async request => assert.equal((await request("/programas", "ADMIN", valido)).status, 404));
});
test("programa creado queda disponible para ALUMNO en la ruta de lectura existente", async () => {
  let guardado;
  const original = prisma.materia.findUnique;
  const db = { materia: { findUnique: async () => ({ id: 4 }) }, programa: { create: async ({ data }) => (guardado = { id: 7, ...data }) } };
  prisma.materia.findUnique = async () => ({ nombre: "Programación", codigo: "P1", programa: guardado });
  try {
    await conAPI(db, async request => {
      assert.equal((await request("/programas", "ADMIN", valido)).status, 201);
      const r = await request("/materias/4/programa", "ALUMNO");
      assert.equal(r.status, 200); assert.equal((await r.json()).programa.contenidos, "Unidad 1\nIntroducción");
    }, true);
  } finally { prisma.materia.findUnique = original; }
});

test("cargar texto no modifica ni elimina el PDF existente de la materia", async () => {
  let datos;
  const db = {
    materia: { findUnique: async () => ({ id: 4, programaUrl: "existente.pdf" }), update: async () => assert.fail("No debe cambiar el archivo PDF") },
    programa: { create: async ({ data }) => { datos = data; return { id: 8, ...data }; } },
  };
  await conAPI(db, async request => {
    assert.equal((await request("/programas", "ADMIN", valido)).status, 201);
    assert.equal(datos.materiaId, 4);
    assert.equal(datos.programaUrl, undefined);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterCarreras } from "../src/routes/carreras.js";
import { manejarErrores } from "../src/middleware/errores.js";

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "mi-carrera-pruebas";
  const app = express(); app.use(express.json()); app.use("/api/carreras", crearRouterCarreras(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const request = (rol = "ALUMNO", ruta = "/mi-carrera", extras = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/carreras${ruta}`, {
    headers: rol ? { Authorization: `Bearer ${jwt.sign({ id: 8, rol, ...extras }, process.env.JWT_SECRET)}` } : {},
  });
  try { await fn(request); } finally { await new Promise(resolve => server.close(resolve)); }
}
const carrera = { id: 2, nombre: "Ingeniería en Informática", codigo: "INF", descripcion: "Primera línea\nSegunda línea", vigente: true };

test("mi-carrera exige sesión y rol ALUMNO", async () => {
  await conAPI({}, async request => {
    for (const [rol, status] of [[null, 401], ["ADMIN", 403], ["DOCENTE", 403]]) assert.equal((await request(rol)).status, status);
  });
});
test("consulta por usuario del token; ignora carreraId ajeno y datos antiguos del JWT", async () => {
  const db = { usuario: { findUnique: async args => {
    assert.deepEqual(args.where, { id: 8 });
    assert.deepEqual(args.select, { carrera: { select: { id: true, nombre: true, codigo: true, descripcion: true, vigente: true } } });
    return { carrera };
  } } };
  await conAPI(db, async request => {
    const r = await request("ALUMNO", "/mi-carrera?carreraId=99&alumnoId=99", { carreraId: 99 });
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), carrera);
  });
});
test("alumno sin carrera recibe 404 descriptivo", async () => {
  await conAPI({ usuario: { findUnique: async () => ({ carrera: null }) } }, async request => {
    const r = await request(); assert.equal(r.status, 404); assert.match((await r.json()).error, /asignada/);
  });
});
test("usuario eliminado recibe 401", async () => {
  await conAPI({ usuario: { findUnique: async () => null } }, async request => assert.equal((await request()).status, 401));
});
test("permite consultar la carrera asignada aunque no esté vigente y sin descripción", async () => {
  const datos = { ...carrera, vigente: false, descripcion: null };
  await conAPI({ usuario: { findUnique: async () => ({ carrera: datos }) } }, async request => {
    const r = await request(); assert.equal(r.status, 200); assert.deepEqual(await r.json(), datos);
  });
});
test("el alumno no obtiene el listado administrativo de carreras", async () => {
  await conAPI({}, async request => assert.equal((await request("ALUMNO", "/")).status, 403));
});
test("no filtra detalles internos si falla la base", async () => {
  const original = console.error; console.error = () => {};
  try {
    await conAPI({ usuario: { findUnique: async () => { throw new Error("detalle-privado-db"); } } }, async request => {
      const r = await request(); assert.equal(r.status, 500); assert.doesNotMatch(JSON.stringify(await r.json()), /detalle-privado-db/);
    });
  } finally { console.error = original; }
});

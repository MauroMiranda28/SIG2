import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterCarreras } from "../src/routes/carreras.js";
import { manejarErrores } from "../src/middleware/errores.js";
async function conAPI(db, fn) {
  process.env.JWT_SECRET = "pruebas-estado-carrera";
  const app = express(); app.use(express.json()); app.use("/carreras", crearRouterCarreras(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r));
  const request = (id = "3", body = { vigente: false }, rol = "ADMIN") => fetch(`http://127.0.0.1:${server.address().port}/carreras/${id}/estado`, {
    method: "PUT", headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id: 1, rol }, process.env.JWT_SECRET)}` } : {}) }, body: JSON.stringify(body),
  });
  try { await fn(request); } finally { await new Promise(r => server.close(r)); }
}
test("estado de carrera exige sesión y rol ADMIN", async () => {
  await conAPI({}, async request => {
    for (const [rol, status] of [[null, 401], ["ALUMNO", 403], ["DOCENTE", 403]]) assert.equal((await request("3", { vigente: false }, rol)).status, status);
  });
});
test("rechaza IDs inválidos antes de acceder a la base", async () => {
  await conAPI({}, async request => {
    for (const id of ["abc", "3abc", "0", "-1", "1.5", "2147483648"]) assert.equal((await request(id)).status, 400);
  });
});
test("requiere booleano explícito y rechaza campos ajenos", async () => {
  await conAPI({}, async request => {
    for (const body of [{}, [], { vigente: "false" }, { vigente: 0 }, { vigente: null }, { vigente: false, nombre: "otro" }]) assert.equal((await request("3", body)).status, 400);
  });
});
test("baja lógica conserva todos los datos y relaciones y permite repetir y reactivar", async () => {
  let carrera = { id: 3, nombre: "Informática", codigo: "INF", descripcion: "Descripción", vigente: true, _count: { planes: 2, usuarios: 8 } };
  const original = structuredClone(carrera);
  // No hay métodos delete ni actualizaciones de relaciones: cualquier intento fallaría.
  const db = { carrera: { update: async ({ where, data }) => {
    assert.deepEqual(where, { id: 3 }); assert.deepEqual(Object.keys(data), ["vigente"]);
    carrera = { ...carrera, ...data }; return carrera;
  } } };
  await conAPI(db, async request => {
    for (const vigente of [false, false, true]) {
      const r = await request("3", { vigente }); assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ...original, vigente });
    }
  });
});
test("carrera inexistente devuelve 404 y no 500", async () => {
  await conAPI({ carrera: { update: async () => { throw { code: "P2025" }; } } }, async request => {
    const r = await request(); assert.equal(r.status, 404); assert.match((await r.json()).error, /no existe/);
  });
});
test("errores internos no revelan detalles de la base", async () => {
  const anterior = console.error; console.error = () => {};
  try {
    await conAPI({ carrera: { update: async () => { throw new Error("secreto-db"); } } }, async request => {
      const r = await request(); assert.equal(r.status, 500); assert.doesNotMatch(JSON.stringify(await r.json()), /secreto-db/);
    });
  } finally { console.error = anterior; }
});

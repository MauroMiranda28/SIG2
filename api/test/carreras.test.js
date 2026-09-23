import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterCarreras } from "../src/routes/carreras.js";
import { validarCarrera, validarCambiosCarrera, validarIdCarrera, buscarDuplicado } from "../src/services/carreras.js";

const valida = () => ({ nombre: "  Licenciatura   en Sistemas ", codigo: " lsi-2026 ", descripcion: "  Carrera de grado.  " });

// ---------- Validación (sin DB) ----------

test("registrar: normaliza nombre, código y descripción", () => {
  assert.deepEqual(validarCarrera(valida()), { nombre: "Licenciatura en Sistemas", codigo: "LSI-2026", descripcion: "Carrera de grado." });
  assert.equal(validarCarrera({ nombre: "X", codigo: "X" }).descripcion, null);
  assert.equal(validarCarrera({ ...valida(), descripcion: "   " }).descripcion, null);
});

test("registrar: rechaza datos faltantes, inválidos o campos que no corresponden", () => {
  const casos = [
    null, [], {},
    { ...valida(), nombre: " " }, { ...valida(), nombre: 5 }, { ...valida(), nombre: "a".repeat(161) },
    { ...valida(), codigo: "" }, { ...valida(), codigo: "con espacio" }, { ...valida(), codigo: "A".repeat(21) }, { ...valida(), codigo: "-LSI" },
    { ...valida(), descripcion: 3 }, { ...valida(), descripcion: "a".repeat(1001) },
    { ...valida(), vigente: false }, { ...valida(), id: 99 },
  ];
  for (const body of casos) assert.throws(() => validarCarrera(body), (e) => e.status === 400, JSON.stringify(body));
});

test("modificar: valida solo lo enviado y exige al menos un cambio", () => {
  assert.deepEqual(validarCambiosCarrera({ nombre: " Nueva " }), { nombre: "Nueva" });
  assert.deepEqual(validarCambiosCarrera({ descripcion: "" }), { descripcion: null });
  for (const body of [{}, null, { vigente: true }, { nombre: "" }, { codigo: "no válido" }]) {
    assert.throws(() => validarCambiosCarrera(body), (e) => e.status === 400, JSON.stringify(body));
  }
});

test("id de carrera: solo enteros positivos", () => {
  assert.equal(validarIdCarrera("7"), 7);
  for (const id of ["0", "-1", "1.5", "abc", "99999999999"]) assert.throws(() => validarIdCarrera(id), (e) => e.status === 400);
});

test("duplicados: distingue código de nombre y excluye la propia carrera", async () => {
  let where;
  const db = (otra) => ({ carrera: { findFirst: async (args) => { where = args.where; return otra; } } });
  await assert.rejects(buscarDuplicado(db({ nombre: "Otra", codigo: "LSI" }), { nombre: "X", codigo: "LSI" }), (e) => e.status === 409 && /código/.test(e.message));
  await assert.rejects(buscarDuplicado(db({ nombre: "Sistemas", codigo: "OTRO" }), { nombre: "sistemas", codigo: "LSI" }), (e) => e.status === 409 && /llamada/.test(e.message));
  await buscarDuplicado(db(null), { nombre: "X" }, 4);
  assert.deepEqual(where.NOT, { id: 4 });
});

// ---------- Contrato HTTP (DB simulada) ----------

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/carreras", crearRouterCarreras(db));
  app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol, body) => fetch(`http://127.0.0.1:${server.address().port}/api/carreras${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id: 1, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

const transaccion = (tx) => ({ $transaction: async (fn, opts) => { assert.equal(opts.isolationLevel, "Serializable"); return fn(tx); } });

test("HTTP: exige login y rol ADMIN en todas las operaciones", async () => {
  await conAPI({}, async (request) => {
    assert.equal((await request("GET", "/", null)).status, 401);
    assert.equal((await request("POST", "/", null, valida())).status, 401);
    for (const rol of ["ALUMNO", "DOCENTE"]) {
      assert.equal((await request("GET", "/", rol)).status, 403);
      assert.equal((await request("POST", "/", rol, valida())).status, 403);
      assert.equal((await request("PATCH", "/1", rol, { nombre: "X" })).status, 403);
    }
  });
});

test("HTTP: registra una carrera y responde 201", async () => {
  let recibido;
  const tx = { carrera: { findFirst: async () => null, create: async (args) => { recibido = args.data; return { id: 5, ...args.data, vigente: true }; } } };
  await conAPI(transaccion(tx), async (request) => {
    const r = await request("POST", "/", "ADMIN", valida());
    assert.equal(r.status, 201);
    assert.equal((await r.json()).id, 5);
    assert.equal(recibido.codigo, "LSI-2026");
    assert.equal("vigente" in recibido, false);
  });
});

test("HTTP: registrar rechaza datos inválidos (400) y duplicados (409) sin guardar", async () => {
  const noGuarda = async () => assert.fail("No debe guardar");
  await conAPI({ $transaction: noGuarda }, async (request) => {
    assert.equal((await request("POST", "/", "ADMIN", { nombre: "Sin código" })).status, 400);
  });
  const tx = { carrera: { findFirst: async () => ({ nombre: "Otra", codigo: "LSI-2026" }), create: noGuarda } };
  await conAPI(transaccion(tx), async (request) => {
    assert.equal((await request("POST", "/", "ADMIN", valida())).status, 409);
  });
  for (const code of ["P2002", "P2034"]) {
    await conAPI({ $transaction: async () => { throw { code }; } }, async (request) => {
      assert.equal((await request("POST", "/", "ADMIN", valida())).status, 409);
    });
  }
});

test("HTTP: modifica solo los campos enviados y responde 200", async () => {
  let actualizado;
  const tx = { carrera: {
    findUnique: async () => ({ id: 3 }),
    findFirst: async (args) => { assert.deepEqual(args.where.NOT, { id: 3 }); return null; },
    update: async (args) => { actualizado = args; return { id: 3, nombre: "Ingeniería en Sistemas", codigo: "LSI" }; },
  } };
  await conAPI(transaccion(tx), async (request) => {
    const r = await request("PATCH", "/3", "ADMIN", { nombre: " Ingeniería en Sistemas " });
    assert.equal(r.status, 200);
    assert.deepEqual(actualizado.where, { id: 3 });
    assert.deepEqual(actualizado.data, { nombre: "Ingeniería en Sistemas" });
  });
});

test("HTTP: modificar responde 404, 400 y 409 según el caso", async () => {
  const noActualiza = async () => assert.fail("No debe actualizar");
  await conAPI(transaccion({ carrera: { findUnique: async () => null, update: noActualiza } }), async (request) => {
    assert.equal((await request("PATCH", "/99", "ADMIN", { nombre: "X" })).status, 404);
  });
  await conAPI({ $transaction: noActualiza }, async (request) => {
    assert.equal((await request("PATCH", "/abc", "ADMIN", { nombre: "X" })).status, 400);
    assert.equal((await request("PATCH", "/3", "ADMIN", {})).status, 400);
    assert.equal((await request("PATCH", "/3", "ADMIN", { vigente: false })).status, 400);
  });
  const tx = { carrera: { findUnique: async () => ({ id: 3 }), findFirst: async () => ({ nombre: "Otra", codigo: "ABC" }), update: noActualiza } };
  await conAPI(transaccion(tx), async (request) => {
    assert.equal((await request("PATCH", "/3", "ADMIN", { codigo: "abc" })).status, 409);
  });
});

test("HTTP: lista todas las carreras, vigentes y no vigentes", async () => {
  const carreras = [{ id: 1, nombre: "A", vigente: true }, { id: 2, nombre: "B", vigente: false }];
  await conAPI({ carrera: { findMany: async (args) => { assert.equal(args.where, undefined); return carreras; } } }, async (request) => {
    const r = await request("GET", "/", "ADMIN");
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), carreras);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterEvaluaciones } from "../src/routes/evaluaciones.js";

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/evaluaciones", crearRouterEvaluaciones(db));
  app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (rol) => fetch(`http://127.0.0.1:${server.address().port}/api/evaluaciones`, {
    headers: rol ? { Authorization: `Bearer ${jwt.sign({ id: 2, rol }, process.env.JWT_SECRET)}` } : {},
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP: exige login y rol ALUMNO", async () => {
  await conAPI({}, async (request) => {
    assert.equal((await request(null)).status, 401);
    for (const rol of ["DOCENTE", "ADMIN"]) assert.equal((await request(rol)).status, 403);
  });
});

test("HTTP: solo trae evaluaciones de las cursadas del propio alumno, materia aplanada", async () => {
  const evaluaciones = [
    { id: 1, tipo: "PARCIAL", nota: 8, fecha: new Date(), observaciones: null, cursada: { materia: { id: 1, nombre: "Programación I", codigo: "PROG1" } } },
  ];
  const db = {
    evaluacion: {
      findMany: async (args) => { assert.deepEqual(args.where, { cursada: { alumnoId: 2 } }); return evaluaciones; },
    },
  };
  await conAPI(db, async (request) => {
    const r = await request("ALUMNO");
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].materia.codigo, "PROG1");
    assert.equal(body[0].cursada, undefined);
  });
});

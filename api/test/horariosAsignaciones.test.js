import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterAsignacionesDocentes } from "../src/routes/horarios.js";
import { manejarErrores } from "../src/middleware/errores.js";

function crearDB() {
  const docentesMateria = new Set(["1:7", "1:8"]);
  const bloques = [
    {
      id: 101,
      dia: "LUNES",
      horaInicio: "09:00",
      horaFin: "10:00",
      docenteId: null,
      comision: { nombre: "Comisión A", materiaId: 1, materia: { nombre: "Programación" } },
    },
    {
      id: 102,
      dia: "LUNES",
      horaInicio: "09:30",
      horaFin: "10:30",
      docenteId: 7,
      comision: { nombre: "Comisión B", materiaId: 1, materia: { nombre: "Programación" } },
    },
  ];
  return {
    bloques,
    materia: { findMany: async () => [] },
    materiaDocente: {
      findUnique: async ({ where }) => docentesMateria.has(`${where.materiaId_docenteId.materiaId}:${where.materiaId_docenteId.docenteId}`)
        ? { docenteId: where.materiaId_docenteId.docenteId }
        : null,
    },
    bloqueHorario: {
      findUnique: async ({ where }) => bloques.find((bloque) => bloque.id === where.id) ?? null,
      findMany: async ({ where }) => bloques
        .filter((bloque) => bloque.docenteId === where.docenteId && bloque.dia === where.dia)
        .map((bloque) => ({
          id: bloque.id,
          dia: bloque.dia,
          horaInicio: bloque.horaInicio,
          horaFin: bloque.horaFin,
          comision: bloque.comision,
        })),
      update: async ({ where, data }) => {
        const bloque = bloques.find((actual) => actual.id === where.id);
        Object.assign(bloque, data);
        return { id: bloque.id, dia: bloque.dia, horaInicio: bloque.horaInicio, horaFin: bloque.horaFin, docenteId: bloque.docenteId, docente: null };
      },
    },
  };
}

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express();
  app.use(express.json());
  app.use("/api/horarios/asignaciones", crearRouterAsignacionesDocentes(db));
  app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (method, path, { rol = "ADMIN", body } = {}) => fetch(
    `http://127.0.0.1:${server.address().port}/api/horarios/asignaciones${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt.sign({ id: 9, rol }, process.env.JWT_SECRET)}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  try {
    await fn(request);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("HTTP: solo ADMIN consulta y asigna docentes a los bloques", async () => {
  const db = crearDB();
  await conAPI(db, async (request) => {
    assert.equal((await request("GET", "/", { rol: "DOCENTE" })).status, 403);
    assert.equal((await request("GET", "/")).status, 200);
    assert.equal((await request("PUT", "/bloques/101/docente", {
      rol: "DOCENTE",
      body: { docenteId: 8 },
    })).status, 403);
  });
});

test("HTTP: valida la materia del docente, bloqueos superpuestos y desasignación", async () => {
  const db = crearDB();
  await conAPI(db, async (request) => {
    const superpuesto = await request("PUT", "/bloques/101/docente", { body: { docenteId: 7 } });
    assert.equal(superpuesto.status, 409);
    assert.match((await superpuesto.json()).error, /se superpone|ya tiene/i);

    const noAsignado = await request("PUT", "/bloques/101/docente", { body: { docenteId: 9 } });
    assert.equal(noAsignado.status, 400);

    const asignado = await request("PUT", "/bloques/101/docente", { body: { docenteId: 8 } });
    assert.equal(asignado.status, 200);
    assert.equal((await asignado.json()).docenteId, 8);

    const desasignado = await request("PUT", "/bloques/101/docente", { body: { docenteId: null } });
    assert.equal(desasignado.status, 200);
    assert.equal((await desasignado.json()).docenteId, null);
    assert.equal((await request("PUT", "/bloques/999/docente", { body: { docenteId: 8 } })).status, 404);
    assert.equal((await request("PUT", "/bloques/101/docente", { body: {} })).status, 400);
  });
});

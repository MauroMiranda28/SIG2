import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { resumenInscriptos, contarInscriptos } from "../src/services/inscriptosFinal.js";
import { crearRouterInscripcionesExamen } from "../src/routes/inscripcionesExamen.js";
import { manejarErrores } from "../src/middleware/errores.js";

test("resumenInscriptos: total, regulares y libres", () => {
  assert.deepEqual(resumenInscriptos(["REGULAR", "LIBRE", "REGULAR"]), { total: 3, regulares: 2, libres: 1 });
  assert.deepEqual(resumenInscriptos([]), { total: 0, regulares: 0, libres: 0 });
});

test("contarInscriptos: agrupa por final y modalidad; los finales sin inscriptos quedan en cero", async () => {
  let consulta;
  const db = { inscripcionExamen: { groupBy: async (args) => { consulta = args; return [
    { examenId: 1, modalidad: "REGULAR", _count: { _all: 5 } },
    { examenId: 1, modalidad: "LIBRE", _count: { _all: 2 } },
    { examenId: 2, modalidad: "LIBRE", _count: { _all: 1 } },
  ]; } } };
  const conteo = await contarInscriptos(db, [1, 2, 3]);
  assert.deepEqual(conteo.get(1), { total: 7, regulares: 5, libres: 2 });
  assert.deepEqual(conteo.get(2), { total: 1, regulares: 0, libres: 1 });
  assert.deepEqual(conteo.get(3), { total: 0, regulares: 0, libres: 0 });
  assert.deepEqual(consulta.by, ["examenId", "modalidad"]);
  assert.deepEqual(await contarInscriptos({}, []), new Map(), "sin finales no consulta");
});

test("HTTP: el alumno ve cuántos inscriptos tiene cada final, sin datos de los otros alumnos", async () => {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const futuro = new Date(Date.now() + 10 * 86400e3);
  const db = {
    cursada: { findMany: async () => [{ materiaId: 5, estado: "REGULAR", regularDesde: new Date() }] },
    fechaExamen: { findMany: async () => [{ id: 1, fecha: futuro, hora: "09:00", materiaId: 5, materia: { id: 5, nombre: "Programación I", codigo: "PROG1" }, aula: null, inscripciones: [] }] },
    inscripcionExamen: { groupBy: async () => [{ examenId: 1, modalidad: "REGULAR", _count: { _all: 3 } }, { examenId: 1, modalidad: "LIBRE", _count: { _all: 1 } }] },
  };
  const app = express(); app.use(express.json()); app.use("/api/finales", crearRouterInscripcionesExamen(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/finales`, { headers: { Authorization: `Bearer ${jwt.sign({ id: 2, rol: "ALUMNO" }, process.env.JWT_SECRET)}` } });
    assert.equal(r.status, 200);
    const [final] = await r.json();
    assert.deepEqual(final.inscriptos, { total: 4, regulares: 3, libres: 1 });
    assert.equal("alumnos" in final.inscriptos, false, "el alumno no ve quiénes son");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

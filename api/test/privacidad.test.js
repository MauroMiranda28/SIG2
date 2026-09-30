// Privacidad del seguimiento académico: cada alumno ve y modifica solo lo suyo.
// Estos tests fijan esa regla para que un cambio futuro no la rompa sin que nadie se entere:
// - el alumno sale SIEMPRE del token, aunque se mande otro id por query o por body;
// - docentes y admins no acceden al seguimiento de un alumno por estas rutas.
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterEvaluaciones } from "../src/routes/evaluaciones.js";
import { crearRouterAsistencias } from "../src/routes/asistencias.js";
import { crearRouterRevisiones } from "../src/routes/revisiones.js";
import { crearRouterPromedio } from "../src/routes/promedio.js";
import { manejarErrores } from "../src/middleware/errores.js";

const YO = 2;
const OTRO = 999;

// DB falsa que registra cada consulta, para revisar a quién se le pidieron los datos.
function dbEspia() {
  const consultas = [];
  const respuestas = {
    usuario: { findUnique: { carreraId: 1, planEstudioId: 9 } },
    planEstudio: { findUnique: { id: 9, carreraId: 1 } },
  };
  const db = new Proxy({}, {
    get: (_, modelo) => new Proxy({}, {
      get: (__, metodo) => async (args) => {
        consultas.push({ modelo, metodo, args });
        if (metodo === "findMany") return [];
        return respuestas[modelo]?.[metodo] ?? null;
      },
    }),
  });
  return { db, consultas };
}

const RUTAS = [
  { nombre: "evaluaciones", crear: crearRouterEvaluaciones, metodo: "GET", ruta: "/" },
  { nombre: "asistencias", crear: crearRouterAsistencias, metodo: "GET", ruta: "/" },
  { nombre: "asistencias", crear: crearRouterAsistencias, metodo: "POST", ruta: "/",
    body: { materiaId: 3, fecha: "2026-01-05", estado: "PRESENTE", alumnoId: OTRO } },
  { nombre: "revisiones", crear: crearRouterRevisiones, metodo: "GET", ruta: "/mis-solicitudes" },
  { nombre: "revisiones", crear: crearRouterRevisiones, metodo: "POST", ruta: "/",
    body: { evaluacionId: 4, motivo: "Creo que el ejercicio 3 está bien resuelto.", alumnoId: OTRO } },
  { nombre: "promedio", crear: crearRouterPromedio, metodo: "GET", ruta: "/" },
  { nombre: "promedio", crear: crearRouterPromedio, metodo: "POST", ruta: "/simular", body: { materiaId: 3, nota: 8, alumnoId: OTRO } },
];

async function pedir({ crear, metodo, ruta, body }, rol, db, query = "") {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/r", crear(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/r${ruta}${query}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({ id: YO, rol }, process.env.JWT_SECRET)}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return r.status;
  } finally { await new Promise((resolve) => server.close(resolve)); }
}

for (const caso of RUTAS) {
  test(`privacidad ${caso.nombre} ${caso.metodo} ${caso.ruta}: usa el alumno del token aunque pidan otro`, async () => {
    const { db, consultas } = dbEspia();
    await pedir(caso, "ALUMNO", db, `?alumnoId=${OTRO}&usuarioId=${OTRO}`);
    assert.ok(consultas.length > 0, "tendría que consultar la base");
    const todo = JSON.stringify(consultas.map((c) => c.args));
    assert.doesNotMatch(todo, new RegExp(`\\b${OTRO}\\b`), "nunca debe consultar datos de otro alumno");
    assert.match(todo, new RegExp(`"(alumnoId|id)":${YO}\\b`), "filtra por el alumno logueado");
  });

  test(`privacidad ${caso.nombre} ${caso.metodo} ${caso.ruta}: docentes y admins no acceden`, async () => {
    for (const rol of ["DOCENTE", "ADMIN"]) {
      const { db, consultas } = dbEspia();
      assert.equal(await pedir(caso, rol, db), 403, rol);
      assert.equal(consultas.length, 0, `${rol} no debe llegar a la base`);
    }
  });
}

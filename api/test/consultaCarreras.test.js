import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterCarreras } from "../src/routes/carreras.js";
import { armarListadoCarreras, armarDetalleCarrera, datosListadoCarreras } from "../src/services/consultaCarreras.js";
import { manejarErrores } from "../src/middleware/errores.js";

const DOCENTE = 7;
const dicta = (si) => (si ? [{ docenteId: DOCENTE }] : []);

// ---------- Armado (sin DB) ----------

test("listado: cuenta planes, materias y en cuántas dicta; vigentes primero y por nombre", () => {
  const listado = armarListadoCarreras([
    { id: 3, nombre: "Contador Público", codigo: "CP", descripcion: null, vigente: false, planes: [] },
    {
      id: 1, nombre: "Ingeniería en Informática", codigo: "IEI", descripcion: "Sistemas", vigente: true,
      planes: [
        { vigente: true, materias: [{ id: 1, docentes: dicta(true) }, { id: 2, docentes: dicta(false) }] },
        { vigente: false, materias: [{ id: 3, docentes: dicta(true) }] },
      ],
    },
    { id: 2, nombre: "Abogacía", codigo: "ABO", descripcion: null, vigente: true, planes: [{ vigente: true, materias: [] }] },
  ]);
  assert.deepEqual(listado.map((c) => c.codigo), ["ABO", "IEI", "CP"]);
  assert.deepEqual(
    (({ planes, planesVigentes, materias, dictoMaterias }) => ({ planes, planesVigentes, materias, dictoMaterias }))(listado[1]),
    { planes: 2, planesVigentes: 1, materias: 3, dictoMaterias: 2 },
  );
});

test("datosListadoCarreras: solo busca las asignaciones del docente consultante", () => {
  assert.deepEqual(datosListadoCarreras(DOCENTE).planes.select.materias.select.docentes.where, { docenteId: DOCENTE });
});

test("detalle: planes vigentes primero y más nuevos; materias por año y cuatrimestre con correlativas y totales", () => {
  const materia = (id, nombre, anio, cuatrimestre, extra = {}) => ({
    id, nombre, codigo: `M${id}`, anio, cuatrimestre, cargaHoraria: 64, docentes: [], requiere: [], ...extra,
  });
  const detalle = armarDetalleCarrera({
    id: 1, nombre: "Ingeniería en Informática", codigo: "IEI", descripcion: null, vigente: true,
    planes: [
      { id: 1, nombre: "Plan 2018", anio: 2018, vigente: false, materias: [] },
      {
        id: 2, nombre: "Plan 2023", anio: 2023, vigente: true,
        materias: [
          materia(3, "Programación II", 2, 1, {
            cargaHoraria: 96,
            docentes: [{ docenteId: DOCENTE, docente: { nombre: "Nacho", apellido: "Monzón" } }],
            requiere: [
              { tipo: "DEBIL", requiere: { id: 2, nombre: "Programación I", codigo: "M2" } },
              { tipo: "FUERTE", requiere: { id: 1, nombre: "Álgebra", codigo: "M1" } },
            ],
          }),
          materia(2, "Programación I", 1, 2),
          materia(1, "Álgebra", 1, 1, { cargaHoraria: null }),
        ],
      },
      { id: 3, nombre: "Plan 2020", anio: 2020, vigente: true, materias: [] },
    ],
  }, DOCENTE);

  assert.deepEqual(detalle.planes.map((p) => p.nombre), ["Plan 2023", "Plan 2020", "Plan 2018"]);
  const [plan] = detalle.planes;
  assert.deepEqual(plan.materias.map((m) => m.nombre), ["Álgebra", "Programación I", "Programación II"]);
  assert.deepEqual(plan.totales, { materias: 3, anios: 2, cargaHoraria: 160 }, "la carga horaria sin dato cuenta como 0");
  const prog2 = plan.materias[2];
  assert.equal(prog2.laDicto, true);
  assert.deepEqual(prog2.docentes, [{ nombre: "Nacho", apellido: "Monzón" }]);
  assert.deepEqual(prog2.correlativas.map((c) => [c.tipo, c.materia.nombre]), [["FUERTE", "Álgebra"], ["DEBIL", "Programación I"]]);
  assert.equal("requiere" in prog2, false);
});

// ---------- Contrato HTTP (DB simulada) ----------

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/carreras", crearRouterCarreras(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (ruta, rol, id = DOCENTE) => fetch(`http://127.0.0.1:${server.address().port}/api/carreras${ruta}`, {
    headers: rol ? { Authorization: `Bearer ${jwt.sign({ id, rol }, process.env.JWT_SECRET)}` } : {},
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP: docentes y ADMIN consultan; alumnos y sin sesión no", async () => {
  const db = { carrera: { findMany: async () => [], findUnique: async () => null } };
  await conAPI(db, async (request) => {
    assert.equal((await request("/consulta", null)).status, 401);
    assert.equal((await request("/consulta", "ALUMNO")).status, 403);
    assert.equal((await request("/consulta/1", "ALUMNO")).status, 403);
    for (const rol of ["DOCENTE", "ADMIN"]) assert.equal((await request("/consulta", rol)).status, 200, rol);
  });
});

test("HTTP: el docente sigue sin acceso a las rutas de administración de carreras", async () => {
  await conAPI({ carrera: { findMany: async () => [] } }, async (request) => {
    assert.equal((await request("/", "DOCENTE")).status, 403);
  });
});

test("HTTP: el listado marca dónde dicta el docente del token y no trae datos de alumnos", async () => {
  let consulta;
  const db = {
    carrera: {
      findMany: async (args) => {
        consulta = args;
        return [{ id: 1, nombre: "Ingeniería en Informática", codigo: "IEI", descripcion: null, vigente: true, planes: [{ vigente: true, materias: [{ id: 5, docentes: dicta(true) }] }] }];
      },
    },
  };
  await conAPI(db, async (request) => {
    const r = await request("/consulta?docenteId=999", "DOCENTE");
    const [carrera] = await r.json();
    assert.equal(carrera.dictoMaterias, 1);
    assert.equal(JSON.stringify(consulta).includes("999"), false, "el docente sale del token, no de la URL");
    assert.equal("usuarios" in consulta.select || "_count" in consulta.select, false, "no consulta alumnos");
  });
});

test("HTTP: detalle de una carrera; 404 si no existe y 400 con un id inválido", async () => {
  const db = {
    carrera: {
      findUnique: async ({ where }) => (where.id === 1
        ? { id: 1, nombre: "Ingeniería en Informática", codigo: "IEI", descripcion: null, vigente: true, planes: [] }
        : null),
    },
  };
  await conAPI(db, async (request) => {
    const r = await request("/consulta/1", "DOCENTE");
    assert.equal(r.status, 200);
    assert.equal((await r.json()).codigo, "IEI");
    assert.equal((await request("/consulta/2", "DOCENTE")).status, 404);
    assert.equal((await request("/consulta/abc", "DOCENTE")).status, 400);
  });
});

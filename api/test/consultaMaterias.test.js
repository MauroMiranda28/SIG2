import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterDocentes } from "../src/routes/docentes.js";
import { armarInfoMateria, armarRelacionadas, ordenarMaterias } from "../src/services/consultaMaterias.js";
import { manejarErrores } from "../src/middleware/errores.js";

const relacionada = (id, nombre, anio, cuatrimestre, dicta = false) =>
  ({ id, nombre, codigo: `M${id}`, anio, cuatrimestre, cargaHoraria: 64, docentes: dicta ? [{ docenteId: 7 }] : [] });

// ---------- Armado (sin DB) ----------

test("ordenarMaterias: por año, cuatrimestre (sin cuatrimestre al final) y nombre", () => {
  const orden = ordenarMaterias([
    relacionada(1, "Zeta", 2, 1), relacionada(2, "Alfa", 2, null), relacionada(3, "Beta", 1, 2), relacionada(4, "Alfa", 2, 1),
  ]).map((m) => m.id);
  assert.deepEqual(orden, [3, 4, 1, 2]);
});

test("armarRelacionadas: separa previas y posteriores, ordena y marca cuáles dicta el docente", () => {
  const { previas, posteriores } = armarRelacionadas({
    requiere: [{ requiere: relacionada(1, "Programación I", 1, 1, true) }],
    requeridaPor: [{ materia: relacionada(3, "Redes", 3, 1) }, { materia: relacionada(2, "Base de Datos", 2, 2, true) }],
  });
  assert.deepEqual(previas.map((m) => [m.id, m.laDicto]), [[1, true]]);
  assert.deepEqual(posteriores.map((m) => [m.id, m.laDicto]), [[2, true], [3, false]]);
  assert.equal("docentes" in previas[0], false, "no se expone la lista cruda de docentes");
});

test("armarInfoMateria: esMia, puedeModificar, programa solo si está vigente y sin nombre de archivo", () => {
  const base = {
    id: 5, nombre: "Programación I", programaUrl: "materia-5.pdf",
    programa: { contenidos: "Algoritmos", bibliografia: null, version: 1, vigente: true, actualizadoEn: "2026-01-01" },
    docentes: [{ docente: { id: 7, nombre: "María", apellido: "Gómez" } }],
  };
  const mia = armarInfoMateria(base, { id: 7, rol: "DOCENTE" });
  assert.equal(mia.esMia, true); assert.equal(mia.puedeModificar, true); assert.equal(mia.tienePdf, true);
  assert.equal("programaUrl" in mia, false);
  assert.deepEqual(mia.docentes, [{ id: 7, nombre: "María", apellido: "Gómez" }]);

  const ajena = armarInfoMateria(base, { id: 8, rol: "DOCENTE" });
  assert.equal(ajena.esMia, false); assert.equal(ajena.puedeModificar, false);
  assert.equal(armarInfoMateria(base, { id: 1, rol: "ADMIN" }).puedeModificar, true);

  const sinTexto = armarInfoMateria({ ...base, programaUrl: null, programa: { ...base.programa, vigente: false } }, { id: 7, rol: "DOCENTE" });
  assert.equal(sinTexto.programa, null); assert.equal(sinTexto.tienePdf, false);
});

// ---------- Contrato HTTP (DB simulada) ----------

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

test("HTTP: información y relacionadas exigen login y rol DOCENTE o ADMIN", async () => {
  await conAPI({}, async (request) => {
    for (const ruta of ["/materias/5", "/materias/5/relacionadas", "/materias/5/historial"]) {
      assert.equal((await request(ruta, null)).status, 401, ruta);
      assert.equal((await request(ruta, "ALUMNO")).status, 403, ruta);
    }
  });
});

test("HTTP: información de una materia, 404 si no existe y 400 con un id inválido", async () => {
  const materia = { id: 5, nombre: "Base de Datos", programaUrl: null, programa: null, docentes: [{ docente: { id: 9, nombre: "Ana", apellido: "Paz" } }], comisiones: [], plan: { carrera: {} } };
  await conAPI({ materia: { findUnique: async ({ where }) => (where.id === 5 ? materia : null) } }, async (request) => {
    const r = await request("/materias/5", "DOCENTE", 7);
    assert.equal(r.status, 200);
    const cuerpo = await r.json();
    assert.equal(cuerpo.esMia, false, "consultar una materia ajena es solo lectura");
    assert.equal(cuerpo.puedeModificar, false);
    assert.equal((await request("/materias/99", "DOCENTE")).status, 404);
    assert.equal((await request("/materias/abc", "DOCENTE")).status, 400);
  });
});

test("HTTP: relacionadas pide el docente del token para marcar «la dictás»", async () => {
  let select;
  const db = { materia: { findUnique: async (args) => { select = args.select; return {
    id: 5, nombre: "Base de Datos", codigo: "BD1",
    requiere: [{ requiere: relacionada(1, "Programación I", 1, 1, true) }], requeridaPor: [],
  }; } } };
  await conAPI(db, async (request) => {
    const r = await request("/materias/5/relacionadas", "DOCENTE", 7);
    assert.equal(r.status, 200);
    const { previas, posteriores } = await r.json();
    assert.equal(previas[0].laDicto, true); assert.deepEqual(posteriores, []);
    assert.deepEqual(select.requiere.select.requiere.select.docentes.where, { docenteId: 7 });
  });
});

test("HTTP: el historial lo ve el docente asignado o ADMIN, nunca otro docente", async () => {
  const cambios = [{ id: 2, accion: "HORARIO_QUITADO", detalle: "Comisión A: Lunes 18:00–20:00 · Aula 1", creadoEn: new Date(), autor: { nombre: "María", apellido: "Gómez", rol: "DOCENTE" } }];
  const db = (asignado) => ({
    materia: { findUnique: async () => ({ id: 5, nombre: "Programación I", codigo: "PROG1" }) },
    materiaDocente: { findUnique: async () => (asignado ? { materiaId: 5 } : null) },
    cambioMateria: { findMany: async (args) => { assert.deepEqual(args.where, { materiaId: 5 }); return cambios; } },
  });
  await conAPI(db(true), async (request) => {
    const r = await request("/materias/5/historial", "DOCENTE", 7);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).cambios[0].autor.apellido, "Gómez");
    assert.equal((await request("/materias/5/historial", "ADMIN", 1)).status, 200);
  });
  await conAPI(db(false), async (request) => {
    assert.equal((await request("/materias/5/historial", "DOCENTE", 8)).status, 403);
    assert.equal((await request("/materias/5/historial", "ADMIN", 1)).status, 200);
  });
});

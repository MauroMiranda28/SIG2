import test from "node:test";
import assert from "node:assert/strict";
import { materiasQueCursa, proximasEvaluaciones } from "../src/services/proximasEvaluaciones.js";

const AHORA = new Date("2026-10-13T15:00:00Z");
const ISO = (texto) => new Date(`${texto}T00:00:00.000Z`);
const MATERIA = (id, nombre) => ({ id, nombre, codigo: `M${id}` });

// cursadas: [{ materiaId, estado }]; comisiones: materiaIds de las comisiones elegidas.
function dbFalsa({ cursadas = [], comisiones = [], examenes = [], tareas = [] } = {}) {
  const consultas = {};
  return {
    consultas,
    cursada: { findMany: async (args) => { consultas.cursada = args.where; return cursadas; } },
    inscripcionComision: { findMany: async (args) => { consultas.inscripcion = args.where; return comisiones.map((materiaId) => ({ comision: { materiaId } })); } },
    fechaExamen: { findMany: async (args) => { consultas.examenes = args.where; return examenes; } },
    tarea: { findMany: async (args) => { consultas.tareas = args.where; return tareas; } },
  };
}

test("materiasQueCursa: cursada en curso o comisión elegida, pero no si ya cerró la cursada", async () => {
  const db = dbFalsa({
    cursadas: [{ materiaId: 1, estado: "EN_CURSO" }, { materiaId: 2, estado: "APROBADA" }, { materiaId: 3, estado: "REGULAR" }, { materiaId: 4, estado: "LIBRE" }],
    comisiones: [2, 3, 5],
  });
  assert.deepEqual((await materiasQueCursa(db, 7)).sort(), [1, 5]);
  assert.deepEqual(db.consultas.cursada, { alumnoId: 7 }, "solo las cursadas del alumno logueado");
  assert.deepEqual(db.consultas.inscripcion, { alumnoId: 7 });
});

test("proximasEvaluaciones: sin materias en curso no consulta exámenes ni tareas", async () => {
  const db = dbFalsa();
  assert.deepEqual(await proximasEvaluaciones(db, 7, AHORA), []);
  assert.equal(db.consultas.examenes, undefined);
});

test("proximasEvaluaciones: parciales, recuperatorios y TPs desde hoy, ordenados por fecha y hora", async () => {
  const db = dbFalsa({
    cursadas: [{ materiaId: 1, estado: "EN_CURSO" }],
    comisiones: [2],
    examenes: [
      { id: 10, tipo: "RECUPERATORIO", fecha: ISO("2026-11-20"), hora: null, aula: null, materia: MATERIA(1, "Programación I") },
      { id: 11, tipo: "PARCIAL", fecha: ISO("2026-10-20"), hora: "18:00", aula: { id: 1, nombre: "Aula 1" }, materia: MATERIA(2, "Álgebra") },
    ],
    tareas: [
      { id: 5, titulo: "TP 1", descripcion: null, fechaEntrega: ISO("2026-10-20"), horaEntrega: "08:00", materia: MATERIA(1, "Programación I") },
      { id: 6, titulo: "TP 2", descripcion: "En PDF", fechaEntrega: ISO("2026-10-15"), horaEntrega: null, materia: MATERIA(1, "Programación I") },
    ],
  });

  const lista = await proximasEvaluaciones(db, 7, AHORA);
  assert.deepEqual(lista.map((i) => i.clave), ["tarea-6", "tarea-5", "examen-11", "examen-10"]);
  assert.deepEqual(lista.map((i) => i.tipo), ["TRABAJO_PRACTICO", "TRABAJO_PRACTICO", "PARCIAL", "RECUPERATORIO"]);
  assert.equal(lista[1].hora, "08:00");
  assert.equal(lista[2].aula.nombre, "Aula 1");

  assert.deepEqual(db.consultas.examenes.materiaId.in.sort(), [1, 2]);
  assert.deepEqual(db.consultas.examenes.tipo, { in: ["PARCIAL", "RECUPERATORIO"] }, "los finales van en su propia pantalla");
  assert.deepEqual(db.consultas.examenes.fecha, { gte: ISO("2026-10-13") }, "desde hoy (hora argentina)");
  assert.deepEqual(db.consultas.tareas.fechaEntrega, { gte: ISO("2026-10-13") });
});

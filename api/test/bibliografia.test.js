import test from "node:test";
import assert from "node:assert/strict";
import { separarBibliografia, bibliografiaDelAlumno } from "../src/services/bibliografia.js";

test("separarBibliografia: una obra por renglón, sin viñetas, numeración ni renglones vacíos", () => {
  const texto = "- Deitel, Cómo programar en C.\r\n\n• Kernighan y Ritchie, El lenguaje C.\n  2) Knuth, TAOCP.\n1.5 Guía de ejercicios propia\n   ";
  assert.deepEqual(separarBibliografia(texto), [
    "Deitel, Cómo programar en C.",
    "Kernighan y Ritchie, El lenguaje C.",
    "Knuth, TAOCP.",
    "1.5 Guía de ejercicios propia",
  ]);
  for (const v of [null, undefined, "", "  \n  ", 5]) assert.deepEqual(separarBibliografia(v), [], String(v));
});

function dbFalsa(materias) {
  const consultas = [];
  return {
    consultas,
    usuario: { findUnique: async (args) => { consultas.push(args.where); return { carreraId: 1, planEstudioId: 9 }; } },
    planEstudio: { findUnique: async () => ({ id: 9, carreraId: 1 }) },
    materia: { findMany: async (args) => { consultas.push(args.where); return materias; } },
  };
}

test("bibliografiaDelAlumno: usa el plan del alumno y solo muestra programas vigentes", async () => {
  const fecha = new Date("2026-03-01T00:00:00Z");
  const db = dbFalsa([
    { id: 1, nombre: "Programación I", codigo: "PROG1", anio: 1, cuatrimestre: 1, programa: { bibliografia: "Libro A\nLibro B", vigente: true, version: 2, actualizadoEn: fecha } },
    { id: 2, nombre: "Bases de Datos", codigo: "BD1", anio: 2, cuatrimestre: 1, programa: { bibliografia: "Libro viejo", vigente: false, version: 1, actualizadoEn: fecha } },
    { id: 3, nombre: "Álgebra", codigo: "ALG", anio: 1, cuatrimestre: 2, programa: null },
  ]);

  const resultado = await bibliografiaDelAlumno(db, 4);

  assert.deepEqual(db.consultas, [{ id: 4 }, { planId: 9 }], "busca el plan del alumno logueado");
  assert.deepEqual(resultado.map((m) => [m.codigo, m.bibliografia]), [["PROG1", ["Libro A", "Libro B"]], ["BD1", []], ["ALG", []]]);
  assert.equal(resultado[0].actualizadoEn, fecha);
  assert.equal(resultado[1].actualizadoEn, null);
  assert.equal("programa" in resultado[0], false);
});

test("bibliografiaDelAlumno: sin carrera asignada devuelve el error del plan", async () => {
  const db = { usuario: { findUnique: async () => ({ carreraId: null, planEstudioId: null }) } };
  await assert.rejects(bibliografiaDelAlumno(db, 4), (e) => e.status === 404);
});

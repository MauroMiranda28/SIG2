import test from "node:test";
import assert from "node:assert/strict";
import { tieneProgramaParaDescargar } from "../src/services/programas.js";

// La lista de materias del alumno usa esta regla para mostrar (o apagar) el botón «Descargar programa».
// Tiene que coincidir con GET /api/materias/:id/programa/pdf: PDF subido, o programa en texto vigente.

test("tieneProgramaParaDescargar: con un PDF subido se puede descargar", () => {
  assert.equal(tieneProgramaParaDescargar({ programaUrl: "materia-1-123-abcd.pdf", programa: null }), true);
});

test("tieneProgramaParaDescargar: con programa en texto vigente se puede (se arma el PDF)", () => {
  assert.equal(tieneProgramaParaDescargar({ programaUrl: null, programa: { vigente: true } }), true);
});

test("tieneProgramaParaDescargar: sin PDF y sin programa vigente no hay nada para descargar", () => {
  assert.equal(tieneProgramaParaDescargar({ programaUrl: null, programa: null }), false);
  assert.equal(tieneProgramaParaDescargar({ programaUrl: null, programa: { vigente: false } }), false);
  assert.equal(tieneProgramaParaDescargar({ programaUrl: "", programa: null }), false);
  assert.equal(tieneProgramaParaDescargar({ programaUrl: "   ", programa: null }), false);
  assert.equal(tieneProgramaParaDescargar({}), false);
  assert.equal(tieneProgramaParaDescargar(), false);
});

test("tieneProgramaParaDescargar: un programa no vigente no pisa un PDF subido", () => {
  assert.equal(tieneProgramaParaDescargar({ programaUrl: "materia-1-1-ab.pdf", programa: { vigente: false } }), true);
});

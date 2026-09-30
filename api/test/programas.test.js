import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { esPdf, rutaPrograma, nombreDescarga, DIR_PROGRAMAS } from "../src/services/programas.js";

test("esPdf: reconoce la firma %PDF- y rechaza el resto", () => {
  assert.equal(esPdf(Buffer.from("%PDF-1.7 ...")), true);
  for (const contenido of ["<html>", "MZ\x90\x00", "", "%PD"]) assert.equal(esPdf(Buffer.from(contenido)), false, contenido);
  assert.equal(esPdf("%PDF-"), false, "solo acepta buffers");
});

test("rutaPrograma: siempre queda dentro de la carpeta de programas", () => {
  const casos = ["materia-5.pdf", "uploads/programas/abc123", "uploads\\programas\\abc123", "../../../etc/passwd", "..\\..\\api\\.env"];
  for (const valor of casos) {
    const ruta = rutaPrograma(valor);
    assert.equal(path.dirname(ruta), path.resolve(DIR_PROGRAMAS), valor);
  }
  assert.equal(path.basename(rutaPrograma("../../../etc/passwd")), "passwd");
});

test("rutaPrograma: sin valor o con valores inválidos devuelve null", () => {
  for (const valor of [null, undefined, "", "   ", "..", "uploads/programas/", 5]) assert.equal(rutaPrograma(valor), null, String(valor));
});

test("nombreDescarga: usa el código de la materia sin caracteres raros", () => {
  assert.equal(nombreDescarga("PROG1"), "programa-PROG1.pdf");
  assert.equal(nombreDescarga('a"b/c\r\n'), "programa-abc.pdf");
  assert.equal(nombreDescarga(null), "programa-materia.pdf");
});

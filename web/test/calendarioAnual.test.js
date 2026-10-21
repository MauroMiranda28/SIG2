import test from "node:test";
import assert from "node:assert/strict";
import { clasePrincipal, marcasDelDia } from "../src/horarios/calendarioAnual.js";

const periodo = (tipo, fechaInicio, fechaFin, nombre = tipo) => ({
  tipo,
  nombre,
  fechaInicio: `${fechaInicio}T00:00:00.000Z`,
  fechaFin: `${fechaFin}T00:00:00.000Z`,
});

test("marca todos los días incluidos en feriados, vacaciones y períodos de finales", () => {
  const periodos = [
    periodo("FERIADO", "2026-05-01", "2026-05-01", "Feriado"),
    periodo("VACACIONES", "2026-07-01", "2026-07-10", "Vacaciones"),
    periodo("EXAMENES_FINALES", "2026-07-01", "2026-07-20", "Mesas"),
  ];
  assert.equal(clasePrincipal(marcasDelDia("2026-05-01", periodos)), "calendario-feriado");
  assert.equal(clasePrincipal(marcasDelDia("2026-07-06", periodos)), "calendario-vacaciones");
  assert.equal(clasePrincipal(marcasDelDia("2026-07-15", periodos)), "calendario-examenes_finales");
  assert.equal(marcasDelDia("2026-08-01", periodos).length, 0);
});

test("resalta únicamente el feriado si coincide con una mesa de examen", () => {
  const periodos = [
    periodo("EXAMENES_FINALES", "2026-05-01", "2026-05-10", "Mesas de mayo"),
    periodo("FERIADO", "2026-05-01", "2026-05-01", "Día del trabajador"),
  ];
  const marcas = marcasDelDia("2026-05-01", periodos);
  assert.deepEqual(marcas, [{ tipo: "FERIADO", nombre: "Día del trabajador" }]);
  assert.equal(clasePrincipal(marcas), "calendario-feriado");
});

test("no marca domingos dentro de períodos de mesas ni receso de invierno", () => {
  const periodos = [
    periodo("EXAMENES_FINALES", "2026-10-01", "2026-10-31", "Mesas"),
    periodo("VACACIONES", "2026-10-01", "2026-10-31", "Receso"),
  ];
  assert.deepEqual(marcasDelDia("2026-10-18", periodos), []);
  assert.deepEqual(marcasDelDia("2026-10-19", periodos).map(({ tipo }) => tipo), ["EXAMENES_FINALES", "VACACIONES"]);
});

test("marca con estilo distinto el inicio y fin de cada cuatrimestre", () => {
  const periodos = [
    periodo("CLASES_CUATRIMESTRE_1", "2026-03-02", "2026-07-10", "Cursada primer cuatrimestre"),
    periodo("CLASES_CUATRIMESTRE_2", "2026-08-03", "2026-11-20", "Cursada segundo cuatrimestre"),
  ];
  assert.equal(clasePrincipal(marcasDelDia("2026-03-02", periodos)), "calendario-inicio_cuatrimestre");
  assert.equal(clasePrincipal(marcasDelDia("2026-07-10", periodos)), "calendario-fin_cuatrimestre");
  assert.equal(clasePrincipal(marcasDelDia("2026-08-03", periodos)), "calendario-inicio_cuatrimestre");
  assert.equal(clasePrincipal(marcasDelDia("2026-11-20", periodos)), "calendario-fin_cuatrimestre");
});

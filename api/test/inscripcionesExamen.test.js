import test from "node:test";
import assert from "node:assert/strict";
import { inscripcionAbierta, validarInscripcion, modalidadDisponible } from "../src/services/inscripcionesExamen.js";

// 13/10/2026 al mediodía en Argentina.
const AHORA = new Date("2026-10-13T15:00:00Z");
const final = (fecha) => ({ tipo: "FINAL", fecha: new Date(`${fecha}T00:00:00Z`) });
const REGULAR = { estado: "REGULAR", regularDesde: new Date("2026-07-01T00:00:00Z") };

test("inscripcionAbierta: cierra 48 h antes (hasta dos días antes del examen)", () => {
  assert.equal(inscripcionAbierta(final("2026-10-15").fecha, AHORA), true, "faltan 2 días");
  assert.equal(inscripcionAbierta(final("2026-10-14").fecha, AHORA), false, "es mañana");
  assert.equal(inscripcionAbierta(final("2026-10-13").fecha, AHORA), false, "es hoy");
});

test("validarInscripcion: solo finales con la inscripción abierta y con cursada regular o libre", () => {
  assert.equal(validarInscripcion({ examen: final("2026-10-20"), cursada: REGULAR }, AHORA), "REGULAR");
  assert.equal(validarInscripcion({ examen: final("2026-10-20"), cursada: { estado: "LIBRE" } }, AHORA), "LIBRE");
  assert.throws(() => validarInscripcion({ examen: final("2026-10-14"), cursada: REGULAR }, AHORA), /cierra 48 h antes/);
  assert.throws(() => validarInscripcion({ examen: final("2026-10-01"), cursada: REGULAR }, AHORA), /ya pasó/);
  assert.throws(() => validarInscripcion({ examen: { ...final("2026-10-20"), tipo: "PARCIAL" }, cursada: REGULAR }, AHORA), /finales/);
  assert.throws(() => validarInscripcion({ examen: final("2026-10-20"), cursada: { estado: "EN_CURSO" } }, AHORA), /regular o libre/);
});

test("modalidadDisponible: regular vigente, libre (o vencida) o ninguna", () => {
  assert.equal(modalidadDisponible(REGULAR, AHORA), "REGULAR");
  assert.equal(modalidadDisponible({ estado: "REGULAR", regularDesde: new Date("2024-01-01T00:00:00Z") }, AHORA), "LIBRE");
  assert.equal(modalidadDisponible({ estado: "APROBADA" }, AHORA), null);
});

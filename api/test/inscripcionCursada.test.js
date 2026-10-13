import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import {
  validarInscripcionCursada, motivoNoPuedeInscribirse, choqueDeHorario, opcionesDeInscripcion, inscribirACursar,
} from "../src/services/inscripcionCursada.js";
import { crearRouterInscripcionesCursada } from "../src/routes/inscripcionesCursada.js";
import { manejarErrores } from "../src/middleware/errores.js";

const AHORA = new Date("2026-10-13T15:00:00Z");
const ISO = (texto) => new Date(`${texto}T00:00:00.000Z`);
const requisito = (nombre, tipo, cumple) => ({ tipo, cumple, materia: { id: nombre.length, nombre } });

// ---------- Reglas (sin DB) ----------

test("validarInscripcionCursada: materia obligatoria, comisión opcional", () => {
  assert.deepEqual(validarInscripcionCursada({ materiaId: "4", comisionId: 2 }), { materiaId: 4, comisionId: 2 });
  assert.deepEqual(validarInscripcionCursada({ materiaId: 4 }), { materiaId: 4, comisionId: null });
  for (const body of [null, {}, { materiaId: 0 }, { materiaId: 4, comisionId: "abc" }]) {
    assert.throws(() => validarInscripcionCursada(body), (e) => e.status === 400, JSON.stringify(body));
  }
});

test("motivoNoPuedeInscribirse: aprobada, ya inscripto, regular vigente o correlativas que faltan", () => {
  assert.match(motivoNoPuedeInscribirse({ estado: "APROBADA" }, [], AHORA), /Ya aprobaste/);
  assert.match(motivoNoPuedeInscribirse({ estado: "EN_CURSO" }, [], AHORA), /Ya estás inscripto/);
  assert.match(motivoNoPuedeInscribirse({ estado: "REGULAR", regularDesde: ISO("2026-07-01") }, [], AHORA), /te queda rendir el final .*1\/7\/2028/);
  assert.equal(motivoNoPuedeInscribirse(null, [requisito("Álgebra", "FUERTE", true)], AHORA), null, "nunca la cursó y cumple");
  assert.equal(motivoNoPuedeInscribirse({ estado: "LIBRE" }, [], AHORA), null, "libre: puede volver a inscribirse");
  assert.equal(motivoNoPuedeInscribirse({ estado: "REGULAR", regularDesde: ISO("2024-01-01") }, [], AHORA), null, "regularidad vencida");
  assert.equal(
    motivoNoPuedeInscribirse(null, [requisito("Álgebra", "FUERTE", false), requisito("Física", "DEBIL", false), requisito("Química", "DEBIL", true)], AHORA),
    "Te faltan correlativas: Álgebra (aprobada), Física (regular).",
  );
});

test("choqueDeHorario: mismo día y horas que se cruzan; los bordes no chocan", () => {
  const otras = [{ nombre: "Comisión A", materia: { nombre: "Álgebra" }, bloques: [{ dia: "LUNES", horaInicio: "18:00", horaFin: "20:00" }] }];
  assert.equal(choqueDeHorario([{ dia: "LUNES", horaInicio: "19:00", horaFin: "21:00" }], otras), "Se superpone con Álgebra (Comisión A) el lunes de 18:00 a 20:00.");
  assert.equal(choqueDeHorario([{ dia: "LUNES", horaInicio: "20:00", horaFin: "22:00" }], otras), null);
  assert.equal(choqueDeHorario([{ dia: "MARTES", horaInicio: "18:00", horaFin: "20:00" }], otras), null);
});

// ---------- Con DB simulada ----------

// Alumno 7, plan 9. Materia 4 (Programación II) requiere Programación I (3) débil y Álgebra (2) fuerte.
function dbFalsa({ cursadaPropia = null, requeridas = [], comisiones = [], otras = [], plan = 9, ultimaEvaluacion = null } = {}) {
  const registro = { upserts: [], bajas: [], altas: [] };
  const db = {
    registro,
    usuario: { findUnique: async () => ({ carreraId: 1, planEstudioId: 9 }) },
    planEstudio: { findUnique: async () => ({ id: 9, carreraId: 1 }) },
    materia: {
      findUnique: async (args) => {
        assert.deepEqual(args.select.cursadas.where, { alumnoId: 7 }, "la cursada es la del alumno logueado");
        return {
          id: 4, nombre: "Programación II", codigo: "PROG2", planId: plan,
          requiere: [
            { tipo: "DEBIL", requiere: { id: 3, nombre: "Programación I", codigo: "PROG1" } },
            { tipo: "FUERTE", requiere: { id: 2, nombre: "Álgebra", codigo: "ALG" } },
          ],
          comisiones, cursadas: cursadaPropia ? [cursadaPropia] : [],
        };
      },
    },
    evaluacion: { findFirst: async (args) => { registro.ultimaDe = args.where.cursadaId; return ultimaEvaluacion; } },
    cursada: {
      findMany: async (args) => { assert.equal(args.where.alumnoId, 7); return requeridas; },
      upsert: async (args) => { registro.upserts.push(args); return { id: 50, estado: "EN_CURSO" }; },
    },
    inscripcionComision: {
      findMany: async (args) => { assert.equal(args.where.alumnoId, 7); return otras; },
      deleteMany: async (args) => { registro.bajas.push(args.where); return { count: 1 }; },
      create: async (args) => { registro.altas.push(args.data); return { id: 1 }; },
    },
  };
  db.$transaction = async (fn) => fn(db);
  return db;
}

const CUMPLE = [{ materiaId: 3, estado: "REGULAR", regularDesde: ISO("2026-07-01") }, { materiaId: 2, estado: "APROBADA" }];
const COMISIONES = [
  { id: 11, nombre: "Comisión A", bloques: [{ dia: "LUNES", horaInicio: "18:00", horaFin: "20:00", aula: null }] },
  { id: 12, nombre: "Comisión B", bloques: [{ dia: "MIERCOLES", horaInicio: "18:00", horaFin: "20:00", aula: null }] },
];
const OTRA_EL_LUNES = [{ comision: { nombre: "Comisión A", materia: { nombre: "Física" }, bloques: [{ dia: "LUNES", horaInicio: "19:00", horaFin: "21:00" }] } }];

test("opciones: correlativas cumplidas y la comisión que choca marcada", async () => {
  const opciones = await opcionesDeInscripcion(dbFalsa({ requeridas: CUMPLE, comisiones: COMISIONES, otras: OTRA_EL_LUNES }), 7, 4, AHORA);
  assert.equal(opciones.puedeInscribirse, true);
  assert.equal(opciones.requiereComision, true);
  assert.deepEqual(opciones.requisitos.map((r) => [r.materia.codigo, r.situacion, r.cumple]), [["PROG1", "REGULAR", true], ["ALG", "APROBADA", true]]);
  assert.match(opciones.comisiones[0].choque, /Física/);
  assert.equal(opciones.comisiones[1].choque, null);
});

test("opciones: una materia de otro plan da 404; faltan correlativas → no puede", async () => {
  await assert.rejects(opcionesDeInscripcion(dbFalsa({ plan: 8 }), 7, 4, AHORA), (e) => e.status === 404);
  const opciones = await opcionesDeInscripcion(dbFalsa({ requeridas: [{ materiaId: 3, estado: "REGULAR", regularDesde: ISO("2026-07-01") }] }), 7, 4, AHORA);
  assert.equal(opciones.puedeInscribirse, false);
  assert.equal(opciones.motivo, "Te faltan correlativas: Álgebra (aprobada).");
});

test("inscribir: con comisión crea la cursada EN_CURSO y reemplaza la comisión de esa materia", async () => {
  const db = dbFalsa({ requeridas: CUMPLE, comisiones: COMISIONES });
  const resultado = await inscribirACursar(db, 7, { materiaId: 4, comisionId: 12 }, AHORA);
  assert.equal(resultado.comision.nombre, "Comisión B");
  assert.deepEqual(db.registro.upserts[0].create, { alumnoId: 7, materiaId: 4, estado: "EN_CURSO" });
  assert.deepEqual(db.registro.upserts[0].update, { estado: "EN_CURSO", nota: null, regularDesde: null, intentosFinal: 0, evaluacionesDesdeId: 0 }, "si estaba libre, recursa de cero");
  assert.deepEqual(db.registro.bajas, [{ alumnoId: 7, comision: { materiaId: 4 } }]);
  assert.deepEqual(db.registro.altas, [{ alumnoId: 7, comisionId: 12 }]);
});

test("inscribir: sin comisiones se inscribe directo; con comisiones la exige y controla choques", async () => {
  const directa = dbFalsa({ requeridas: CUMPLE });
  await inscribirACursar(directa, 7, { materiaId: 4, comisionId: null }, AHORA);
  assert.equal(directa.registro.altas.length, 0);
  await assert.rejects(inscribirACursar(dbFalsa({ requeridas: CUMPLE }), 7, { materiaId: 4, comisionId: 11 }, AHORA), /no tiene comisiones/);

  const casos = [
    [{ comisionId: null }, 400, /elegí con cuál/],
    [{ comisionId: 99 }, 400, /no es de esta materia/],
    [{ comisionId: 11 }, 409, /Se superpone con Física/],
  ];
  for (const [datos, status, mensaje] of casos) {
    const db = dbFalsa({ requeridas: CUMPLE, comisiones: COMISIONES, otras: OTRA_EL_LUNES });
    await assert.rejects(inscribirACursar(db, 7, { materiaId: 4, ...datos }, AHORA), (e) => e.status === status && mensaje.test(e.message));
    assert.equal(db.registro.upserts.length, 0, "no guarda nada");
  }
});

test("inscribir: ya inscripto es 409; sin correlativas es 400", async () => {
  await assert.rejects(inscribirACursar(dbFalsa({ requeridas: CUMPLE, cursadaPropia: { id: 50, estado: "EN_CURSO" } }), 7, { materiaId: 4 }, AHORA), (e) => e.status === 409);
  await assert.rejects(inscribirACursar(dbFalsa(), 7, { materiaId: 4 }, AHORA), (e) => e.status === 400 && /correlativas/.test(e.message));
});

// ---------- HTTP ----------

test("HTTP: solo ALUMNO, y el alumno sale del token", async () => {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/inscripciones-cursada", crearRouterInscripcionesCursada(dbFalsa({ requeridas: CUMPLE }))); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol, body) => fetch(`http://127.0.0.1:${server.address().port}/api/inscripciones-cursada${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id: 7, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    assert.equal((await request("GET", "/4", null)).status, 401);
    for (const rol of ["DOCENTE", "ADMIN"]) assert.equal((await request("POST", "/", rol, { materiaId: 4 })).status, 403);
    assert.equal((await request("GET", "/4", "ALUMNO")).status, 200);
    assert.equal((await request("POST", "/", "ALUMNO", { materiaId: 4, alumnoId: 999 })).status, 201);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("inscribir: al recursar, las evaluaciones de la cursada anterior quedan antes del corte", async () => {
  const db = dbFalsa({ requeridas: CUMPLE, cursadaPropia: { id: 50, estado: "LIBRE" }, ultimaEvaluacion: { id: 11 } });
  await inscribirACursar(db, 7, { materiaId: 4 }, AHORA);
  assert.equal(db.registro.ultimaDe, 50);
  assert.equal(db.registro.upserts[0].update.evaluacionesDesdeId, 11);
});

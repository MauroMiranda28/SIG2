import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterNotas } from "../src/routes/notas.js";
import {
  validarNota, validarFecha, validarCargaNotas, validarCorreccionNota, validarCondicionMateria,
  estadoDeCursada, verificarCarga, vencimientoRegularidad,
} from "../src/services/notas.js";
import { manejarErrores } from "../src/middleware/errores.js";

// ---------- Validación (sin DB) ----------

const carga = () => ({ tipo: "PARCIAL", fecha: "2026-05-12", notas: [{ alumnoId: 2, nota: 7.5 }, { alumnoId: 3, nota: "6,25", observaciones: "  Faltó   el ejercicio 4 " }] });

test("validarNota: acepta 0 a 10 con hasta dos decimales, también con coma", () => {
  assert.equal(validarNota(0), 0);
  assert.equal(validarNota(10), 10);
  assert.equal(validarNota("7,5"), 7.5);
  assert.equal(validarNota("6.25"), 6.25);
  for (const v of [-1, 10.5, 7.125, "", "   ", "abc", null, undefined, NaN, Infinity, true, [7]]) {
    assert.throws(() => validarNota(v), (e) => e.status === 400, String(v));
  }
});

test("validarFecha: solo AAAA-MM-DD de calendario real, guardada a medianoche UTC", () => {
  assert.equal(validarFecha("2026-05-12").toISOString(), "2026-05-12T00:00:00.000Z");
  for (const v of ["2026-02-30", "12/05/2026", "2026-5-1", "", null, 20260512]) {
    assert.throws(() => validarFecha(v), (e) => e.status === 400, String(v));
  }
});

test("validarCargaNotas: normaliza notas y observaciones", () => {
  const { tipo, fecha, notas } = validarCargaNotas(carga());
  assert.equal(tipo, "PARCIAL");
  assert.equal(fecha.toISOString(), "2026-05-12T00:00:00.000Z");
  assert.deepEqual(notas, [
    { alumnoId: 2, nota: 7.5, observaciones: null, condicion: null },
    { alumnoId: 3, nota: 6.25, observaciones: "Faltó el ejercicio 4", condicion: null },
  ]);
});

test("validarCargaNotas: rechaza datos inválidos", () => {
  const casos = [
    null, [], {}, { ...carga(), tipo: "COLOQUIO" }, { ...carga(), fecha: "ayer" }, { ...carga(), notas: [] },
    { ...carga(), notas: [{ alumnoId: 2, nota: 11 }] }, { ...carga(), notas: [{ alumnoId: 0, nota: 5 }] },
    { ...carga(), notas: [{ alumnoId: 2, nota: 5 }, { alumnoId: 2, nota: 6 }] },
    { ...carga(), notas: [null] }, { ...carga(), notas: [{ alumnoId: 2, nota: 5, observaciones: 3 }] },
    { ...carga(), notas: [{ alumnoId: 2, nota: 5, observaciones: "a".repeat(501) }] },
  ];
  for (const body of casos) assert.throws(() => validarCargaNotas(body), (e) => e.status === 400, JSON.stringify(body));
});

test("validarCorreccionNota: exige nota válida y motivo", () => {
  assert.deepEqual(validarCorreccionNota({ nota: 8, motivo: "  Error   de suma " }), { nota: 8, motivo: "Error de suma" });
  for (const body of [null, {}, { nota: 8 }, { nota: 8, motivo: "   " }, { nota: 8, motivo: "abc" }, { nota: 12, motivo: "Error de suma" }, { nota: 8, motivo: "a".repeat(501) }]) {
    assert.throws(() => validarCorreccionNota(body), (e) => e.status === 400, JSON.stringify(body));
  }
});

// ---------- Contrato HTTP (DB simulada) ----------

const MATERIA = { id: 5, nombre: "Programación I", codigo: "PROG1" };

// DB falsa: `asignada` decide si el docente 7 dicta la materia 5.
const NOMBRES = { 2: ["Ana", "Díaz"], 3: ["Beto", "Gómez"] };
const CONDICION = { esPromocional: true, notaRegularizacion: 4, notaPromocion: 7, notaAprobacionFinal: 4 };

// DB falsa: `asignada` decide si el docente 7 dicta la materia 5; `cursada` es el estado actual del alumno;
// `finales` son las condiciones/exámenes que devuelve la base al recalcular.
function dbFalsa({
  asignada = true, alumnosValidos = [2, 3], repetidas = [], finales = [], condicion = CONDICION, cursada = { estado: "EN_CURSO", regularDesde: null },
  evaluacion = { nota: 4, tipo: "PARCIAL", condicion: null, cursadaId: 102, cursada: { materiaId: 5, materia: CONDICION } }, ...extra
} = {}) {
  const registro = { cursadas: [], evaluaciones: [], cambios: [], updates: [], cierres: [] };
  const db = {
    registro,
    materia: { findUnique: async () => ({ ...MATERIA, ...condicion }) },
    materiaDocente: { findUnique: async ({ where }) => (asignada && where.materiaId_docenteId.docenteId === 7 ? { materiaId: 5 } : null) },
    usuario: {
      findMany: async ({ where }) => (where.id
        ? alumnosValidos.filter((id) => where.id.in.includes(id)).map((id) => ({ id, nombre: NOMBRES[id][0], apellido: NOMBRES[id][1] }))
        : []),
    },
    cursada: {
      upsert: async (args) => { registro.cursadas.push(args); return { id: 100 + args.where.alumnoId_materiaId.alumnoId, ...cursada }; },
      update: async (args) => { registro.cierres.push(args); return {}; },
      updateMany: async (args) => { registro.cierres.push(args); return { count: 0 }; },
    },
    evaluacion: {
      // Con cursadaId es la búsqueda de finales; sin él, la de cargas repetidas.
      findMany: async ({ where }) => (where.cursadaId ? finales : repetidas),
      findUnique: async () => evaluacion,
      create: async ({ data }) => { registro.evaluaciones.push(data); return { id: registro.evaluaciones.length, ...data, cursada: { alumnoId: data.cursadaId - 100 } }; },
      update: async (args) => { registro.updates.push(args); return { id: args.where.id, nota: args.data.nota, cambios: registro.cambios }; },
    },
    cambioNota: { create: async ({ data }) => { registro.cambios.push(data); return data; } },
    ...extra,
  };
  db.$transaction = async (fn) => fn(db);
  return db;
}

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/notas", crearRouterNotas(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol, body, id = 7) => fetch(`http://127.0.0.1:${server.address().port}/api/notas${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP: exige login y rol DOCENTE o ADMIN", async () => {
  await conAPI(dbFalsa(), async (request) => {
    assert.equal((await request("GET", "/materias/5", null)).status, 401);
    assert.equal((await request("GET", "/materias/5", "ALUMNO")).status, 403);
    assert.equal((await request("POST", "/materias/5", "ALUMNO", carga())).status, 403);
    assert.equal((await request("PATCH", "/evaluaciones/1", "ALUMNO", { nota: 8, motivo: "Error de suma" })).status, 403);
  });
});

test("HTTP: un docente NO asignado a la materia no puede ver, cargar ni corregir", async () => {
  const db = dbFalsa({ asignada: false });
  await conAPI(db, async (request) => {
    assert.equal((await request("GET", "/materias/5", "DOCENTE")).status, 403);
    assert.equal((await request("POST", "/materias/5", "DOCENTE", carga())).status, 403);
    assert.equal((await request("PATCH", "/evaluaciones/1", "DOCENTE", { nota: 8, motivo: "Error de suma" })).status, 403);
  });
  assert.equal(db.registro.evaluaciones.length + db.registro.cambios.length, 0, "no escribe nada");
});

test("HTTP: lista los alumnos de la materia con sus evaluaciones", async () => {
  let where;
  const db = dbFalsa({ usuario: { findMany: async (args) => { where = args.where; return [
    { id: 2, nombre: "Ana", apellido: "Díaz", email: "ana@alumnos.ucse.edu.ar", cursadas: [{ evaluaciones: [{ id: 1, nota: 7 }] }] },
    { id: 3, nombre: "Beto", apellido: "Gómez", email: "beto@alumnos.ucse.edu.ar", cursadas: [] },
  ]; } } });
  await conAPI(db, async (request) => {
    const r = await request("GET", "/materias/5", "DOCENTE");
    assert.equal(r.status, 200);
    const { materia, alumnos } = await r.json();
    assert.equal(materia.codigo, "PROG1");
    assert.equal(where.rol, "ALUMNO");
    assert.deepEqual(alumnos.map((a) => a.evaluaciones.length), [1, 0]);
    assert.equal("cursadas" in alumnos[0], false);
  });
});

test("HTTP: carga las notas, crea la cursada si falta y registra quién las cargó", async () => {
  const db = dbFalsa();
  await conAPI(db, async (request) => {
    const r = await request("POST", "/materias/5", "DOCENTE", carga());
    assert.equal(r.status, 201);
    const creadas = await r.json();
    assert.deepEqual(creadas.map((e) => [e.alumnoId, e.nota]), [[2, 7.5], [3, 6.25]]);
  });
  assert.deepEqual(db.registro.cursadas[0].where, { alumnoId_materiaId: { alumnoId: 2, materiaId: 5 } });
  assert.deepEqual(db.registro.cursadas[0].update, {}, "no pisa el estado de una cursada existente");
  assert.ok(db.registro.evaluaciones.every((e) => e.cargadaPorId === 7 && e.tipo === "PARCIAL"));
});

test("HTTP: rechaza alumnos que no cursan la materia y cargas repetidas", async () => {
  const ajeno = dbFalsa({ alumnosValidos: [2] });
  await conAPI(ajeno, async (request) => {
    assert.equal((await request("POST", "/materias/5", "DOCENTE", carga())).status, 400);
  });
  assert.equal(ajeno.registro.evaluaciones.length, 0);

  const repetida = dbFalsa({ repetidas: [{ cursada: { alumnoId: 2 } }] });
  await conAPI(repetida, async (request) => {
    const r = await request("POST", "/materias/5", "DOCENTE", carga());
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /Ana Díaz/);
  });
  assert.equal(repetida.registro.evaluaciones.length, 0);
});

test("HTTP: corregir una nota deja el registro del cambio con autor y motivo", async () => {
  const db = dbFalsa();
  await conAPI(db, async (request) => {
    const r = await request("PATCH", "/evaluaciones/1", "DOCENTE", { nota: 6, motivo: "Error al sumar el ejercicio 2" });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).nota, 6);
  });
  assert.deepEqual(db.registro.cambios, [{ evaluacionId: 1, notaAnterior: 4, notaNueva: 6, motivo: "Error al sumar el ejercicio 2", autorId: 7 }]);
  assert.deepEqual(db.registro.updates[0].data, { nota: 6 }, "solo cambia la nota");
});

test("HTTP: corrección inválida, igual a la actual o de una evaluación inexistente", async () => {
  const db = dbFalsa();
  await conAPI(db, async (request) => {
    assert.equal((await request("PATCH", "/evaluaciones/1", "DOCENTE", { nota: 6 })).status, 400);
    assert.equal((await request("PATCH", "/evaluaciones/1", "DOCENTE", { nota: 4, motivo: "Sin cambios reales" })).status, 400);
    assert.equal((await request("PATCH", "/evaluaciones/abc", "DOCENTE", { nota: 6, motivo: "Error de suma" })).status, 400);
  });
  assert.equal(db.registro.cambios.length, 0);

  await conAPI(dbFalsa({ evaluacion: null }), async (request) => {
    assert.equal((await request("PATCH", "/evaluaciones/99", "DOCENTE", { nota: 6, motivo: "Error de suma" })).status, 404);
  });
});

// ---------- Condición de la materia ----------

test("validarCondicionMateria: promocional con las tres notas; no promocional sin nota de promoción", () => {
  assert.deepEqual(validarCondicionMateria({ esPromocional: true, notaRegularizacion: "4", notaPromocion: 7, notaAprobacionFinal: 4 }), CONDICION);
  assert.deepEqual(validarCondicionMateria({ esPromocional: false, notaRegularizacion: 6, notaPromocion: 9, notaAprobacionFinal: 4 }),
    { esPromocional: false, notaRegularizacion: 6, notaPromocion: null, notaAprobacionFinal: 4 });
});

test("validarCondicionMateria: rechaza datos faltantes o inconsistentes", () => {
  const base = { esPromocional: true, notaRegularizacion: 4, notaPromocion: 7, notaAprobacionFinal: 4 };
  const casos = [null, {}, { ...base, esPromocional: "si" }, { ...base, notaRegularizacion: "" }, { ...base, notaRegularizacion: 11 },
    { ...base, notaPromocion: null }, { ...base, notaPromocion: 4 }, { ...base, notaPromocion: 3 }, { ...base, notaAprobacionFinal: undefined }];
  for (const body of casos) assert.throws(() => validarCondicionMateria(body), (e) => e.status === 400, JSON.stringify(body));
});

test("validarCargaNotas: la condición final exige regular o promocionado por alumno", () => {
  const condicionFinal = { tipo: "CONDICION_FINAL", fecha: "2026-07-01", notas: [{ alumnoId: 2, nota: 8, condicion: "PROMOCIONADO" }] };
  assert.equal(validarCargaNotas(condicionFinal).notas[0].condicion, "PROMOCIONADO");
  assert.throws(() => validarCargaNotas({ ...condicionFinal, notas: [{ alumnoId: 2, nota: 8 }] }), (e) => e.status === 400);
  assert.throws(() => validarCargaNotas({ ...condicionFinal, notas: [{ alumnoId: 2, nota: 8, condicion: "LIBRE" }] }), (e) => e.status === 400);
  assert.equal(validarCargaNotas(carga()).notas[0].condicion, null, "en un parcial se ignora");
});

// ---------- Regularidad: estado de la cursada (función pura) ----------

const ev = (id, tipo, fecha, nota, condicion = null) => ({ id, tipo, fecha: new Date(`${fecha}T00:00:00Z`), nota, condicion });
const regular = (fecha = "2026-07-01", nota = 5) => ev(1, "CONDICION_FINAL", fecha, nota, "REGULAR");

test("estado: sin condición ni finales no toca la cursada", () => {
  assert.equal(estadoDeCursada([ev(1, "PARCIAL", "2026-05-01", 8)], CONDICION), null);
});

test("estado: promocionado aprueba con la nota de promoción", () => {
  assert.deepEqual(estadoDeCursada([ev(1, "CONDICION_FINAL", "2026-07-01", 8, "PROMOCIONADO")], CONDICION),
    { estado: "APROBADA", nota: 8, regularDesde: null, intentosFinal: 0 });
});

test("estado: regular queda REGULAR desde esa fecha y se vence a los 2 años", () => {
  const estado = estadoDeCursada([regular()], CONDICION);
  assert.equal(estado.estado, "REGULAR");
  assert.equal(estado.regularDesde.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(vencimientoRegularidad(estado.regularDesde).toISOString(), "2028-07-01T00:00:00.000Z");
});

test("estado: el final aprobado (según la materia) aprueba; los desaprobados suman intentos", () => {
  const exigente = { ...CONDICION, notaAprobacionFinal: 6 };
  const dos = estadoDeCursada([regular(), ev(2, "FINAL", "2026-08-01", 5), ev(3, "FINAL", "2026-12-01", 3)], exigente);
  assert.deepEqual([dos.estado, dos.intentosFinal], ["REGULAR", 2], "un 5 no alcanza si el final se aprueba con 6");

  const aprobada = estadoDeCursada([regular(), ev(2, "FINAL", "2026-08-01", 3), ev(3, "FINAL", "2026-12-01", 6)], exigente);
  assert.deepEqual([aprobada.estado, aprobada.nota, aprobada.intentosFinal], ["APROBADA", 6, 2]);
});

test("estado: desaprobado el tercer final pierde la regularidad (PENDIENTE) y puede volver a regularizar", () => {
  const tres = [regular(), ev(2, "FINAL", "2026-08-01", 2), ev(3, "FINAL", "2026-12-01", 3), ev(4, "FINAL", "2027-03-01", 1)];
  assert.deepEqual(estadoDeCursada(tres, CONDICION), { estado: "PENDIENTE", nota: null, regularDesde: null, intentosFinal: 0 });

  const recurso = estadoDeCursada([...tres, ev(5, "CONDICION_FINAL", "2027-12-01", 6, "REGULAR"), ev(6, "FINAL", "2028-02-01", 2)], CONDICION);
  assert.deepEqual([recurso.estado, recurso.intentosFinal], ["REGULAR", 1], "los intentos arrancan de cero");
});

test("estado: no cuentan finales fuera del plazo ni sin regularidad; el orden es por fecha", () => {
  assert.equal(estadoDeCursada([regular(), ev(2, "FINAL", "2028-07-02", 9)], CONDICION).estado, "REGULAR", "vencido: no aprueba");
  assert.equal(estadoDeCursada([ev(2, "FINAL", "2026-06-01", 9)], CONDICION).estado, "EN_CURSO", "sin regularidad: no cuenta");
  // Llegan desordenados (ej. una corrección): igual se procesan por fecha.
  assert.equal(estadoDeCursada([ev(2, "FINAL", "2026-08-01", 8), regular()], CONDICION).estado, "APROBADA");
});

// ---------- Verificación de cada carga ----------

const contexto = (cursada = { estado: "EN_CURSO", regularDesde: null }, materia = CONDICION) => ({ cursada, materia, nombre: "Ana Díaz" });
const fecha = (texto) => new Date(`${texto}T00:00:00Z`);

test("verificarCarga: condición final según la configuración de la materia", () => {
  const cf = (condicion, nota) => ({ tipo: "CONDICION_FINAL", condicion, nota, fecha: fecha("2026-07-01") });
  verificarCarga(cf("PROMOCIONADO", 7), contexto());
  verificarCarga(cf("REGULAR", 4), contexto());
  assert.throws(() => verificarCarga(cf("PROMOCIONADO", 6.99), contexto()), /promocionar hace falta 7/);
  assert.throws(() => verificarCarga(cf("REGULAR", 3), contexto()), /regularizar hace falta 4.*Ana Díaz/);
  assert.throws(() => verificarCarga(cf("PROMOCIONADO", 9), contexto(undefined, { ...CONDICION, esPromocional: false })), /no es promocional/);
  assert.throws(() => verificarCarga(cf("REGULAR", 5), contexto({ estado: "APROBADA" })), (e) => e.status === 409);
  assert.throws(() => verificarCarga(cf("REGULAR", 5), contexto({ estado: "REGULAR", regularDesde: new Date() })), /ya está regular/);
  // Regularidad vencida: puede volver a regularizar.
  verificarCarga(cf("REGULAR", 5), contexto({ estado: "REGULAR", regularDesde: fecha("2020-01-01") }));
});

test("verificarCarga: el examen final solo para regulares y dentro del plazo", () => {
  const final = (texto) => ({ tipo: "FINAL", nota: 6, fecha: fecha(texto) });
  const esRegular = { estado: "REGULAR", regularDesde: fecha("2026-07-01") };
  verificarCarga(final("2028-07-01"), contexto(esRegular));
  assert.throws(() => verificarCarga(final("2026-08-01"), contexto()), /no está regular/);
  assert.throws(() => verificarCarga(final("2026-06-30"), contexto(esRegular)), /anterior a la regularización/);
  assert.throws(() => verificarCarga(final("2028-07-02"), contexto(esRegular)), /venció el 1\/7\/2028/);
});

// ---------- HTTP: condición final y examen final ----------

test("HTTP: sin la condición de la materia configurada no se cargan condiciones ni finales", async () => {
  const db = dbFalsa({ condicion: { esPromocional: false, notaRegularizacion: null, notaPromocion: null, notaAprobacionFinal: null } });
  await conAPI(db, async (request) => {
    const r = await request("POST", "/materias/5", "DOCENTE", { tipo: "CONDICION_FINAL", fecha: "2026-07-01", notas: [{ alumnoId: 2, nota: 8, condicion: "REGULAR" }] });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /Mis materias/);
    assert.equal((await request("POST", "/materias/5", "DOCENTE", carga())).status, 201, "un parcial no necesita la condición");
  });
});

test("HTTP: la condición final guarda la condición y recalcula la cursada", async () => {
  const db = dbFalsa({ finales: [ev(1, "CONDICION_FINAL", "2026-07-01", 8, "PROMOCIONADO")] });
  await conAPI(db, async (request) => {
    const r = await request("POST", "/materias/5", "DOCENTE", { tipo: "CONDICION_FINAL", fecha: "2026-07-01", notas: [{ alumnoId: 2, nota: 8, condicion: "PROMOCIONADO" }] });
    assert.equal(r.status, 201);
  });
  assert.equal(db.registro.evaluaciones[0].condicion, "PROMOCIONADO");
  assert.deepEqual(db.registro.cierres, [{ where: { id: 102 }, data: { estado: "APROBADA", nota: 8, regularDesde: null, intentosFinal: 0 } }]);
});

test("HTTP: un examen final a alguien que no es regular se rechaza sin guardar nada", async () => {
  const db = dbFalsa();
  await conAPI(db, async (request) => {
    const r = await request("POST", "/materias/5", "DOCENTE", { tipo: "FINAL", fecha: "2026-08-01", notas: [{ alumnoId: 2, nota: 8 }] });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /Ana Díaz no está regular/);
  });
  assert.equal(db.registro.evaluaciones.length, 0);
});

test("HTTP: corregir una condición final por debajo del mínimo se rechaza; un final corregido recalcula", async () => {
  const promo = dbFalsa({ evaluacion: { nota: 8, tipo: "CONDICION_FINAL", condicion: "PROMOCIONADO", cursadaId: 102, cursada: { materiaId: 5, materia: CONDICION } } });
  await conAPI(promo, async (request) => {
    assert.equal((await request("PATCH", "/evaluaciones/1", "DOCENTE", { nota: 6, motivo: "Error de suma" })).status, 400);
  });
  assert.equal(promo.registro.cambios.length, 0);

  const final = dbFalsa({
    evaluacion: { nota: 6, tipo: "FINAL", condicion: null, cursadaId: 102, cursada: { materiaId: 5, materia: CONDICION } },
    finales: [regular(), ev(2, "FINAL", "2026-08-01", 2)],
  });
  await conAPI(final, async (request) => {
    assert.equal((await request("PATCH", "/evaluaciones/2", "DOCENTE", { nota: 2, motivo: "Mal sumado el ejercicio 3" })).status, 200);
  });
  assert.equal(final.registro.cierres[0].data.estado, "REGULAR");
  assert.equal(final.registro.cierres[0].data.intentosFinal, 1);
});

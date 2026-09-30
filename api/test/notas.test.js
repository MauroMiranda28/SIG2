import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterNotas } from "../src/routes/notas.js";
import { validarNota, validarFecha, validarCargaNotas, validarCorreccionNota, actualizarCursadaPorFinales } from "../src/services/notas.js";
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
    { alumnoId: 2, nota: 7.5, observaciones: null },
    { alumnoId: 3, nota: 6.25, observaciones: "Faltó el ejercicio 4" },
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
function dbFalsa({ asignada = true, alumnosValidos = [2, 3], repetidas = [], finales = [], evaluacion = { nota: 4, tipo: "PARCIAL", cursadaId: 102, cursada: { materiaId: 5 } }, ...extra } = {}) {
  const registro = { cursadas: [], evaluaciones: [], cambios: [], updates: [], cierres: [] };
  const db = {
    registro,
    materia: { findUnique: async () => MATERIA },
    materiaDocente: { findUnique: async ({ where }) => (asignada && where.materiaId_docenteId.docenteId === 7 ? { materiaId: 5 } : null) },
    usuario: {
      findMany: async ({ where }) => (where.id ? alumnosValidos.filter((id) => where.id.in.includes(id)).map((id) => ({ id })) : []),
    },
    cursada: {
      upsert: async (args) => { registro.cursadas.push(args); return { id: 100 + args.where.alumnoId_materiaId.alumnoId }; },
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

  const repetida = dbFalsa({ repetidas: [{ cursada: { alumno: { nombre: "Ana", apellido: "Díaz" } } }] });
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

// ---------- Finales: cierran la cursada ----------

function txFinales(finales) {
  const llamadas = [];
  return {
    llamadas,
    evaluacion: { findMany: async (args) => { llamadas.push(["findMany", args.where]); return finales; } },
    cursada: {
      update: async (args) => { llamadas.push(["update", args]); },
      updateMany: async (args) => { llamadas.push(["updateMany", args]); },
    },
  };
}

test("finales: el aprobado más reciente aprueba la materia con su nota", async () => {
  const tx = txFinales([{ nota: 2 }, { nota: 7 }, { nota: 9 }]); // ya vienen ordenados del más reciente al más viejo
  await actualizarCursadaPorFinales(tx, 102);
  assert.deepEqual(tx.llamadas[0], ["findMany", { cursadaId: 102, tipo: "FINAL" }]);
  assert.deepEqual(tx.llamadas[1], ["update", { where: { id: 102 }, data: { estado: "APROBADA", nota: 7 } }]);
});

test("finales: con 4 aprueba; sin finales aprobados solo revierte una cursada APROBADA", async () => {
  const conCuatro = txFinales([{ nota: 4 }]);
  await actualizarCursadaPorFinales(conCuatro, 102);
  assert.equal(conCuatro.llamadas[1][1].data.estado, "APROBADA");

  const desaprobado = txFinales([{ nota: 3.99 }]);
  await actualizarCursadaPorFinales(desaprobado, 102);
  assert.deepEqual(desaprobado.llamadas[1], ["updateMany", { where: { id: 102, estado: "APROBADA" }, data: { estado: "EN_CURSO", nota: null } }]);
});

test("HTTP: cargar un final aprobado cierra la cursada; un parcial no la toca", async () => {
  const final = dbFalsa({ finales: [{ nota: 8 }] });
  await conAPI(final, async (request) => {
    const r = await request("POST", "/materias/5", "DOCENTE", { ...carga(), tipo: "FINAL", notas: [{ alumnoId: 2, nota: 8 }] });
    assert.equal(r.status, 201);
  });
  assert.deepEqual(final.registro.cierres, [{ where: { id: 102 }, data: { estado: "APROBADA", nota: 8 } }]);

  const parcial = dbFalsa({ finales: [{ nota: 8 }] });
  await conAPI(parcial, async (request) => {
    assert.equal((await request("POST", "/materias/5", "DOCENTE", carga())).status, 201);
  });
  assert.equal(parcial.registro.cierres.length, 0);
});

test("HTTP: corregir un final hacia abajo vuelve la materia a EN_CURSO", async () => {
  const db = dbFalsa({ evaluacion: { nota: 6, tipo: "FINAL", cursadaId: 102, cursada: { materiaId: 5 } }, finales: [{ nota: 2 }] });
  await conAPI(db, async (request) => {
    assert.equal((await request("PATCH", "/evaluaciones/1", "DOCENTE", { nota: 2, motivo: "Mal sumado el ejercicio 3" })).status, 200);
  });
  assert.deepEqual(db.registro.cierres, [{ where: { id: 102, estado: "APROBADA" }, data: { estado: "EN_CURSO", nota: null } }]);
});

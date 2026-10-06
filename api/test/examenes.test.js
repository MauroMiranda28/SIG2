import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterExamenes } from "../src/routes/examenes.js";
import { manejarErrores } from "../src/middleware/errores.js";
import {
  avisoExamen, cambioRelevante, describirExamen, hoy, validarCambioExamen, validarNuevoExamen,
} from "../src/services/examenes.js";

// ---------- Validación y textos (sin DB) ----------

const AHORA = new Date("2026-10-06T15:00:00Z"); // 12:00 en Argentina

test("hoy: usa la fecha de Argentina (a la noche local ya es otro día en UTC)", () => {
  assert.equal(hoy(AHORA).toISOString(), "2026-10-06T00:00:00.000Z");
  assert.equal(hoy(new Date("2026-10-07T01:30:00Z")).toISOString(), "2026-10-06T00:00:00.000Z", "22:30 del 6 en Argentina");
});

test("validarNuevoExamen: acepta uno válido, con hora y aula opcionales", () => {
  assert.deepEqual(validarNuevoExamen({ tipo: "PARCIAL", fecha: "2026-10-20" }, AHORA),
    { tipo: "PARCIAL", fecha: new Date("2026-10-20T00:00:00Z"), hora: null, aulaId: null });
  assert.deepEqual(validarNuevoExamen({ tipo: "FINAL", fecha: "2026-10-06", hora: "18:30", aulaId: "3" }, AHORA),
    { tipo: "FINAL", fecha: new Date("2026-10-06T00:00:00Z"), hora: "18:30", aulaId: 3 }, "hoy mismo vale");
});

test("validarNuevoExamen: rechaza tipo, fecha, hora o aula inválidos y fechas pasadas", () => {
  const ok = { tipo: "PARCIAL", fecha: "2026-10-20" };
  for (const body of [null, [], {}, { ...ok, tipo: "TP" }, { ...ok, fecha: undefined }, { ...ok, fecha: "20/10/2026" }, { ...ok, fecha: "2026-10-05" },
    { ...ok, hora: "7:00" }, { ...ok, hora: "24:00" }, { ...ok, aulaId: 0 }, { ...ok, aulaId: "x" }]) {
    assert.throws(() => validarNuevoExamen(body, AHORA), (e) => e.status === 400, JSON.stringify(body));
  }
});

test("validarCambioExamen: solo los campos que vienen, se pueden vaciar hora y aula, y exige algún cambio", () => {
  assert.deepEqual(validarCambioExamen({ hora: "10:00" }, AHORA), { hora: "10:00" });
  assert.deepEqual(validarCambioExamen({ hora: null, aulaId: null }, AHORA), { hora: null, aulaId: null });
  assert.deepEqual(validarCambioExamen({ fecha: "2026-11-02" }, AHORA), { fecha: new Date("2026-11-02T00:00:00Z") });
  for (const body of [null, {}, { fecha: "2026-10-01" }, { hora: "99:99" }, { tipo: "FINAL" }]) {
    assert.throws(() => validarCambioExamen(body, AHORA), (e) => e.status === 400, JSON.stringify(body));
  }
});

test("textos de los avisos: nuevo, reprogramado y cancelado", () => {
  const examen = { tipo: "PARCIAL", fecha: new Date("2026-10-20T00:00:00Z"), hora: "18:00", aula: { id: 1, nombre: "Aula 1" } };
  assert.equal(describirExamen(examen), "martes, 20/10/2026 a las 18:00 · Aula 1");
  assert.equal(describirExamen({ fecha: examen.fecha }), "martes, 20/10/2026");

  assert.deepEqual(avisoExamen({ accion: "NUEVO", materiaNombre: "Programación I", examen }), {
    titulo: "Parcial de Programación I", mensaje: "Fecha: martes, 20/10/2026 a las 18:00 · Aula 1.",
  });
  const anterior = { ...examen, fecha: new Date("2026-10-13T00:00:00Z"), hora: null, aula: null };
  const reprogramado = avisoExamen({ accion: "REPROGRAMADO", materiaNombre: "Programación I", examen, anterior });
  assert.equal(reprogramado.titulo, "Se reprogramó el parcial de Programación I");
  assert.match(reprogramado.mensaje, /Nueva fecha: martes, 20\/10\/2026 a las 18:00 · Aula 1\. Antes estaba previsto para martes, 13\/10\/2026\./);
  const cancelado = avisoExamen({ accion: "CANCELADO", materiaNombre: "Programación I", examen: { ...examen, tipo: "FINAL" } });
  assert.equal(cancelado.titulo, "Se canceló el examen final de Programación I");
});

test("cambioRelevante: fecha, hora o aula; lo demás no", () => {
  const base = { fecha: new Date("2026-10-20T00:00:00Z"), hora: "18:00", aula: { id: 1 } };
  assert.equal(cambioRelevante(base, { ...base }), false);
  assert.equal(cambioRelevante(base, { ...base, fecha: new Date("2026-10-21T00:00:00Z") }), true);
  assert.equal(cambioRelevante(base, { ...base, hora: null }), true);
  assert.equal(cambioRelevante(base, { ...base, aula: { id: 2 } }), true);
  assert.equal(cambioRelevante({ ...base, hora: undefined }, { ...base, hora: null }), false, "undefined y null son lo mismo");
});

// ---------- Contrato HTTP (DB en memoria) ----------

// Materia 5 dictada por el docente 7 (alumnos 21 y 22); la 6 es de otro docente.
function dbExamenes({ alumnos = [{ id: 21 }, { id: 22 }], aulas = [{ id: 1, nombre: "Aula 1" }] } = {}) {
  const estado = { examenes: [], notificaciones: [], sig: 1, filtroAlumnos: null };
  const MATERIAS = { 5: { id: 5, nombre: "Programación I", codigo: "PROG1" }, 6: { id: 6, nombre: "Base de Datos", codigo: "BD1" } };
  const conAula = (e) => ({ ...e, aula: aulas.find((a) => a.id === e.aulaId) ?? null });
  const proyectar = (e) => { const { aulaId, creadoPorId, ...resto } = conAula(e); return resto; };
  const db = {
    estado,
    materia: { findUnique: async ({ where }) => MATERIAS[where.id] ?? null },
    materiaDocente: { findUnique: async ({ where }) => (where.materiaId_docenteId.materiaId === 5 && where.materiaId_docenteId.docenteId === 7 ? { materiaId: 5 } : null) },
    aula: { findUnique: async ({ where }) => aulas.find((a) => a.id === where.id) ?? null },
    usuario: { findMany: async ({ where }) => { estado.filtroAlumnos = where; return alumnos; } },
    fechaExamen: {
      findMany: async ({ where }) => estado.examenes.filter((e) => e.materiaId === where.materiaId).map(proyectar),
      findUnique: async ({ where, select }) => { const e = estado.examenes.find((x) => x.id === where.id); return e ? (select.materiaId && !select.tipo ? { materiaId: e.materiaId } : proyectar(e)) : null; },
      create: async ({ data }) => { const e = { id: estado.sig++, ...data }; estado.examenes.push(e); return proyectar(e); },
      update: async ({ where, data }) => { const e = estado.examenes.find((x) => x.id === where.id); Object.assign(e, data); return proyectar(e); },
      delete: async ({ where }) => { estado.examenes = estado.examenes.filter((e) => e.id !== where.id); return {}; },
    },
    notificacion: { createMany: async ({ data }) => { estado.notificaciones.push(...data); return { count: data.length }; } },
  };
  // Transacción con rollback: si algo falla se restaura lo que había.
  db.$transaction = async (fn) => {
    const copia = { examenes: estado.examenes.map((e) => ({ ...e })), notificaciones: [...estado.notificaciones], sig: estado.sig };
    try { return await fn(db); } catch (e) { Object.assign(estado, copia); throw e; }
  };
  return db;
}

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/examenes", crearRouterExamenes(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol, body, id = 7) => fetch(`http://127.0.0.1:${server.address().port}/api/examenes${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

const futuro = (dias) => new Date(Date.now() + dias * 86400e3).toISOString().slice(0, 10);

test("HTTP: exige login y rol DOCENTE o ADMIN", async () => {
  const db = dbExamenes();
  await conAPI(db, async (request) => {
    for (const [metodo, ruta, body] of [["GET", "/materias/5"], ["POST", "/materias/5", { tipo: "PARCIAL", fecha: futuro(10) }], ["PATCH", "/1", { hora: "10:00" }], ["DELETE", "/1"]]) {
      assert.equal((await request(metodo, ruta, null, body)).status, 401, `${metodo} ${ruta} sin login`);
      assert.equal((await request(metodo, ruta, "ALUMNO", body, 21)).status, 403, `${metodo} ${ruta} alumno`);
    }
  });
  assert.equal(db.estado.examenes.length + db.estado.notificaciones.length, 0);
});

test("HTTP: el docente asignado programa un examen y avisa a los alumnos de la materia", async () => {
  const db = dbExamenes();
  await conAPI(db, async (request) => {
    const fecha = futuro(14);
    const r = await request("POST", "/materias/5", "DOCENTE", { tipo: "PARCIAL", fecha, hora: "18:00", aulaId: 1 });
    assert.equal(r.status, 201);
    const examen = await r.json();
    assert.equal(examen.tipo, "PARCIAL");
    assert.equal(examen.aula.nombre, "Aula 1");
    assert.equal(db.estado.examenes[0].creadoPorId, 7, "el autor sale del token");
    assert.equal(db.estado.examenes[0].materiaId, 5);
  });
  assert.deepEqual(db.estado.notificaciones.map((n) => n.usuarioId), [21, 22]);
  for (const n of db.estado.notificaciones) {
    assert.equal(n.tipo, "FECHA_EXAMEN");
    assert.equal(n.materiaId, 5);
    assert.equal(n.autorId, 7);
    assert.equal(n.titulo, "Parcial de Programación I");
    assert.match(n.mensaje, /a las 18:00 · Aula 1\.$/);
  }
  assert.equal(db.estado.filtroAlumnos.rol, "ALUMNO");
  assert.deepEqual(db.estado.filtroAlumnos.OR[0], { cursadas: { some: { materiaId: 5 } } });
});

test("HTTP: un docente NO asignado recibe 403 en todo y no se guarda ni avisa nada", async () => {
  const db = dbExamenes();
  db.estado.examenes.push({ id: 90, tipo: "FINAL", fecha: new Date("2026-12-01T00:00:00Z"), hora: null, aulaId: null, materiaId: 6, creadoPorId: 9 });
  await conAPI(db, async (request) => {
    assert.equal((await request("GET", "/materias/6", "DOCENTE")).status, 403);
    assert.equal((await request("POST", "/materias/6", "DOCENTE", { tipo: "PARCIAL", fecha: futuro(10) })).status, 403);
    assert.equal((await request("PATCH", "/90", "DOCENTE", { hora: "10:00" })).status, 403);
    assert.equal((await request("DELETE", "/90", "DOCENTE")).status, 403);
    assert.equal((await request("POST", "/materias/5", "DOCENTE", { tipo: "PARCIAL", fecha: futuro(10) }, 8)).status, 403, "otro docente");
    assert.equal((await request("DELETE", "/999", "DOCENTE")).status, 404);
  });
  assert.equal(db.estado.examenes.length, 1);
  assert.equal(db.estado.notificaciones.length, 0);
});

test("HTTP: ADMIN puede programar en cualquier materia", async () => {
  const db = dbExamenes();
  await conAPI(db, async (request) => {
    assert.equal((await request("POST", "/materias/6", "ADMIN", { tipo: "FINAL", fecha: futuro(30) }, 1)).status, 201);
  });
  assert.equal(db.estado.notificaciones[0].materiaId, 6);
});

test("HTTP: validaciones (fecha pasada, tipo, aula inexistente) no guardan ni avisan", async () => {
  const db = dbExamenes();
  await conAPI(db, async (request) => {
    assert.equal((await request("POST", "/materias/5", "DOCENTE", { tipo: "PARCIAL", fecha: "2020-01-01" })).status, 400);
    assert.equal((await request("POST", "/materias/5", "DOCENTE", { tipo: "TP", fecha: futuro(5) })).status, 400);
    assert.equal((await request("POST", "/materias/5", "DOCENTE", { tipo: "PARCIAL", fecha: futuro(5), aulaId: 99 })).status, 400);
    assert.equal((await request("POST", "/materias/abc", "DOCENTE", { tipo: "PARCIAL", fecha: futuro(5) })).status, 400);
  });
  assert.equal(db.estado.examenes.length + db.estado.notificaciones.length, 0);
});

test("HTTP: reprogramar avisa con la fecha nueva y la anterior; sin cambios reales no avisa", async () => {
  const db = dbExamenes();
  await conAPI(db, async (request) => {
    await request("POST", "/materias/5", "DOCENTE", { tipo: "PARCIAL", fecha: futuro(14), hora: "18:00" });
    db.estado.notificaciones.length = 0;

    assert.equal((await request("PATCH", "/1", "DOCENTE", { hora: "18:00" })).status, 400, "igual al actual");
    assert.equal((await request("PATCH", "/1", "DOCENTE", {})).status, 400);
    assert.equal(db.estado.notificaciones.length, 0);

    const r = await request("PATCH", "/1", "DOCENTE", { fecha: futuro(21), aulaId: 1 });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).aula.nombre, "Aula 1");
  });
  assert.deepEqual(db.estado.notificaciones.map((n) => n.usuarioId), [21, 22]);
  assert.equal(db.estado.notificaciones[0].titulo, "Se reprogramó el parcial de Programación I");
  assert.match(db.estado.notificaciones[0].mensaje, /^Nueva fecha: .* · Aula 1\. Antes estaba previsto para .* a las 18:00\.$/);
});

test("HTTP: cancelar borra el examen y avisa; lista las fechas de la materia en orden", async () => {
  const db = dbExamenes();
  await conAPI(db, async (request) => {
    await request("POST", "/materias/5", "DOCENTE", { tipo: "FINAL", fecha: futuro(40) });
    await request("POST", "/materias/5", "DOCENTE", { tipo: "PARCIAL", fecha: futuro(10) });
    const lista = await (await request("GET", "/materias/5", "DOCENTE")).json();
    assert.equal(lista.materia.codigo, "PROG1");
    assert.equal(lista.examenes.length, 2);
    db.estado.notificaciones.length = 0;

    assert.equal((await request("DELETE", "/1", "DOCENTE")).status, 200);
    assert.deepEqual(db.estado.examenes.map((e) => e.id), [2]);
  });
  assert.equal(db.estado.notificaciones.length, 2);
  assert.equal(db.estado.notificaciones[0].titulo, "Se canceló el examen final de Programación I");
});

test("HTTP: si falla el aviso no queda el examen (misma transacción)", async () => {
  const db = dbExamenes();
  db.notificacion.createMany = async () => { throw new Error("falla notificacion"); };
  await conAPI(db, async (request) => {
    assert.equal((await request("POST", "/materias/5", "DOCENTE", { tipo: "PARCIAL", fecha: futuro(10) })).status, 500);
  });
  assert.equal(db.estado.examenes.length, 0);
});

test("HTTP: sin alumnos igual se programa el examen (no hay a quién avisar)", async () => {
  const db = dbExamenes({ alumnos: [] });
  await conAPI(db, async (request) => {
    assert.equal((await request("POST", "/materias/5", "DOCENTE", { tipo: "PARCIAL", fecha: futuro(10) })).status, 201);
  });
  assert.equal(db.estado.examenes.length, 1);
  assert.equal(db.estado.notificaciones.length, 0);
});

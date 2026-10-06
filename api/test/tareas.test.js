import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterTareas } from "../src/routes/tareas.js";
import { crearRouterNotificaciones } from "../src/routes/notificaciones.js";
import { manejarErrores } from "../src/middleware/errores.js";
import {
  DIAS_ANTICIPACION, avisoRecordatorio, claveRecordatorio, diasHasta, filtroMateriasDelAlumno,
  generarRecordatoriosEntrega, validarCambioTarea, validarNuevaTarea,
} from "../src/services/tareas.js";

const AHORA = new Date("2026-10-06T15:00:00Z"); // 12:00 en Argentina, martes 6/10
const HOY = new Date("2026-10-06T00:00:00Z");
const ISO = (s) => new Date(`${s}T00:00:00Z`);

// ---------- Validación y textos (sin DB) ----------

test("validarNuevaTarea: acepta una válida (descripción opcional, entrega hoy vale)", () => {
  assert.deepEqual(validarNuevaTarea({ titulo: "  TP   1 ", fechaEntrega: "2026-10-06" }, AHORA),
    { titulo: "TP 1", descripcion: null, fechaEntrega: ISO("2026-10-06") });
  assert.deepEqual(validarNuevaTarea({ titulo: "TP 2", descripcion: " Entregar   en PDF ", fechaEntrega: "2026-11-01" }, AHORA),
    { titulo: "TP 2", descripcion: "Entregar en PDF", fechaEntrega: ISO("2026-11-01") });
});

test("validarNuevaTarea: rechaza título, descripción o fecha inválidos y entregas pasadas", () => {
  const ok = { titulo: "TP 1", fechaEntrega: "2026-10-20" };
  for (const body of [null, [], {}, { ...ok, titulo: " " }, { ...ok, titulo: 5 }, { ...ok, titulo: "x".repeat(121) },
    { ...ok, descripcion: 5 }, { ...ok, descripcion: "x".repeat(1001) }, { ...ok, fechaEntrega: undefined },
    { ...ok, fechaEntrega: "20/10/2026" }, { ...ok, fechaEntrega: "2026-10-05" }]) {
    assert.throws(() => validarNuevaTarea(body, AHORA), (e) => e.status === 400, JSON.stringify(body)?.slice(0, 50));
  }
});

test("validarCambioTarea: solo los campos que vienen y exige alguno", () => {
  assert.deepEqual(validarCambioTarea({ fechaEntrega: "2026-11-02" }, AHORA), { fechaEntrega: ISO("2026-11-02") });
  assert.deepEqual(validarCambioTarea({ titulo: " Nuevo ", descripcion: "" }, AHORA), { titulo: "Nuevo", descripcion: null });
  for (const body of [null, {}, { titulo: "" }, { fechaEntrega: "2026-10-01" }, { materiaId: 3 }]) {
    assert.throws(() => validarCambioTarea(body, AHORA), (e) => e.status === 400, JSON.stringify(body));
  }
});

test("avisoRecordatorio: dice si vence hoy, mañana o en N días", () => {
  const tarea = (fecha) => ({ titulo: "TP 1", materiaNombre: "Programación I", fechaEntrega: ISO(fecha) });
  assert.equal(diasHasta(ISO("2026-10-09"), HOY), 3);
  assert.equal(avisoRecordatorio(tarea("2026-10-06"), HOY).mensaje, "La entrega de «TP 1» (Programación I) vence hoy: martes, 6/10/2026.");
  assert.match(avisoRecordatorio(tarea("2026-10-07"), HOY).mensaje, /vence mañana: miércoles, 7\/10\/2026\.$/);
  assert.match(avisoRecordatorio(tarea("2026-10-09"), HOY).mensaje, /vence en 3 días: viernes, 9\/10\/2026\.$/);
  assert.equal(avisoRecordatorio(tarea("2026-10-09"), HOY).titulo, "Se acerca la entrega: TP 1");
});

test("claveRecordatorio: cambia si cambia la fecha de entrega (se vuelve a avisar)", () => {
  assert.equal(claveRecordatorio({ id: 4, fechaEntrega: ISO("2026-10-09") }), "entrega-4-2026-10-09");
  assert.notEqual(claveRecordatorio({ id: 4, fechaEntrega: ISO("2026-10-09") }), claveRecordatorio({ id: 4, fechaEntrega: ISO("2026-10-12") }));
});

test("filtroMateriasDelAlumno: cursada o comisión elegida, siempre del alumno pedido", () => {
  assert.deepEqual(filtroMateriasDelAlumno(21), { OR: [
    { cursadas: { some: { alumnoId: 21 } } },
    { comisiones: { some: { inscripciones: { some: { alumnoId: 21 } } } } },
  ] });
});

// ---------- Recordatorio (DB en memoria) ----------

// Tareas de la materia 5 (alumnos 21 y 22) y de la 6 (nadie). Respeta fechaEntrega y la clave única.
function dbRecordatorios(tareas) {
  const estado = { notificaciones: [], consultas: [] };
  const MATERIAS = { 5: { id: 5, nombre: "Programación I" }, 6: { id: 6, nombre: "Base de Datos" } };
  const CURSAN = { 21: [5], 22: [5] };
  return {
    estado,
    tarea: {
      findMany: async ({ where }) => {
        estado.consultas.push(where);
        const alumnoId = where.materia.OR[0].cursadas.some.alumnoId;
        return tareas
          .filter((t) => (CURSAN[alumnoId] ?? []).includes(t.materiaId) && t.fechaEntrega >= where.fechaEntrega.gte && t.fechaEntrega <= where.fechaEntrega.lte)
          .map((t) => ({ id: t.id, titulo: t.titulo, fechaEntrega: t.fechaEntrega, materia: MATERIAS[t.materiaId] }));
      },
    },
    notificacion: {
      createMany: async ({ data, skipDuplicates }) => {
        let creadas = 0;
        for (const fila of data) {
          const repetida = fila.clave && estado.notificaciones.some((n) => n.usuarioId === fila.usuarioId && n.clave === fila.clave);
          if (repetida && !skipDuplicates) throw new Error("clave repetida");
          if (!repetida) { estado.notificaciones.push(fila); creadas++; }
        }
        return { count: creadas };
      },
    },
  };
}

const TAREAS = [
  { id: 1, titulo: "TP 1", materiaId: 5, fechaEntrega: ISO("2026-10-06") }, // hoy
  { id: 2, titulo: "TP 2", materiaId: 5, fechaEntrega: ISO("2026-10-09") }, // en 3 días (límite)
  { id: 3, titulo: "TP 3", materiaId: 5, fechaEntrega: ISO("2026-10-10") }, // en 4 días: todavía no
  { id: 4, titulo: "TP viejo", materiaId: 5, fechaEntrega: ISO("2026-10-05") }, // ya pasó
  { id: 5, titulo: "TP de otra materia", materiaId: 6, fechaEntrega: ISO("2026-10-07") }, // no la cursa
];

test("recordatorio: avisa solo las entregas de hoy a DIAS_ANTICIPACION días de sus materias", async () => {
  assert.equal(DIAS_ANTICIPACION, 3);
  const db = dbRecordatorios(TAREAS);
  assert.deepEqual(await generarRecordatoriosEntrega(db, 21, AHORA), { creadas: 2 });
  assert.deepEqual(db.estado.notificaciones.map((n) => n.titulo), ["Se acerca la entrega: TP 1", "Se acerca la entrega: TP 2"]);
  for (const n of db.estado.notificaciones) {
    assert.equal(n.usuarioId, 21);
    assert.equal(n.tipo, "RECORDATORIO_ENTREGA");
    assert.equal(n.materiaId, 5);
  }
  assert.match(db.estado.notificaciones[0].mensaje, /vence hoy/);
  assert.match(db.estado.notificaciones[1].mensaje, /vence en 3 días/);
});

test("recordatorio: no se repite aunque el alumno consulte varias veces, y cada alumno recibe el suyo", async () => {
  const db = dbRecordatorios(TAREAS);
  await generarRecordatoriosEntrega(db, 21, AHORA);
  assert.deepEqual(await generarRecordatoriosEntrega(db, 21, AHORA), { creadas: 0 }, "segunda consulta");
  assert.equal(db.estado.notificaciones.length, 2);
  await generarRecordatoriosEntrega(db, 22, AHORA);
  assert.equal(db.estado.notificaciones.length, 4, "el otro alumno de la materia también recibe los suyos");
  assert.deepEqual(await generarRecordatoriosEntrega(db, 99, AHORA), { creadas: 0 }, "un alumno que no cursa no recibe nada");
});

test("recordatorio: al pasar los días entran las entregas que ya se acercan; si cambia la fecha, vuelve a avisar", async () => {
  const db = dbRecordatorios([...TAREAS]);
  await generarRecordatoriosEntrega(db, 21, AHORA);
  const manana = new Date("2026-10-07T15:00:00Z");
  assert.deepEqual(await generarRecordatoriosEntrega(db, 21, manana), { creadas: 1 }, "ahora entra el TP 3");
  db.estado.notificaciones.length = 0;

  const db2 = dbRecordatorios([{ id: 2, titulo: "TP 2", materiaId: 5, fechaEntrega: ISO("2026-10-09") }]);
  await generarRecordatoriosEntrega(db2, 21, AHORA);
  const cambiada = dbRecordatorios([{ id: 2, titulo: "TP 2", materiaId: 5, fechaEntrega: ISO("2026-10-08") }]);
  cambiada.estado.notificaciones.push(...db2.estado.notificaciones);
  assert.deepEqual(await generarRecordatoriosEntrega(cambiada, 21, AHORA), { creadas: 1 }, "la fecha nueva tiene otra clave");
});

// ---------- Contrato HTTP del docente ----------

function dbTareas() {
  const estado = { tareas: [], sig: 1 };
  const MATERIAS = { 5: { id: 5, nombre: "Programación I", codigo: "PROG1" }, 6: { id: 6, nombre: "Base de Datos", codigo: "BD1" } };
  const proyectar = ({ creadaPorId, ...t }) => t;
  return {
    estado,
    materia: { findUnique: async ({ where }) => MATERIAS[where.id] ?? null },
    materiaDocente: { findUnique: async ({ where }) => (where.materiaId_docenteId.materiaId === 5 && where.materiaId_docenteId.docenteId === 7 ? { materiaId: 5 } : null) },
    tarea: {
      findMany: async ({ where }) => estado.tareas.filter((t) => t.materiaId === where.materiaId).map(proyectar),
      findUnique: async ({ where }) => { const t = estado.tareas.find((x) => x.id === where.id); return t ? { materiaId: t.materiaId } : null; },
      create: async ({ data }) => { const t = { id: estado.sig++, ...data }; estado.tareas.push(t); return proyectar(t); },
      update: async ({ where, data }) => { const t = estado.tareas.find((x) => x.id === where.id); Object.assign(t, data); return proyectar(t); },
      delete: async ({ where }) => { estado.tareas = estado.tareas.filter((t) => t.id !== where.id); return {}; },
    },
  };
}

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/tareas", crearRouterTareas(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol, body, id = 7) => fetch(`http://127.0.0.1:${server.address().port}/api/tareas${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

const futuro = (dias) => new Date(Date.now() + dias * 86400e3).toISOString().slice(0, 10);

test("HTTP tareas: exige login y rol DOCENTE o ADMIN", async () => {
  const db = dbTareas();
  await conAPI(db, async (request) => {
    for (const [metodo, ruta, body] of [["GET", "/materias/5"], ["POST", "/materias/5", { titulo: "TP", fechaEntrega: futuro(5) }], ["PATCH", "/1", { titulo: "x" }], ["DELETE", "/1"]]) {
      assert.equal((await request(metodo, ruta, null, body)).status, 401, `${metodo} sin login`);
      assert.equal((await request(metodo, ruta, "ALUMNO", body, 21)).status, 403, `${metodo} alumno`);
    }
  });
  assert.equal(db.estado.tareas.length, 0);
});

test("HTTP tareas: el docente asignado carga, lista, edita y borra; la materia y el autor salen del servidor", async () => {
  const db = dbTareas();
  await conAPI(db, async (request) => {
    const r = await request("POST", "/materias/5", "DOCENTE", { titulo: "TP 1", descripcion: "En PDF", fechaEntrega: futuro(5), materiaId: 6, creadaPorId: 99 });
    assert.equal(r.status, 201);
    assert.equal(db.estado.tareas[0].materiaId, 5, "ignora el materiaId del body");
    assert.equal(db.estado.tareas[0].creadaPorId, 7, "el autor sale del token");

    const lista = await (await request("GET", "/materias/5", "DOCENTE")).json();
    assert.equal(lista.materia.codigo, "PROG1");
    assert.equal(lista.tareas.length, 1);

    const nueva = futuro(9);
    assert.equal((await request("PATCH", "/1", "DOCENTE", { fechaEntrega: nueva })).status, 200);
    assert.equal(db.estado.tareas[0].fechaEntrega.toISOString().slice(0, 10), nueva);
    assert.equal((await request("PATCH", "/1", "DOCENTE", {})).status, 400);

    assert.equal((await request("DELETE", "/1", "DOCENTE")).status, 200);
    assert.equal(db.estado.tareas.length, 0);
    assert.equal((await request("DELETE", "/1", "DOCENTE")).status, 404);
  });
});

test("HTTP tareas: un docente NO asignado recibe 403; ADMIN puede; los datos inválidos no se guardan", async () => {
  const db = dbTareas();
  db.estado.tareas.push({ id: 90, titulo: "Ajena", descripcion: null, fechaEntrega: ISO(futuro(5)), materiaId: 6, creadaPorId: 9 });
  await conAPI(db, async (request) => {
    assert.equal((await request("GET", "/materias/6", "DOCENTE")).status, 403);
    assert.equal((await request("POST", "/materias/6", "DOCENTE", { titulo: "TP", fechaEntrega: futuro(5) })).status, 403);
    assert.equal((await request("PATCH", "/90", "DOCENTE", { titulo: "Hack" })).status, 403);
    assert.equal((await request("DELETE", "/90", "DOCENTE")).status, 403);
    assert.equal((await request("POST", "/materias/5", "DOCENTE", { titulo: "TP", fechaEntrega: futuro(5) }, 8)).status, 403, "otro docente");
    assert.equal(db.estado.tareas.length, 1);

    assert.equal((await request("POST", "/materias/6", "ADMIN", { titulo: "TP admin", fechaEntrega: futuro(5) }, 1)).status, 201);
    assert.equal((await request("POST", "/materias/5", "DOCENTE", { titulo: "", fechaEntrega: futuro(5) })).status, 400);
    assert.equal((await request("POST", "/materias/5", "DOCENTE", { titulo: "TP", fechaEntrega: "2020-01-01" })).status, 400);
    assert.equal(db.estado.tareas.length, 2);
  });
});

// ---------- El historial dispara el recordatorio (solo para el ALUMNO) ----------

test("HTTP notificaciones: el alumno recibe el recordatorio al abrir su historial; un docente no dispara nada", async () => {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const generadas = [];
  const db = {
    tarea: { findMany: async (args) => { generadas.push(args.where.materia.OR[0].cursadas.some.alumnoId); return []; } },
    notificacion: { findMany: async () => [], count: async () => 0 },
  };
  const app = express(); app.use("/n", crearRouterNotificaciones(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const pedir = (ruta, rol) => fetch(`http://127.0.0.1:${server.address().port}/n${ruta}`, { headers: { Authorization: `Bearer ${jwt.sign({ id: 21, rol }, process.env.JWT_SECRET)}` } });
  try {
    assert.equal((await pedir("/", "ALUMNO")).status, 200);
    assert.deepEqual(generadas, [21], "se genera para el alumno del token");
    assert.equal((await pedir("/?antesDeId=5", "ALUMNO")).status, 200);
    assert.equal((await pedir("/", "DOCENTE")).status, 200);
    assert.deepEqual(generadas, [21], "ni paginando ni siendo docente se vuelve a generar");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("HTTP notificaciones: si falla el recordatorio igual se ve el historial", async () => {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const db = {
    tarea: { findMany: async () => { throw new Error("falla tarea"); } },
    notificacion: { findMany: async () => [], count: async () => 0 },
  };
  const app = express(); app.use("/n", crearRouterNotificaciones(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/n/`, { headers: { Authorization: `Bearer ${jwt.sign({ id: 21, rol: "ALUMNO" }, process.env.JWT_SECRET)}` } });
    assert.equal(r.status, 200);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

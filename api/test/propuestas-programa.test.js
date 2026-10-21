import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterPropuestasPrograma } from "../src/routes/propuestasPrograma.js";
import { crearRouterDocentes } from "../src/routes/docentes.js";
import { manejarErrores } from "../src/middleware/errores.js";
import {
  avisoPropuestaResuelta, cambiaElPrograma, crearPropuesta, resolverPropuesta, validarPropuesta, validarResolucionPropuesta,
} from "../src/services/propuestasPrograma.js";
import { bibliografiaDelDocente } from "../src/services/bibliografia.js";

const DOCENTE = { id: 5, rol: "DOCENTE", nombre: "Ana", apellido: "Pérez" };
const ADMIN = { id: 1, rol: "ADMIN" };
const datosValidos = (extra = {}) => ({ materiaId: 4, contenidos: "Unidad 1\nUnidad 2", bibliografia: "Libro A", motivo: "Se agrega la unidad 2 al programa", ...extra });

// Base en memoria con el estado que importa: programa, propuestas, PDF, registro de cambios y notificaciones.
function base({ programa = { id: 7, materiaId: 4, contenidos: "Unidad 1", bibliografia: null, version: 2, vigente: true }, pdf = null, asignada = true } = {}) {
  const estado = { programa, pdf, propuestas: [], cambios: [], versiones: [], notificaciones: [], siguienteId: 1 };
  const materia = { id: 4, nombre: "Programación", codigo: "P1" };
  const completa = (p) => p && {
    ...p, materia: { ...materia, programaUrl: estado.pdf },
    docente: { id: DOCENTE.id, nombre: DOCENTE.nombre, apellido: DOCENTE.apellido },
  };
  const tx = {
    materia: {
      findUnique: async ({ where }) => (where.id === 4 ? materia : null),
      update: async ({ data }) => { estado.pdf = data.programaUrl; },
    },
    materiaDocente: { findUnique: async () => (asignada ? { materiaId: 4 } : null) },
    programa: {
      findUnique: async ({ where, include }) => {
        const p = estado.programa;
        if (!p || (where.id != null && where.id !== p.id) || (where.materiaId != null && where.materiaId !== p.materiaId)) return null;
        return include ? { ...p, materia: { programaUrl: estado.pdf } } : { ...p };
      },
      create: async ({ data }) => { estado.programa = { id: 7, ...data }; return estado.programa; },
      updateMany: async ({ where, data }) => {
        if (estado.programa.version !== where.version) return { count: 0 };
        estado.programa = { ...estado.programa, ...data, version: estado.programa.version + data.version.increment };
        return { count: 1 };
      },
    },
    propuestaPrograma: {
      findFirst: async ({ where }) => estado.propuestas.find((p) => p.materiaId === where.materiaId && p.docenteId === where.docenteId && p.estado === where.estado) ?? null,
      findUnique: async ({ where }) => completa(estado.propuestas.find((p) => p.id === where.id)),
      create: async ({ data }) => { const p = { id: estado.siguienteId++, estado: "PENDIENTE", creadoEn: new Date(), respuesta: null, resueltaEn: null, ...data }; estado.propuestas.push(p); return p; },
      update: async ({ where, data }) => { const p = estado.propuestas.find((x) => x.id === where.id); Object.assign(p, data); return p; },
    },
    cambioMateria: { create: async ({ data }) => { estado.cambios.push(data); return data; } },
    programaVersion: { create: async ({ data }) => { estado.versiones.push(data); return data; } },
    preferenciaNotificacion: { findMany: async () => [] },
    notificacion: { createMany: async ({ data }) => { estado.notificaciones.push(...data); return { count: data.length }; } },
    envioNotificacion: { createMany: async () => ({ count: 0 }) },
  };
  const db = {
    ...tx,
    $transaction: async (fn, opciones) => {
      assert.equal(opciones.isolationLevel, "Serializable");
      const previo = structuredClone(estado);
      try { return await fn(tx); } catch (e) { Object.assign(estado, previo); throw e; }
    },
  };
  return { db, estado };
}

const pendiente = async (b, extra = {}) => crearPropuesta(b.db, { docente: DOCENTE, datos: validarPropuesta(datosValidos(extra)) });

test("validarPropuesta normaliza el texto y rechaza lo inválido", () => {
  const ok = validarPropuesta(datosValidos({ contenidos: "  Tema  ", bibliografia: "  ", motivo: "  Por   la nueva unidad  " }));
  assert.deepEqual(ok, { materiaId: 4, contenidos: "Tema", bibliografia: null, motivo: "Por la nueva unidad" });
  for (const cambio of [null, [], { materiaId: "x" }, { contenidos: " " }, { contenidos: "a".repeat(20001) }, { bibliografia: 3 }, { bibliografia: "a".repeat(10001) }, { motivo: " " }, { motivo: "corto" }, { motivo: "a".repeat(1001) }]) {
    assert.throws(() => validarPropuesta(cambio === null || Array.isArray(cambio) ? cambio : datosValidos(cambio)), (e) => e.status === 400, JSON.stringify(cambio));
  }
});

test("validarResolucionPropuesta exige respuesta para rechazar", () => {
  assert.deepEqual(validarResolucionPropuesta({ estado: "APROBADA" }), { estado: "APROBADA", respuesta: null, reemplazarPdf: false });
  assert.deepEqual(validarResolucionPropuesta({ estado: "RECHAZADA", respuesta: " No corresponde ", reemplazarPdf: true }), { estado: "RECHAZADA", respuesta: "No corresponde", reemplazarPdf: true });
  for (const cuerpo of [null, { estado: "PENDIENTE" }, { estado: "RECHAZADA" }, { estado: "RECHAZADA", respuesta: "  " }, { estado: "APROBADA", respuesta: "abc" }, { estado: "APROBADA", respuesta: 4 }, { estado: "APROBADA", respuesta: "a".repeat(1001) }, { estado: "APROBADA", reemplazarPdf: "si" }]) {
    assert.throws(() => validarResolucionPropuesta(cuerpo), (e) => e.status === 400, JSON.stringify(cuerpo));
  }
});

test("cambiaElPrograma compara contenidos y bibliografía", () => {
  const programa = { contenidos: "A", bibliografia: null };
  assert.equal(cambiaElPrograma(programa, { contenidos: "A", bibliografia: null }), false);
  assert.equal(cambiaElPrograma(programa, { contenidos: "B", bibliografia: null }), true);
  assert.equal(cambiaElPrograma(programa, { contenidos: "A", bibliografia: "X" }), true);
  assert.equal(cambiaElPrograma(null, { contenidos: "A", bibliografia: null }), true);
});

test("crearPropuesta guarda la propuesta con la versión de la que parte", async () => {
  const b = base();
  const creada = await pendiente(b);
  assert.equal(creada.estado, "PENDIENTE");
  assert.equal(b.estado.propuestas[0].versionBase, 2);
  assert.equal(b.estado.propuestas[0].docenteId, DOCENTE.id);
  assert.equal(b.estado.programa.version, 2, "proponer no toca el programa");
});

test("crearPropuesta: solo materias propias, sin cambios vacíos y una pendiente por materia", async () => {
  await assert.rejects(pendiente(base({ asignada: false })), (e) => e.status === 403);
  await assert.rejects(pendiente(base(), { materiaId: 99 }), (e) => e.status === 404);
  await assert.rejects(pendiente(base(), { contenidos: "Unidad 1", bibliografia: "" }), (e) => e.status === 400 && /no cambia/.test(e.message));
  const b = base();
  await pendiente(b);
  await assert.rejects(pendiente(b, { contenidos: "Otra" }), (e) => e.status === 409);
});

test("crearPropuesta sobre una materia sin programa parte de la versión 0", async () => {
  const b = base({ programa: null });
  await pendiente(b);
  assert.equal(b.estado.propuestas[0].versionBase, 0);
});

test("aprobar publica la nueva versión, registra el cambio y avisa al docente", async () => {
  const b = base();
  const { id } = await pendiente(b);
  const resuelta = await resolverPropuesta(b.db, { id, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "APROBADA", respuesta: "Muy bien" }) });
  assert.equal(resuelta.estado, "APROBADA");
  assert.equal(b.estado.programa.version, 3);
  assert.equal(b.estado.programa.contenidos, "Unidad 1\nUnidad 2");
  assert.equal(b.estado.propuestas[0].resueltaPorId, ADMIN.id);
  assert.equal(b.estado.cambios.length, 1);
  assert.equal(b.estado.cambios[0].autorId, ADMIN.id);
  assert.match(b.estado.cambios[0].detalle, /Aprobó la propuesta de Ana Pérez/);
  assert.equal(b.estado.notificaciones.length, 1);
  assert.equal(b.estado.notificaciones[0].usuarioId, DOCENTE.id);
  assert.equal(b.estado.notificaciones[0].tipo, "PROPUESTA_PROGRAMA_RESUELTA");
  assert.match(b.estado.notificaciones[0].mensaje, /versión 3/);
  assert.match(b.estado.notificaciones[0].mensaje, /Muy bien/);
});

test("aprobar una propuesta de una materia sin programa lo crea como versión 1", async () => {
  const b = base({ programa: null });
  const { id } = await pendiente(b);
  await resolverPropuesta(b.db, { id, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "APROBADA" }) });
  assert.equal(b.estado.programa.version, 1);
  assert.equal(b.estado.programa.vigente, true);
  assert.equal(b.estado.cambios.length, 1);
});

test("no se aprueba una propuesta desactualizada ni una que ya se cargó como programa inicial", async () => {
  const b = base();
  const { id } = await pendiente(b);
  b.estado.programa = { ...b.estado.programa, version: 3 }; // alguien actualizó el programa mientras tanto
  await assert.rejects(resolverPropuesta(b.db, { id, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "APROBADA" }) }), (e) => e.status === 409 && /cambió/.test(e.message));
  assert.equal(b.estado.propuestas[0].estado, "PENDIENTE");
  assert.equal(b.estado.notificaciones.length, 0);
  // Rechazarla sigue siendo posible.
  await resolverPropuesta(b.db, { id, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "RECHAZADA", respuesta: "Ya se actualizó" }) });
  assert.equal(b.estado.propuestas[0].estado, "RECHAZADA");

  const inicial = base({ programa: null });
  const { id: id2 } = await pendiente(inicial);
  inicial.estado.programa = { id: 7, materiaId: 4, contenidos: "Cargado", bibliografia: null, version: 1, vigente: true };
  await assert.rejects(resolverPropuesta(inicial.db, { id: id2, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "APROBADA" }) }), (e) => e.status === 409);
});

test("si la materia tiene PDF, aprobar exige confirmar el reemplazo y lo retira", async () => {
  const b = base({ pdf: "programa.pdf" });
  const { id } = await pendiente(b);
  await assert.rejects(resolverPropuesta(b.db, { id, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "APROBADA" }) }), (e) => e.status === 409 && /PDF/.test(e.message));
  assert.equal(b.estado.pdf, "programa.pdf");
  await resolverPropuesta(b.db, { id, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "APROBADA", reemplazarPdf: true }) });
  assert.equal(b.estado.pdf, null);
  assert.equal(b.estado.programa.version, 3);
});

test("aprobar el programa inicial de una materia con PDF también exige confirmar el reemplazo", async () => {
  const b = base({ programa: null, pdf: "viejo.pdf" });
  const { id } = await pendiente(b);
  await assert.rejects(resolverPropuesta(b.db, { id, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "APROBADA" }) }), (e) => e.status === 409);
  assert.equal(b.estado.programa, null);
  await resolverPropuesta(b.db, { id, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "APROBADA", reemplazarPdf: true }) });
  assert.equal(b.estado.programa.version, 1);
  assert.equal(b.estado.pdf, null);
});

test("rechazar no toca el programa y avisa con la respuesta; no se resuelve dos veces", async () => {
  const b = base();
  const { id } = await pendiente(b);
  await resolverPropuesta(b.db, { id, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "RECHAZADA", respuesta: "Falta bibliografía" }) });
  assert.equal(b.estado.programa.version, 2);
  assert.equal(b.estado.cambios.length, 0);
  assert.match(b.estado.notificaciones[0].mensaje, /no se aplicó/);
  assert.match(b.estado.notificaciones[0].mensaje, /Falta bibliografía/);
  await assert.rejects(resolverPropuesta(b.db, { id, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "APROBADA" }) }), (e) => e.status === 409);
  await assert.rejects(resolverPropuesta(b.db, { id: 99, admin: ADMIN, resolucion: validarResolucionPropuesta({ estado: "APROBADA" }) }), (e) => e.status === 404);
});

test("avisoPropuestaResuelta acorta el título", () => {
  const { titulo } = avisoPropuestaResuelta({ estado: "APROBADA", materiaNombre: "x".repeat(300), respuesta: null, version: 2 });
  assert.ok(titulo.length <= 120);
});

// ---------- HTTP ----------

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "propuestas-programa-tests";
  const app = express(); app.use(express.json());
  app.use("/api/propuestas-programa", crearRouterPropuestasPrograma(db));
  app.use("/api/docentes", crearRouterDocentes(db));
  app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
  const pedir = (usuario, metodo, ruta, body) => fetch(`http://127.0.0.1:${server.address().port}/api${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(usuario ? { Authorization: `Bearer ${jwt.sign(usuario, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(pedir); } finally { await new Promise((r) => server.close(r)); }
}

test("HTTP: cada rol ve solo lo suyo", async () => {
  const b = base();
  await conAPI(b.db, async (pedir) => {
    assert.equal((await pedir(null, "GET", "/propuestas-programa/mias")).status, 401);
    assert.equal((await pedir({ id: 8, rol: "ALUMNO" }, "POST", "/propuestas-programa", datosValidos())).status, 403);
    assert.equal((await pedir(ADMIN, "POST", "/propuestas-programa", datosValidos())).status, 403, "el admin edita el programa directo");
    assert.equal((await pedir(DOCENTE, "GET", "/propuestas-programa")).status, 403);
    assert.equal((await pedir(DOCENTE, "PATCH", "/propuestas-programa/1/resolver", { estado: "APROBADA" })).status, 403);
    assert.equal((await pedir(ADMIN, "GET", "/propuestas-programa/mias")).status, 403);

    assert.equal((await pedir(DOCENTE, "POST", "/propuestas-programa", datosValidos({ motivo: "x" }))).status, 400);
    const creada = await pedir(DOCENTE, "POST", "/propuestas-programa", datosValidos());
    assert.equal(creada.status, 201);
    assert.equal((await pedir(DOCENTE, "POST", "/propuestas-programa", datosValidos({ contenidos: "Otro" }))).status, 409);
  });
});

test("HTTP: el admin resuelve y la propuesta pasa a resuelta", async () => {
  const b = base();
  const { id } = await pendiente(b);
  b.db.propuestaPrograma.findMany = async ({ where }) => b.estado.propuestas
    .filter((p) => !where.estado || p.estado === where.estado)
    .map((p) => ({ ...p, docente: { id: 5, nombre: "Ana", apellido: "Pérez", email: "a@x" }, materia: { id: 4, nombre: "Programación", codigo: "P1", programaUrl: "secreto.pdf", programa: { contenidos: "Unidad 1", bibliografia: null, version: b.estado.programa.version } } }));
  await conAPI(b.db, async (pedir) => {
    const lista = await (await pedir(ADMIN, "GET", "/propuestas-programa")).json();
    assert.equal(lista.length, 1);
    assert.equal(lista[0].desactualizada, false);
    assert.equal(lista[0].materia.tienePdf, true);
    assert.equal(JSON.stringify(lista).includes("secreto.pdf"), false, "no se expone el archivo del servidor");
    assert.equal((await pedir(ADMIN, "GET", "/propuestas-programa?estado=otra")).status, 400);

    assert.equal((await pedir(ADMIN, "PATCH", "/propuestas-programa/abc/resolver", { estado: "APROBADA" })).status, 400);
    assert.equal((await pedir(ADMIN, "PATCH", `/propuestas-programa/${id}/resolver`, { estado: "RECHAZADA" })).status, 400);
    const ok = await pedir(ADMIN, "PATCH", `/propuestas-programa/${id}/resolver`, { estado: "RECHAZADA", respuesta: "No por ahora" });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).estado, "RECHAZADA");
    assert.equal((await pedir(ADMIN, "PATCH", `/propuestas-programa/${id}/resolver`, { estado: "RECHAZADA", respuesta: "No por ahora" })).status, 409);
  });
});

// ---------- Bibliografía del docente ----------

test("bibliografiaDelDocente lista todas sus materias, con la lista vacía si no hay bibliografía publicada", async () => {
  let consulta;
  const db = {
    materia: {
      findMany: async (args) => {
        consulta = args;
        return [
          { id: 1, nombre: "A", codigo: "A1", anio: 1, cuatrimestre: 1, programaUrl: null, programa: { bibliografia: "- Libro 1\n2. Libro 2\n\n", vigente: true, version: 3, actualizadoEn: new Date("2026-01-01") } },
          { id: 2, nombre: "B", codigo: "B1", anio: 2, cuatrimestre: 2, programaUrl: "x.pdf", programa: null },
          { id: 3, nombre: "C", codigo: "C1", anio: 2, cuatrimestre: 2, programaUrl: null, programa: { bibliografia: "Oculto", vigente: false, version: 1, actualizadoEn: new Date() } },
        ];
      },
    },
  };
  const r = await bibliografiaDelDocente(db, 5);
  assert.deepEqual(consulta.where, { docentes: { some: { docenteId: 5 } } });
  assert.deepEqual(r[0].bibliografia, ["Libro 1", "Libro 2"]);
  assert.equal(r[0].version, 3);
  assert.deepEqual(r[1].bibliografia, []);
  assert.equal(r[1].tienePdf, true);
  assert.equal("programaUrl" in r[1], false);
  assert.deepEqual(r[2].bibliografia, [], "un programa no vigente no se muestra");
});

test("HTTP: GET /docentes/bibliografia es solo del docente y usa su id del token", async () => {
  let docenteId;
  const db = { materia: { findMany: async ({ where }) => { docenteId = where.docentes.some.docenteId; return []; } } };
  await conAPI(db, async (pedir) => {
    assert.equal((await pedir({ id: 8, rol: "ALUMNO" }, "GET", "/docentes/bibliografia")).status, 403);
    assert.equal((await pedir(DOCENTE, "GET", "/docentes/bibliografia")).status, 200);
    assert.equal(docenteId, DOCENTE.id);
  });
});

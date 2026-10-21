// Preferencias de notificación (tipo × medio), marcar como no leída, enlaces a la sección y envío por email/push.
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterNotificaciones } from "../src/routes/notificaciones.js";
import { manejarErrores } from "../src/middleware/errores.js";
import { SECCION_POR_TIPO, TEXTO_SECCION, enlaceDe, seccionDe, urlDeSeccion } from "../src/services/enlaces.js";
import {
  POR_DEFECTO, TIPOS_POR_ROL, armarMatriz, canalesActivos, cargarPreferencias, validarPreferencias,
  validarSuscripcionPush, verificarCanalesDisponibles,
} from "../src/services/preferencias.js";
import { TIPOS_NOTIFICACION, crearNotificaciones, crearNotificacionesIndividuales } from "../src/services/notificaciones.js";
import { MAX_INTENTOS, destinoEmail, procesarEnvios } from "../src/services/envios.js";
import { armarEmail, configuracionCanales } from "../src/services/canales.js";

// ---------- Enlaces a la sección (sin DB) ----------

test("enlaces: todos los tipos de aviso tienen una sección, y cada sección tiene su texto", () => {
  for (const tipo of TIPOS_NOTIFICACION) {
    const seccion = SECCION_POR_TIPO[tipo];
    assert.ok(seccion, `el tipo ${tipo} no tiene sección`);
    assert.ok(TEXTO_SECCION[seccion], `la sección ${seccion} no tiene texto`);
  }
});

test("enlaces: una sección guardada manda sobre la del tipo; una que ya no existe vuelve a la del tipo", () => {
  assert.deepEqual(enlaceDe({ tipo: "CALIFICACION_PUBLICADA" }), { seccion: "historial-notas", texto: "Ver mi historial de notas" });
  assert.equal(seccionDe({ tipo: "FECHA_EXAMEN", seccion: "inscripcion-final" }), "inscripcion-final");
  assert.equal(seccionDe({ tipo: "FECHA_EXAMEN", seccion: "ya-no-existe" }), "materias");
  assert.equal(seccionDe({ tipo: "TIPO_RARO" }), "materias");
  assert.equal(enlaceDe({ tipo: "SOLICITUD_REVISION" }).seccion, "revisiones");
});

test("enlaces: la URL completa lleva la sección después del #", () => {
  assert.equal(urlDeSeccion("horario", "https://sistema.ucse.edu.ar/"), "https://sistema.ucse.edu.ar/#horario");
  assert.equal(urlDeSeccion("horario", undefined), "http://localhost:5173/#horario");
});

// ---------- Preferencias (sin DB) ----------

test("preferencias: sin cambios vale el valor por defecto (solo el sistema)", () => {
  assert.deepEqual([...canalesActivos()], ["SISTEMA"]);
  assert.deepEqual(POR_DEFECTO, { SISTEMA: true, EMAIL: false, PUSH: false });
  assert.deepEqual([...canalesActivos([{ canal: "EMAIL", activa: true }, { canal: "SISTEMA", activa: false }])], ["EMAIL"]);
});

test("preferencias: la matriz muestra solo los tipos del rol, con los cambios aplicados", () => {
  const alumno = armarMatriz("ALUMNO", [{ tipo: "FECHA_EXAMEN", canal: "EMAIL", activa: true }, { tipo: "AVISO_DOCENTE", canal: "SISTEMA", activa: false }]);
  assert.deepEqual(alumno.map((f) => f.tipo), TIPOS_POR_ROL.ALUMNO);
  assert.deepEqual(alumno.find((f) => f.tipo === "FECHA_EXAMEN").canales, { SISTEMA: true, EMAIL: true, PUSH: false });
  assert.deepEqual(alumno.find((f) => f.tipo === "AVISO_DOCENTE").canales, { SISTEMA: false, EMAIL: false, PUSH: false });
  assert.deepEqual(armarMatriz("DOCENTE", []).map((f) => f.tipo), ["SOLICITUD_REVISION"]);
  assert.deepEqual(armarMatriz("ADMIN", []), []);
});

test("preferencias: valida tipo del rol, medio, booleano, repetidos y cantidad", () => {
  const ok = [{ tipo: "AVISO_DOCENTE", canal: "EMAIL", activa: true }];
  assert.deepEqual(validarPreferencias({ preferencias: ok }, "ALUMNO"), ok);
  const malos = [
    null, [], {}, { preferencias: [] }, { preferencias: "x" },
    { preferencias: [{ tipo: "SOLICITUD_REVISION", canal: "EMAIL", activa: true }] }, // es del docente
    { preferencias: [{ tipo: "OTRO", canal: "EMAIL", activa: true }] },
    { preferencias: [{ tipo: "AVISO_DOCENTE", canal: "SMS", activa: true }] },
    { preferencias: [{ tipo: "AVISO_DOCENTE", canal: "EMAIL", activa: "si" }] },
    { preferencias: [{ tipo: "AVISO_DOCENTE", canal: "EMAIL", activa: true }, { tipo: "AVISO_DOCENTE", canal: "EMAIL", activa: false }] },
    { preferencias: [null] },
    { preferencias: Array.from({ length: 51 }, (_, i) => ({ tipo: "AVISO_DOCENTE", canal: i % 2 ? "EMAIL" : "PUSH", activa: true })) },
  ];
  for (const body of malos) assert.throws(() => validarPreferencias(body, "ALUMNO"), (e) => e.status === 400, JSON.stringify(body)?.slice(0, 80));
});

test("preferencias: no se activa un medio que el servidor no tiene, ni push sin dispositivo; apagar siempre se puede", () => {
  const activar = (canal) => [{ tipo: "AVISO_DOCENTE", canal, activa: true }];
  assert.throws(() => verificarCanalesDisponibles(activar("EMAIL"), { disponibles: { EMAIL: false, PUSH: true } }), (e) => e.status === 409 && /email/.test(e.message));
  assert.throws(() => verificarCanalesDisponibles(activar("PUSH"), { disponibles: { EMAIL: true, PUSH: false }, dispositivos: 1 }), (e) => e.status === 409);
  assert.throws(() => verificarCanalesDisponibles(activar("PUSH"), { disponibles: { EMAIL: true, PUSH: true }, dispositivos: 0 }), (e) => e.status === 409 && /navegador/.test(e.message));
  verificarCanalesDisponibles(activar("PUSH"), { disponibles: { EMAIL: true, PUSH: true }, dispositivos: 1 });
  verificarCanalesDisponibles(activar("SISTEMA"), { disponibles: { EMAIL: false, PUSH: false } });
  verificarCanalesDisponibles([{ tipo: "AVISO_DOCENTE", canal: "EMAIL", activa: false }], { disponibles: { EMAIL: false, PUSH: false } });
});

test("preferencias: valida la suscripción push (https, claves presentes)", () => {
  const ok = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BKey", auth: "authKey" } };
  assert.deepEqual(validarSuscripcionPush(ok), { endpoint: ok.endpoint, p256dh: "BKey", auth: "authKey" });
  for (const body of [null, {}, { ...ok, endpoint: "http://inseguro.example/x" }, { ...ok, endpoint: "no es una url" }, { ...ok, keys: undefined },
    { ...ok, keys: { p256dh: "", auth: "a" } }, { ...ok, keys: { p256dh: "k", auth: 5 } }, { ...ok, endpoint: `https://x.example/${"a".repeat(2100)}` }]) {
    assert.throws(() => validarSuscripcionPush(body), (e) => e.status === 400);
  }
});

test("canales: solo están disponibles los medios que el servidor tiene configurados", () => {
  assert.deepEqual(configuracionCanales({}).disponibles, { SISTEMA: true, EMAIL: false, PUSH: false });
  const todo = configuracionCanales({ SMTP_HOST: "smtp.x", VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" });
  assert.deepEqual(todo.disponibles, { SISTEMA: true, EMAIL: true, PUSH: true });
  assert.equal(todo.pushClavePublica, "pub");
  assert.equal(configuracionCanales({ VAPID_PUBLIC_KEY: "solo-la-publica" }).disponibles.PUSH, false);
});

test("email: lleva el enlace y escapa el HTML del texto", () => {
  const { asunto, texto, html } = armarEmail({ titulo: "Nota <b>", mensaje: "a & b", url: "http://x/#notas", textoEnlace: "Ver mis notas" });
  assert.equal(asunto, "Nota <b>");
  assert.match(texto, /Ver mis notas: http:\/\/x\/#notas/);
  assert.ok(html.includes("Nota &lt;b&gt;") && html.includes("a &amp; b") && html.includes('href="http://x/#notas"'));
});

// ---------- Reparto de avisos según las preferencias ----------

function dbReparto(preferencias = []) {
  const e = { notificaciones: [], envios: [] };
  return {
    e,
    preferenciaNotificacion: {
      findMany: async ({ where }) => preferencias.filter((p) => where.usuarioId.in.includes(p.usuarioId) && where.tipo.in.includes(p.tipo)),
    },
    notificacion: { createMany: async ({ data }) => { e.notificaciones.push(...data); return { count: data.length }; } },
    envioNotificacion: { createMany: async ({ data }) => { e.envios.push(...data); return { count: data.length }; } },
  };
}
const aviso = { tipo: "AVISO_DOCENTE", titulo: "Consulta", mensaje: "El jueves a las 18" };

test("reparto: sin preferencias el aviso solo va a la campanita, como antes", async () => {
  const db = dbReparto();
  const r = await crearNotificaciones(db, [1, 2], aviso);
  assert.deepEqual(r, { creadas: 2, destinatarios: 2 });
  assert.equal(db.e.notificaciones.length, 2);
  assert.equal(db.e.envios.length, 0, "no se escribe en la bandeja de salida");
});

test("reparto: quien apagó la campanita y activó el email recibe solo el email (con enlace a su sección)", async () => {
  const db = dbReparto([
    { usuarioId: 1, tipo: "AVISO_DOCENTE", canal: "SISTEMA", activa: false },
    { usuarioId: 1, tipo: "AVISO_DOCENTE", canal: "EMAIL", activa: true },
  ]);
  const r = await crearNotificaciones(db, [1, 2], { ...aviso, materiaId: 7 });
  assert.deepEqual(r, { creadas: 1, destinatarios: 2 });
  assert.deepEqual(db.e.notificaciones.map((n) => n.usuarioId), [2]);
  assert.equal(db.e.envios.length, 1);
  assert.deepEqual(
    { usuarioId: db.e.envios[0].usuarioId, canal: db.e.envios[0].canal, seccion: db.e.envios[0].seccion, materiaId: db.e.envios[0].materiaId, titulo: db.e.envios[0].titulo },
    { usuarioId: 1, canal: "EMAIL", seccion: "materias", materiaId: 7, titulo: "Consulta" },
  );
});

test("reparto: quien apagó todos los medios de ese tipo no recibe nada; las preferencias de otro tipo no lo afectan", async () => {
  const db = dbReparto([
    { usuarioId: 1, tipo: "AVISO_DOCENTE", canal: "SISTEMA", activa: false },
    { usuarioId: 2, tipo: "CALIFICACION_PUBLICADA", canal: "SISTEMA", activa: false },
  ]);
  const r = await crearNotificaciones(db, [1, 2], aviso);
  assert.deepEqual(r, { creadas: 1, destinatarios: 1 });
  assert.deepEqual(db.e.notificaciones.map((n) => n.usuarioId), [2], "el 2 apagó otro tipo, este lo sigue recibiendo");
  assert.equal(db.e.envios.length, 0);
});

test("reparto: con los tres medios activos queda la fila de la campanita y un envío por email y por push", async () => {
  const db = dbReparto([
    { usuarioId: 1, tipo: "AVISO_DOCENTE", canal: "EMAIL", activa: true },
    { usuarioId: 1, tipo: "AVISO_DOCENTE", canal: "PUSH", activa: true },
  ]);
  await crearNotificaciones(db, [1], aviso);
  assert.equal(db.e.notificaciones.length, 1);
  assert.deepEqual(db.e.envios.map((e) => e.canal).sort(), ["EMAIL", "PUSH"]);
});

test("reparto: los avisos individuales guardan la sección (y la clave) tanto en la campanita como en el envío", async () => {
  const db = dbReparto([{ usuarioId: 5, tipo: "FECHA_EXAMEN", canal: "EMAIL", activa: true }]);
  await crearNotificacionesIndividuales(db, [
    { usuarioId: 5, tipo: "FECHA_EXAMEN", titulo: "Final de Bases de Datos", mensaje: "Fecha: 20/10", seccion: "inscripcion-final", clave: "examen-1" },
    { usuarioId: 6, tipo: "RECORDATORIO_ENTREGA", titulo: "Entrega", mensaje: "Mañana" },
  ]);
  const [paraCampanita5, paraCampanita6] = db.e.notificaciones;
  assert.equal(paraCampanita5.seccion, "inscripcion-final");
  assert.equal(paraCampanita6.seccion, null, "sin sección explícita se deduce del tipo al leerla");
  assert.deepEqual({ seccion: db.e.envios[0].seccion, clave: db.e.envios[0].clave }, { seccion: "inscripcion-final", clave: "examen-1" });
});

test("reparto: cargarPreferencias consulta una sola vez y agrupa por usuario y tipo", async () => {
  let consultas = 0;
  const db = { preferenciaNotificacion: { findMany: async () => { consultas++; return [
    { usuarioId: 1, tipo: "AVISO_DOCENTE", canal: "EMAIL", activa: true },
    { usuarioId: 1, tipo: "AVISO_DOCENTE", canal: "SISTEMA", activa: false },
  ]; } } };
  const mapa = await cargarPreferencias(db, [1, 2], ["AVISO_DOCENTE"]);
  assert.equal(consultas, 1);
  assert.equal(mapa.get("1:AVISO_DOCENTE").length, 2);
  assert.equal(mapa.has("2:AVISO_DOCENTE"), false);
  assert.equal((await cargarPreferencias(db, [], ["AVISO_DOCENTE"])).size, 0);
  assert.equal(consultas, 1, "sin destinatarios no consulta");
});

// ---------- Envío desde la bandeja de salida ----------

function dbEnvios(envios, suscripciones = []) {
  return {
    envioNotificacion: {
      findMany: async ({ where, take }) => envios.filter((e) => e.estado === where.estado).slice(0, take),
      update: async ({ where, data }) => Object.assign(envios.find((e) => e.id === where.id), data),
    },
    pushSuscripcion: {
      findMany: async ({ where }) => suscripciones.filter((s) => s.usuarioId === where.usuarioId),
      delete: async ({ where }) => { suscripciones.splice(suscripciones.findIndex((s) => s.id === where.id), 1); },
    },
  };
}
const envioEmail = (extra = {}) => ({
  id: 1, canal: "EMAIL", estado: "PENDIENTE", intentos: 0, tipo: "CALIFICACION_PUBLICADA", titulo: "Nueva calificación", mensaje: "Parcial: nota 7",
  seccion: "historial-notas", usuarioId: 9, usuario: { email: "ana@alumnos.ucse.edu.ar", emailPersonal: null }, ...extra,
});
const BASE = "http://app.test";

test("envío: el email sale al correo personal si lo cargó (si no, al institucional) con el enlace a la sección", async () => {
  assert.equal(destinoEmail({ email: "a@ucse.edu.ar", emailPersonal: "a@gmail.com" }), "a@gmail.com");
  assert.equal(destinoEmail({ email: "a@ucse.edu.ar", emailPersonal: "" }), "a@ucse.edu.ar");
  const envios = [envioEmail(), envioEmail({ id: 2, usuario: { email: "b@ucse.edu.ar", emailPersonal: "b@gmail.com" } })];
  const enviados = [];
  const r = await procesarEnvios(dbEnvios(envios), { baseUrl: BASE, transportes: { email: async (m) => { enviados.push(m); } } });
  assert.deepEqual(r, { enviados: 2, errores: 0 });
  assert.deepEqual(enviados.map((m) => m.para), ["ana@alumnos.ucse.edu.ar", "b@gmail.com"]);
  assert.match(enviados[0].texto, /Ver mi historial de notas: http:\/\/app\.test\/#historial-notas/);
  assert.ok(envios.every((e) => e.estado === "ENVIADO" && e.intentos === 1 && e.enviadoEn instanceof Date && e.error === null));
});

test("envío: si falla se reintenta y, después de MAX_INTENTOS, queda en ERROR con el motivo", async () => {
  const envios = [envioEmail()];
  const db = dbEnvios(envios);
  const caido = { baseUrl: BASE, transportes: { email: async () => { throw new Error("SMTP caído"); } } };
  for (let i = 1; i < MAX_INTENTOS; i++) {
    await procesarEnvios(db, caido);
    assert.equal(envios[0].estado, "PENDIENTE", `intento ${i}: sigue pendiente`);
    assert.equal(envios[0].intentos, i);
  }
  assert.deepEqual(await procesarEnvios(db, caido), { enviados: 0, errores: 1 });
  assert.deepEqual({ estado: envios[0].estado, intentos: envios[0].intentos, error: envios[0].error }, { estado: "ERROR", intentos: MAX_INTENTOS, error: "SMTP caído" });
  assert.deepEqual(await procesarEnvios(db, caido), { enviados: 0, errores: 0 }, "un envío en ERROR no se vuelve a intentar");
});

test("envío: sin medio configurado o sin destino falla de entrada, sin reintentos inútiles", async () => {
  const sinTransporte = [envioEmail()];
  await procesarEnvios(dbEnvios(sinTransporte), { baseUrl: BASE, transportes: {} });
  assert.deepEqual({ estado: sinTransporte[0].estado, intentos: sinTransporte[0].intentos }, { estado: "ERROR", intentos: 1 });
  assert.match(sinTransporte[0].error, /no está configurado/);

  const sinDestino = [envioEmail({ usuario: { email: null, emailPersonal: null } })];
  await procesarEnvios(dbEnvios(sinDestino), { baseUrl: BASE, transportes: { email: async () => { throw new Error("no debería llamarse"); } } });
  assert.equal(sinDestino[0].estado, "ERROR");
  assert.match(sinDestino[0].error, /correo de destino/);
});

test("envío: el push llega a todos los dispositivos; el que caducó (410) se borra y no frena a los demás", async () => {
  const envios = [envioEmail({ id: 3, canal: "PUSH" })];
  const suscripciones = [
    { id: 1, usuarioId: 9, endpoint: "https://push/a", p256dh: "k", auth: "a" },
    { id: 2, usuarioId: 9, endpoint: "https://push/b", p256dh: "k", auth: "a" },
    { id: 3, usuarioId: 8, endpoint: "https://push/otro-usuario", p256dh: "k", auth: "a" },
  ];
  const llamados = [];
  const push = async (suscripcion, payload) => {
    llamados.push({ endpoint: suscripcion.endpoint, payload });
    if (suscripcion.endpoint.endsWith("/a")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
  };
  await procesarEnvios(dbEnvios(envios, suscripciones), { baseUrl: BASE, transportes: { push } });
  assert.deepEqual(llamados.map((l) => l.endpoint), ["https://push/a", "https://push/b"], "solo los dispositivos del usuario");
  assert.deepEqual(llamados[1].payload, { titulo: "Nueva calificación", mensaje: "Parcial: nota 7", url: "http://app.test/#historial-notas", seccion: "historial-notas" });
  assert.equal(envios[0].estado, "ENVIADO");
  assert.deepEqual(suscripciones.map((s) => s.id), [2, 3], "se borró solo la suscripción caducada");
});

test("envío: push sin dispositivos o con todos caducados es un error definitivo; uno con falla temporal se reintenta", async () => {
  const sinDispositivos = [envioEmail({ canal: "PUSH" })];
  await procesarEnvios(dbEnvios(sinDispositivos, []), { baseUrl: BASE, transportes: { push: async () => {} } });
  assert.deepEqual({ estado: sinDispositivos[0].estado, intentos: sinDispositivos[0].intentos }, { estado: "ERROR", intentos: 1 });

  const caducados = [envioEmail({ canal: "PUSH" })];
  const subs = [{ id: 1, usuarioId: 9, endpoint: "https://push/a", p256dh: "k", auth: "a" }];
  await procesarEnvios(dbEnvios(caducados, subs), { baseUrl: BASE, transportes: { push: async () => { throw Object.assign(new Error("Gone"), { statusCode: 404 }); } } });
  assert.equal(caducados[0].estado, "ERROR");
  assert.equal(subs.length, 0);

  const temporal = [envioEmail({ canal: "PUSH" })];
  const subs2 = [{ id: 1, usuarioId: 9, endpoint: "https://push/a", p256dh: "k", auth: "a" }];
  await procesarEnvios(dbEnvios(temporal, subs2), { baseUrl: BASE, transportes: { push: async () => { throw Object.assign(new Error("502"), { statusCode: 502 }); } } });
  assert.deepEqual({ estado: temporal[0].estado, intentos: temporal[0].intentos }, { estado: "PENDIENTE", intentos: 1 });
  assert.equal(subs2.length, 1, "una falla temporal no borra la suscripción");
});

test("envío: dos corridas a la vez no mandan lo mismo dos veces", async () => {
  const envios = [envioEmail()];
  let liberar;
  const lento = new Promise((resolve) => { liberar = resolve; });
  const contador = { enviados: 0 };
  const opciones = { baseUrl: BASE, transportes: { email: async () => { contador.enviados++; await lento; } } };
  const primera = procesarEnvios(dbEnvios(envios), opciones);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(await procesarEnvios(dbEnvios(envios), opciones), { enviados: 0, errores: 0, omitido: true });
  liberar();
  assert.deepEqual(await primera, { enviados: 1, errores: 0 });
  assert.equal(contador.enviados, 1);
});

// ---------- Contrato HTTP (DB en memoria) ----------

function dbHttp({ notificaciones = [], preferencias = [], suscripciones = [], usuario = { email: "ana@alumnos.ucse.edu.ar", emailPersonal: null } } = {}) {
  const cumple = (f, where = {}) => (where.usuarioId == null || f.usuarioId === where.usuarioId) && (where.id == null || f.id === where.id);
  const db = {
    notificaciones, preferencias, suscripciones,
    tarea: { findMany: async () => [] },
    usuario: { findUnique: async () => usuario },
    notificacion: {
      findMany: async ({ where, select }) => notificaciones.filter((f) => cumple(f, where)).sort((a, b) => b.id - a.id)
        .map((f) => Object.fromEntries(Object.keys(select).map((k) => [k, f[k]]))),
      count: async ({ where }) => notificaciones.filter((f) => cumple(f, where) && (where.leidaEn !== null || f.leidaEn == null)).length,
      findFirst: async ({ where }) => notificaciones.find((f) => cumple(f, where)) ?? null,
      update: async ({ where, data }) => Object.assign(notificaciones.find((f) => f.id === where.id), data),
    },
    preferenciaNotificacion: {
      findMany: async ({ where }) => preferencias.filter((p) => p.usuarioId === where.usuarioId),
      upsert: async ({ where, update, create }) => {
        const { usuarioId, tipo, canal } = where.usuarioId_tipo_canal;
        const existente = preferencias.find((p) => p.usuarioId === usuarioId && p.tipo === tipo && p.canal === canal);
        if (existente) Object.assign(existente, update); else preferencias.push({ ...create });
      },
      updateMany: async ({ where, data }) => {
        const mias = preferencias.filter((p) => p.usuarioId === where.usuarioId && p.canal === where.canal && p.activa === where.activa);
        mias.forEach((p) => Object.assign(p, data));
        return { count: mias.length };
      },
    },
    pushSuscripcion: {
      count: async ({ where }) => suscripciones.filter((s) => s.usuarioId === where.usuarioId).length,
      upsert: async ({ where, update, create }) => {
        const existente = suscripciones.find((s) => s.endpoint === where.endpoint);
        if (existente) Object.assign(existente, update); else suscripciones.push({ id: suscripciones.length + 1, ...create });
      },
      deleteMany: async ({ where }) => {
        for (let i = suscripciones.length - 1; i >= 0; i--) if (suscripciones[i].endpoint === where.endpoint && suscripciones[i].usuarioId === where.usuarioId) suscripciones.splice(i, 1);
      },
    },
    $transaction: async (fn) => fn(db),
  };
  return db;
}

const TODO_HABILITADO = { disponibles: { SISTEMA: true, EMAIL: true, PUSH: true }, pushClavePublica: "clave-publica" };
const NADA_HABILITADO = { disponibles: { SISTEMA: true, EMAIL: false, PUSH: false }, pushClavePublica: null };

async function conAPI(db, canales, fn, usuarioId = 2) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/notificaciones", crearRouterNotificaciones(db, canales)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, { body, rol = "ALUMNO", token = true } = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/notificaciones${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${jwt.sign({ id: usuarioId, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

const fila = (id, usuarioId, extra = {}) => ({ id, usuarioId, tipo: "CALIFICACION_PUBLICADA", titulo: `N${id}`, mensaje: "m", creadoEn: new Date(), leidaEn: null, seccion: null, materia: null, ...extra });

test("HTTP: cada notificación trae su enlace a la sección (la guardada o la del tipo)", async () => {
  const db = dbHttp({ notificaciones: [fila(1, 2), fila(2, 2, { tipo: "FECHA_EXAMEN", seccion: "inscripcion-final" }), fila(3, 2, { tipo: "REVISION_RESUELTA" })] });
  await conAPI(db, NADA_HABILITADO, async (request) => {
    const { notificaciones } = await (await request("GET", "/")).json();
    const enlaces = Object.fromEntries(notificaciones.map((n) => [n.id, n.enlace.seccion]));
    assert.deepEqual(enlaces, { 1: "historial-notas", 2: "inscripcion-final", 3: "notas" });
    assert.equal(notificaciones[2].enlace.texto, "Ver mi historial de notas");
    assert.ok(!("seccion" in notificaciones[0]), "la sección cruda no se expone, solo el enlace");
  });
});

test("HTTP: marcar como no leída la deja pendiente de nuevo; una ajena da 404 y no se toca", async () => {
  const db = dbHttp({ notificaciones: [fila(1, 2, { leidaEn: new Date() }), fila(2, 99, { leidaEn: new Date() })] });
  await conAPI(db, NADA_HABILITADO, async (request) => {
    assert.equal((await request("POST", "/2/no-leida")).status, 404);
    assert.ok(db.notificaciones[1].leidaEn, "la ajena no se toca");
    assert.equal((await request("POST", "/77/no-leida")).status, 404);
    assert.equal((await request("POST", "/abc/no-leida")).status, 400);
    assert.equal((await request("POST", "/1/no-leida", { token: false })).status, 401);
    const r = await request("POST", "/1/no-leida");
    assert.deepEqual(await r.json(), { id: 1, leida: false, leidaEn: null });
    assert.equal(db.notificaciones[0].leidaEn, null);
    assert.equal((await request("POST", "/1/no-leida")).status, 200, "hacerlo dos veces no falla");
    assert.equal((await (await request("GET", "/")).json()).noLeidas, 1, "vuelve a contar como no leída");
    assert.equal((await request("POST", "/1/leer")).status, 200, "y se puede volver a marcar leída");
    assert.ok(db.notificaciones[0].leidaEn);
  });
});

test("HTTP preferencias: exige login y rol con notificaciones", async () => {
  await conAPI(dbHttp(), TODO_HABILITADO, async (request) => {
    assert.equal((await request("GET", "/preferencias", { token: false })).status, 401);
    assert.equal((await request("GET", "/preferencias", { rol: "ADMIN" })).status, 403);
    assert.equal((await request("PUT", "/preferencias", { rol: "ADMIN", body: { preferencias: [] } })).status, 403);
    assert.equal((await request("POST", "/push/suscripcion", { rol: "ADMIN", body: {} })).status, 403);
  });
});

test("HTTP preferencias: sin cambios muestra los valores por defecto y qué medios tiene el servidor", async () => {
  await conAPI(dbHttp(), NADA_HABILITADO, async (request) => {
    const cuerpo = await (await request("GET", "/preferencias")).json();
    assert.deepEqual(cuerpo.tipos.map((t) => t.tipo), TIPOS_POR_ROL.ALUMNO);
    assert.ok(cuerpo.tipos.every((t) => t.canales.SISTEMA && !t.canales.EMAIL && !t.canales.PUSH));
    assert.deepEqual(cuerpo.canales, {
      SISTEMA: { disponible: true },
      EMAIL: { disponible: false, destino: "ana@alumnos.ucse.edu.ar" },
      PUSH: { disponible: false, clavePublica: null, dispositivos: 0 },
    });
    const docente = await (await request("GET", "/preferencias", { rol: "DOCENTE" })).json();
    assert.deepEqual(docente.tipos.map((t) => t.tipo), ["SOLICITUD_REVISION"]);
  });
});

test("HTTP preferencias: guarda los cambios del usuario del token y devuelve la matriz actualizada", async () => {
  const db = dbHttp({ preferencias: [{ usuarioId: 99, tipo: "AVISO_DOCENTE", canal: "SISTEMA", activa: false }] });
  await conAPI(db, TODO_HABILITADO, async (request) => {
    const r = await request("PUT", "/preferencias", { body: { preferencias: [
      { tipo: "AVISO_DOCENTE", canal: "SISTEMA", activa: false },
      { tipo: "FECHA_EXAMEN", canal: "EMAIL", activa: true },
    ], usuarioId: 99 } });
    assert.equal(r.status, 200);
    const { tipos } = await r.json();
    assert.deepEqual(tipos.find((t) => t.tipo === "AVISO_DOCENTE").canales, { SISTEMA: false, EMAIL: false, PUSH: false });
    assert.deepEqual(tipos.find((t) => t.tipo === "FECHA_EXAMEN").canales, { SISTEMA: true, EMAIL: true, PUSH: false });
    assert.deepEqual(db.preferencias.filter((p) => p.usuarioId === 2).map((p) => p.tipo).sort(), ["AVISO_DOCENTE", "FECHA_EXAMEN"]);
    assert.equal(db.preferencias.find((p) => p.usuarioId === 99).activa, false, "las de otro usuario no se tocan ni se leen");
    // Volver a prender lo apagado actualiza la fila en vez de duplicarla.
    await request("PUT", "/preferencias", { body: { preferencias: [{ tipo: "AVISO_DOCENTE", canal: "SISTEMA", activa: true }] } });
    assert.equal(db.preferencias.filter((p) => p.usuarioId === 2 && p.tipo === "AVISO_DOCENTE").length, 1);
  });
});

test("HTTP preferencias: no deja activar email ni push si el servidor no los tiene, y rechaza datos inválidos", async () => {
  const db = dbHttp();
  await conAPI(db, NADA_HABILITADO, async (request) => {
    const cambiar = (canal, activa = true) => request("PUT", "/preferencias", { body: { preferencias: [{ tipo: "AVISO_DOCENTE", canal, activa }] } });
    assert.equal((await cambiar("EMAIL")).status, 409);
    assert.equal((await cambiar("PUSH")).status, 409);
    assert.equal(db.preferencias.length, 0, "no se guarda lo que no puede funcionar");
    assert.equal((await cambiar("EMAIL", false)).status, 200, "apagar siempre se puede");
    assert.equal((await request("PUT", "/preferencias", { body: { preferencias: [{ tipo: "SOLICITUD_REVISION", canal: "EMAIL", activa: false }] } })).status, 400, "ese tipo es del docente");
    assert.equal((await request("PUT", "/preferencias", { body: {} })).status, 400);
  });
});

test("HTTP preferencias: el push exige haber permitido las notificaciones en un navegador (un dispositivo)", async () => {
  const db = dbHttp();
  await conAPI(db, TODO_HABILITADO, async (request) => {
    const activarPush = () => request("PUT", "/preferencias", { body: { preferencias: [{ tipo: "AVISO_DOCENTE", canal: "PUSH", activa: true }] } });
    assert.equal((await activarPush()).status, 409);
    const suscripcion = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BKey", auth: "authKey" } };
    const alta = await request("POST", "/push/suscripcion", { body: suscripcion });
    assert.equal(alta.status, 201);
    assert.deepEqual(await alta.json(), { dispositivos: 1 });
    assert.equal((await activarPush()).status, 200);
    assert.equal((await (await request("GET", "/preferencias")).json()).canales.PUSH.dispositivos, 1);
  });
});

test("HTTP push: la suscripción se valida, se reasigna al usuario actual y al quitar el último dispositivo se apaga el push", async () => {
  const suscripcion = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BKey", auth: "authKey" } };
  const db = dbHttp({ suscripciones: [{ id: 1, usuarioId: 99, endpoint: suscripcion.endpoint, p256dh: "viejo", auth: "viejo" }] });
  await conAPI(db, TODO_HABILITADO, async (request) => {
    assert.equal((await request("POST", "/push/suscripcion", { body: { ...suscripcion, endpoint: "http://inseguro/x" } })).status, 400);
    assert.equal((await request("POST", "/push/suscripcion", { body: suscripcion })).status, 201);
    assert.equal(db.suscripciones.length, 1, "el mismo navegador no se duplica");
    assert.equal(db.suscripciones[0].usuarioId, 2, "pasó a ser del usuario que acaba de entrar");

    await request("PUT", "/preferencias", { body: { preferencias: [{ tipo: "AVISO_DOCENTE", canal: "PUSH", activa: true }] } });
    const r = await request("DELETE", "/push/suscripcion", { body: { endpoint: suscripcion.endpoint } });
    assert.deepEqual(await r.json(), { dispositivos: 0 });
    assert.equal(db.preferencias.find((p) => p.canal === "PUSH").activa, false, "sin dispositivos el push queda apagado");
    assert.equal((await request("DELETE", "/push/suscripcion", { body: { endpoint: "no es una url" } })).status, 400);
  });
  await conAPI(dbHttp(), NADA_HABILITADO, async (request) => {
    assert.equal((await request("POST", "/push/suscripcion", { body: suscripcion })).status, 409, "sin push en el servidor no se registra nada");
  });
});

test("HTTP push: no se puede quitar el dispositivo de otro usuario", async () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/ajeno";
  const db = dbHttp({ suscripciones: [{ id: 1, usuarioId: 99, endpoint, p256dh: "k", auth: "a" }] });
  await conAPI(db, TODO_HABILITADO, async (request) => {
    await request("DELETE", "/push/suscripcion", { body: { endpoint } });
    assert.equal(db.suscripciones.length, 1);
  });
});

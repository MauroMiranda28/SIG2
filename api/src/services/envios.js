// Envío de los avisos por EMAIL y PUSH desde la bandeja de salida (tabla EnvioNotificacion).
// Los avisos se escriben ahí en la misma transacción que el cambio que los origina (ver
// repartirAvisos en services/notificaciones.js); este proceso los manda DESPUÉS, así un cambio que se
// revierte nunca genera un email ni un push, y una caída del servidor de correo no rompe el cambio.
// Cada envío se intenta hasta MAX_INTENTOS veces; después queda en ERROR con el motivo.

import { armarEmail } from "./canales.js";
import { enlaceDe, urlDeSeccion } from "./enlaces.js";

export const MAX_INTENTOS = 3;
export const LOTE = 25;
export const CADA_MS = 10_000;
const LARGO_ERROR = 300;

const DATOS_ENVIO = {
  id: true, canal: true, intentos: true, tipo: true, titulo: true, mensaje: true, seccion: true, usuarioId: true,
  usuario: { select: { email: true, emailPersonal: true } },
};

// A dónde va el email: el correo personal si lo cargó, si no el institucional.
export function destinoEmail(usuario) {
  return usuario?.emailPersonal || usuario?.email || null;
}

// Un fallo que no tiene sentido reintentar (falta la configuración, el destino o el dispositivo).
const errorDefinitivo = (mensaje) => Object.assign(new Error(mensaje), { definitivo: true });

const recortar = (texto) => String(texto ?? "").slice(0, LARGO_ERROR);

async function enviarEmail(envio, { transportes, url, textoEnlace }) {
  if (!transportes.email) throw errorDefinitivo("El envío por email no está configurado en este servidor.");
  const para = destinoEmail(envio.usuario);
  if (!para) throw errorDefinitivo("El usuario no tiene un correo de destino.");
  await transportes.email({ para, ...armarEmail({ titulo: envio.titulo, mensaje: envio.mensaje, url, textoEnlace }) });
}

async function enviarPush(db, envio, { transportes, url }) {
  if (!transportes.push) throw errorDefinitivo("Las notificaciones push no están configuradas en este servidor.");
  const suscripciones = await db.pushSuscripcion.findMany({
    where: { usuarioId: envio.usuarioId }, select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (!suscripciones.length) throw errorDefinitivo("El usuario no tiene dispositivos suscriptos a push.");

  const payload = { titulo: envio.titulo, mensaje: envio.mensaje, url, seccion: envio.seccion };
  let enviados = 0;
  let ultimoError = null;
  let todosCaducados = true;
  for (const suscripcion of suscripciones) {
    try {
      await transportes.push(suscripcion, payload);
      enviados++;
      todosCaducados = false;
    } catch (e) {
      // 404 y 410: el navegador ya no acepta esa suscripción (la anuló o expiró). Se borra y no se reintenta.
      if (e.statusCode === 404 || e.statusCode === 410) await db.pushSuscripcion.delete({ where: { id: suscripcion.id } });
      else { todosCaducados = false; ultimoError = e; }
    }
  }
  if (enviados > 0) return;
  if (todosCaducados) throw errorDefinitivo("Las suscripciones push del usuario ya no son válidas.");
  throw ultimoError ?? new Error("No se pudo enviar el push.");
}

let procesando = false;

// Procesa un lote de envíos pendientes. `transportes` es { email, push } (cada uno una función o null).
export async function procesarEnvios(db, { transportes = {}, baseUrl, lote = LOTE } = {}) {
  if (procesando) return { enviados: 0, errores: 0, omitido: true }; // no se pisa con la corrida anterior
  procesando = true;
  try {
    const pendientes = await db.envioNotificacion.findMany({
      where: { estado: "PENDIENTE" }, orderBy: { id: "asc" }, take: lote, select: DATOS_ENVIO,
    });

    let enviados = 0;
    let errores = 0;
    for (const envio of pendientes) {
      const enlace = enlaceDe({ tipo: envio.tipo, seccion: envio.seccion });
      const contexto = { transportes, url: urlDeSeccion(envio.seccion, baseUrl), textoEnlace: enlace.texto };
      const intentos = envio.intentos + 1;
      try {
        if (envio.canal === "EMAIL") await enviarEmail(envio, contexto);
        else if (envio.canal === "PUSH") await enviarPush(db, envio, contexto);
        else throw errorDefinitivo("Medio de envío desconocido.");
        await db.envioNotificacion.update({ where: { id: envio.id }, data: { estado: "ENVIADO", enviadoEn: new Date(), intentos, error: null } });
        enviados++;
      } catch (e) {
        const terminado = e.definitivo || intentos >= MAX_INTENTOS;
        await db.envioNotificacion.update({
          where: { id: envio.id }, data: { estado: terminado ? "ERROR" : "PENDIENTE", intentos, error: recortar(e.message) },
        });
        errores++;
      }
    }
    return { enviados, errores };
  } finally {
    procesando = false;
  }
}

// Deja corriendo el proceso que vacía la bandeja cada CADA_MS. No mantiene vivo el programa por sí solo.
export function iniciarEnvios(db, opciones) {
  const temporizador = setInterval(() => {
    procesarEnvios(db, opciones).catch((e) => console.error("No se pudieron procesar los envíos de notificaciones:", e.message));
  }, CADA_MS);
  temporizador.unref();
  return temporizador;
}

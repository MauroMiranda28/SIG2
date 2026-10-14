// Medios por los que sale una notificación fuera del sistema: email (SMTP) y push (Web Push).
// Cada uno solo está disponible si el servidor lo tiene configurado por variables de entorno
// (ver api/.env.example). Si no, la pantalla de preferencias lo muestra como no disponible en lugar de
// aparentar que funciona, y no se puede activar.

import nodemailer from "nodemailer";
import webpush from "web-push";

// Qué medios tiene habilitados este servidor.
export function configuracionCanales(env = process.env) {
  const email = Boolean(env.SMTP_HOST);
  const push = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  return {
    disponibles: { SISTEMA: true, EMAIL: email, PUSH: push },
    pushClavePublica: push ? env.VAPID_PUBLIC_KEY : null,
  };
}

const escaparHtml = (texto) => String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Arma el transporte SMTP, o null si falta SMTP_HOST. Devuelve async ({ para, asunto, texto, html }).
export function crearTransporteEmail(env = process.env) {
  if (!env.SMTP_HOST) return null;
  const transporte = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  const remitente = env.SMTP_FROM ?? "Sistema Académico <no-responder@localhost>";
  return ({ para, asunto, texto, html }) => transporte.sendMail({ from: remitente, to: para, subject: asunto, text: texto, html });
}

// Arma el transporte de Web Push, o null si faltan las claves VAPID. Devuelve async (suscripcion, payload).
export function crearTransportePush(env = process.env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  const sujeto = env.VAPID_SUBJECT ?? "mailto:no-responder@localhost";
  return (suscripcion, payload) => webpush.sendNotification(
    { endpoint: suscripcion.endpoint, keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth } },
    JSON.stringify(payload),
    { vapidDetails: { subject: sujeto, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }, TTL: 60 * 60 * 24 },
  );
}

// El mismo aviso en texto plano y en HTML sencillo, con el enlace a la sección.
export function armarEmail({ titulo, mensaje, url, textoEnlace }) {
  return {
    asunto: titulo,
    texto: `${mensaje}\n\n${textoEnlace}: ${url}\n\nPodés elegir qué avisos recibir y por qué medio desde «Notificaciones» en el sistema.`,
    html: `<p><strong>${escaparHtml(titulo)}</strong></p>`
      + `<p style="white-space:pre-line">${escaparHtml(mensaje)}</p>`
      + `<p><a href="${escaparHtml(url)}">${escaparHtml(textoEnlace)}</a></p>`
      + `<p style="color:#666;font-size:12px">Podés elegir qué avisos recibir y por qué medio desde «Notificaciones» en el sistema.</p>`,
  };
}

import { api } from "../api.js";

// Notificaciones push del navegador (Web Push). Cada navegador del usuario es un «dispositivo»:
// se registra en el servidor y el service worker (public/sw.js) muestra los avisos que lleguen.

export const soportaPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// La clave pública VAPID viaja en base64url; pushManager la pide como bytes.
function aBytes(base64Url) {
  const relleno = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const binario = atob((base64Url + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

async function registroDelServiceWorker() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

// ¿Este navegador ya está suscripto?
export async function suscripcionActual() {
  if (!soportaPush()) return null;
  const registro = await navigator.serviceWorker.getRegistration("/sw.js");
  return registro ? registro.pushManager.getSubscription() : null;
}

// Pide permiso, suscribe este navegador y lo registra en el servidor. Devuelve cuántos dispositivos tiene el usuario.
export async function suscribirEsteNavegador(clavePublica) {
  if (!soportaPush()) throw new Error("Este navegador no admite notificaciones push.");
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") throw new Error("No diste permiso para mostrar notificaciones. Podés habilitarlo desde la configuración del navegador.");

  const registro = await registroDelServiceWorker();
  const suscripcion = (await registro.pushManager.getSubscription())
    ?? (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clavePublica) }));
  const { dispositivos } = await api("/notificaciones/push/suscripcion", { method: "POST", body: JSON.stringify(suscripcion.toJSON()) });
  return dispositivos;
}

// Quita este navegador del servidor y de los dispositivos del usuario. Devuelve cuántos le quedan.
export async function desuscribirEsteNavegador() {
  const suscripcion = await suscripcionActual();
  if (!suscripcion) return null;
  const { dispositivos } = await api("/notificaciones/push/suscripcion", { method: "DELETE", body: JSON.stringify({ endpoint: suscripcion.endpoint }) });
  await suscripcion.unsubscribe();
  return dispositivos;
}

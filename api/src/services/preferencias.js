// Preferencias de notificación: qué tipos de aviso recibe cada usuario y por qué medio.
// La validación y el armado viven acá, separados de la ruta, para probarlos sin DB.
//
// Solo se guardan los cambios: sin fila vale el valor por defecto (el aviso aparece en el sistema;
// el email y el push son opcionales y arrancan apagados). Así, todo lo anterior a esta historia
// sigue funcionando igual para quien nunca entró a configurar nada.

import { errorAcceso } from "./docentes.js";

export const CANALES = ["SISTEMA", "EMAIL", "PUSH"];
export const POR_DEFECTO = { SISTEMA: true, EMAIL: false, PUSH: false };

// Los tipos que puede configurar cada rol (los que realmente le llegan).
export const TIPOS_POR_ROL = {
  ALUMNO: ["AVISO_DOCENTE", "HORARIO_MODIFICADO", "CALIFICACION_PUBLICADA", "FECHA_EXAMEN", "RECORDATORIO_ENTREGA", "REVISION_RESUELTA"],
  DOCENTE: ["SOLICITUD_REVISION"],
};

const MAX_CAMBIOS = 50;

export function tiposDelRol(rol) {
  return TIPOS_POR_ROL[rol] ?? [];
}

// Canales activos para un aviso, partiendo de los valores por defecto y aplicando lo que el usuario cambió.
// `cambios` es una lista de { canal, activa }.
export function canalesActivos(cambios = []) {
  const valores = { ...POR_DEFECTO };
  for (const { canal, activa } of cambios) valores[canal] = activa;
  return new Set(CANALES.filter((canal) => valores[canal]));
}

// Para cada destinatario y tipo, lo que cambió. Devuelve un Map con clave "usuarioId:tipo".
export async function cargarPreferencias(db, usuarioIds, tipos) {
  const mapa = new Map();
  if (!usuarioIds.length || !tipos.length) return mapa;
  const filas = await db.preferenciaNotificacion.findMany({
    where: { usuarioId: { in: usuarioIds }, tipo: { in: tipos } },
    select: { usuarioId: true, tipo: true, canal: true, activa: true },
  });
  for (const { usuarioId, tipo, canal, activa } of filas) {
    const clave = `${usuarioId}:${tipo}`;
    mapa.set(clave, [...(mapa.get(clave) ?? []), { canal, activa }]);
  }
  return mapa;
}

export const canalesDe = (mapa, usuarioId, tipo) => canalesActivos(mapa.get(`${usuarioId}:${tipo}`));

// La matriz completa de un usuario: un renglón por tipo con el estado de cada canal.
export function armarMatriz(rol, filas) {
  const porTipo = new Map();
  for (const { tipo, canal, activa } of filas) porTipo.set(tipo, [...(porTipo.get(tipo) ?? []), { canal, activa }]);
  return tiposDelRol(rol).map((tipo) => {
    const activos = canalesActivos(porTipo.get(tipo));
    return { tipo, canales: Object.fromEntries(CANALES.map((canal) => [canal, activos.has(canal)])) };
  });
}

// Cuerpo de PUT /api/notificaciones/preferencias: { preferencias: [{ tipo, canal, activa }] }.
export function validarPreferencias(body, rol) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) throw errorAcceso(400, "Faltan los datos de las preferencias.");
  const { preferencias } = body;
  if (!Array.isArray(preferencias) || !preferencias.length) throw errorAcceso(400, "Indicá al menos una preferencia para cambiar.");
  if (preferencias.length > MAX_CAMBIOS) throw errorAcceso(400, `Se pueden cambiar hasta ${MAX_CAMBIOS} preferencias por vez.`);

  const permitidos = tiposDelRol(rol);
  const vistos = new Set();
  return preferencias.map((p) => {
    if (p == null || typeof p !== "object" || Array.isArray(p)) throw errorAcceso(400, "Hay una preferencia con datos incompletos.");
    if (!permitidos.includes(p.tipo)) throw errorAcceso(400, "Ese tipo de aviso no corresponde a tu rol.");
    if (!CANALES.includes(p.canal)) throw errorAcceso(400, "Elegí un medio válido: sistema, email o push.");
    if (typeof p.activa !== "boolean") throw errorAcceso(400, "Indicá si el medio queda activado o desactivado (true o false).");
    const clave = `${p.tipo}:${p.canal}`;
    if (vistos.has(clave)) throw errorAcceso(400, "Hay una preferencia repetida.");
    vistos.add(clave);
    return { tipo: p.tipo, canal: p.canal, activa: p.activa };
  });
}

// Activar un medio que el servidor no tiene configurado no puede funcionar: se rechaza en vez de guardarlo.
// Apagar uno siempre se puede. `disponibles` es { EMAIL: boolean, PUSH: boolean }; `dispositivos` son los push del usuario.
export function verificarCanalesDisponibles(cambios, { disponibles, dispositivos = 0 }) {
  for (const { canal, activa } of cambios) {
    if (!activa) continue;
    if (canal === "EMAIL" && !disponibles.EMAIL) throw errorAcceso(409, "El envío por email no está habilitado en este servidor.");
    if (canal === "PUSH" && !disponibles.PUSH) throw errorAcceso(409, "Las notificaciones push no están habilitadas en este servidor.");
    if (canal === "PUSH" && dispositivos === 0) throw errorAcceso(409, "Primero permití las notificaciones en este navegador para poder recibir avisos push.");
  }
}

// ---------- Suscripción push del navegador ----------

const LARGO_ENDPOINT_MAXIMO = 2048;
const LARGO_CLAVE_MAXIMO = 255;

// Cuerpo de POST /api/notificaciones/push/suscripcion: lo que devuelve pushManager.subscribe().toJSON().
export function validarSuscripcionPush(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) throw errorAcceso(400, "Faltan los datos de la suscripción.");
  const { endpoint, keys } = body;
  validarEndpointPush(endpoint);
  if (keys == null || typeof keys !== "object") throw errorAcceso(400, "Faltan las claves de la suscripción.");
  for (const clave of [keys.p256dh, keys.auth]) {
    if (typeof clave !== "string" || !clave || clave.length > LARGO_CLAVE_MAXIMO) throw errorAcceso(400, "Las claves de la suscripción no son válidas.");
  }
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

// Los servicios push de los navegadores siempre usan https.
export function validarEndpointPush(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch { url = null; }
  if (typeof endpoint !== "string" || endpoint.length > LARGO_ENDPOINT_MAXIMO || url?.protocol !== "https:") {
    throw errorAcceso(400, "El endpoint de la suscripción no es válido.");
  }
  return endpoint;
}

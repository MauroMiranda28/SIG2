// Notificaciones dentro del sistema. Cada una es una fila por destinatario (tabla Notificacion).
// La validación y el armado de consultas viven acá, separados de la ruta, para probarlos sin DB.
// `crearNotificaciones` es lo que usan las demás historias para avisarle algo a los usuarios.

import { errorAcceso } from "./docentes.js";

export const TIPOS_NOTIFICACION = [
  "AVISO_DOCENTE", "HORARIO_MODIFICADO", "CALIFICACION_PUBLICADA", "FECHA_EXAMEN", "RECORDATORIO_ENTREGA",
];

export const LIMITE_POR_DEFECTO = 30;
export const LIMITE_MAXIMO = 100;
export const LARGO_TITULO_MAXIMO = 120;
export const LARGO_MENSAJE_MAXIMO = 1000;

export const DATOS_NOTIFICACION = {
  id: true, tipo: true, titulo: true, mensaje: true, creadoEn: true, leidaEn: true,
  materia: { select: { id: true, nombre: true, codigo: true } },
};

// Cuántas notificaciones devolver por pedido (entero de 1 a LIMITE_MAXIMO).
export function validarLimite(valor) {
  if (valor == null || valor === "") return LIMITE_POR_DEFECTO;
  const limite = Number(valor);
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO) {
    throw errorAcceso(400, `El límite tiene que ser un número entre 1 y ${LIMITE_MAXIMO}.`);
  }
  return limite;
}

// Para paginar: trae las anteriores a la última que ya se vio (id menor).
export function validarCursor(valor) {
  if (valor == null || valor === "") return null;
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw errorAcceso(400, "El cursor no es válido.");
  return id;
}

export function validarSoloNoLeidas(valor) {
  if (valor == null || valor === "" || valor === "false") return false;
  if (valor === "true") return true;
  throw errorAcceso(400, "El filtro de no leídas tiene que ser true o false.");
}

// El destinatario sale siempre del token: nadie consulta ni marca las de otro usuario.
export function filtroNotificaciones(usuarioId, { soloNoLeidas = false, antesDeId = null } = {}) {
  return {
    usuarioId,
    ...(soloNoLeidas ? { leidaEn: null } : {}),
    ...(antesDeId ? { id: { lt: antesDeId } } : {}),
  };
}

export function limpiarTexto(valor, nombre, maximo) {
  if (typeof valor !== "string" || !valor.trim()) throw errorAcceso(400, `Falta el ${nombre} de la notificación.`);
  const texto = valor.trim().replace(/[ \t]+/g, " ");
  if (texto.length > maximo) throw errorAcceso(400, `El ${nombre} puede tener hasta ${maximo} caracteres.`);
  return texto;
}

// Crea la misma notificación para cada destinatario (una fila por persona, sin repetidos).
// Recibe `db` o una transacción: así quien la usa puede hacerlo junto con su propio cambio.
export async function crearNotificaciones(db, destinatarioIds, { tipo, titulo, mensaje, materiaId = null }) {
  if (!TIPOS_NOTIFICACION.includes(tipo)) throw errorAcceso(400, "El tipo de notificación no es válido.");
  const datos = {
    tipo,
    titulo: limpiarTexto(titulo, "título", LARGO_TITULO_MAXIMO),
    mensaje: limpiarTexto(mensaje, "mensaje", LARGO_MENSAJE_MAXIMO),
    materiaId,
  };
  const destinatarios = [...new Set(destinatarioIds)];
  if (!destinatarios.length) return { creadas: 0 };
  const { count } = await db.notificacion.createMany({
    data: destinatarios.map((usuarioId) => ({ ...datos, usuarioId })),
  });
  return { creadas: count };
}

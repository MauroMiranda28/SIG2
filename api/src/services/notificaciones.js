// Notificaciones dentro del sistema. Cada una es una fila por destinatario (tabla Notificacion).
// La validación y el armado de consultas viven acá, separados de la ruta, para probarlos sin DB.
// `crearNotificaciones` es lo que usan las demás historias para avisarle algo a los usuarios.

import { errorAcceso } from "./docentes.js";

export const TIPOS_NOTIFICACION = [
  "AVISO_DOCENTE", "HORARIO_MODIFICADO", "CALIFICACION_PUBLICADA", "FECHA_EXAMEN", "RECORDATORIO_ENTREGA", "SOLICITUD_REVISION",
];

export const LIMITE_POR_DEFECTO = 30;
export const LIMITE_MAXIMO = 100;
export const LARGO_TITULO_MAXIMO = 120;
export const LARGO_MENSAJE_MAXIMO = 1000;

export const DATOS_NOTIFICACION = {
  id: true, tipo: true, titulo: true, mensaje: true, creadoEn: true, leidaEn: true,
  materia: { select: { id: true, nombre: true, codigo: true } },
  autor: { select: { nombre: true, apellido: true } }, // quién lo envió; null si lo generó el sistema
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

// Para los avisos que genera el sistema: un texto largo se acorta, no se rechaza,
// así una notificación nunca puede hacer fallar el cambio que la origina.
export function acortar(texto, maximo) {
  const limpio = String(texto ?? "").trim().replace(/[ \t]+/g, " ");
  return limpio.length > maximo ? `${limpio.slice(0, maximo - 1)}…` : limpio;
}

// Avisa a los alumnos inscriptos en la comisión que cambió su horario (se agregó o se quitó un bloque).
// Recibe la transacción del cambio: el aviso se guarda junto con él o no se guarda ninguno de los dos.
// `detalle` es el mismo texto del registro de cambios (ej. «Comisión A: Lunes 18:00–20:00 · Aula 1»).
export async function avisarCambioHorario(db, { comisionId, materiaId, materiaNombre, accion, detalle, autorId }) {
  const inscriptos = await db.inscripcionComision.findMany({ where: { comisionId }, select: { alumnoId: true } });
  const agregado = accion === "HORARIO_AGREGADO";
  return crearNotificaciones(db, inscriptos.map((i) => i.alumnoId), {
    tipo: "HORARIO_MODIFICADO",
    titulo: acortar(`Cambió el horario de ${materiaNombre}`, LARGO_TITULO_MAXIMO),
    mensaje: acortar(`${agregado ? "Se agregó este horario" : "Se quitó este horario"}: ${detalle}`, LARGO_MENSAJE_MAXIMO),
    materiaId,
    autorId,
  });
}

// ---------- Calificaciones ----------

const ETIQUETA_EVALUACION = {
  PARCIAL: "Parcial", RECUPERATORIO: "Recuperatorio", FINAL: "Examen final",
  TRABAJO_PRACTICO: "Trabajo práctico", CONDICION_FINAL: "Condición final",
};
const ETIQUETA_CONDICION = { REGULAR: "Regular", PROMOCIONADO: "Promocionado", LIBRE: "Libre" };

const formatoNota = (nota) => String(nota).replace(".", ",");
// Las fechas de calendario se guardan a medianoche UTC.
const formatoFecha = (fecha) => new Date(fecha).toLocaleDateString("es-AR", { timeZone: "UTC" });

// Texto del aviso cuando se publica una nota. Es un aviso personal: lleva la nota del propio alumno.
export function avisoCalificacion({ materiaNombre, tipo, condicion, nota, fecha }) {
  const etiqueta = ETIQUETA_EVALUACION[tipo] ?? "Evaluación";
  const resultado = tipo === "CONDICION_FINAL" && condicion ? `${ETIQUETA_CONDICION[condicion] ?? condicion} (nota ${formatoNota(nota)})` : `nota ${formatoNota(nota)}`;
  return {
    titulo: `Nueva calificación en ${materiaNombre}`,
    mensaje: `${etiqueta} del ${formatoFecha(fecha)}: ${resultado}.`,
  };
}

// Texto del aviso cuando se corrige una nota que ya estaba publicada.
export function avisoCorreccion({ materiaNombre, tipo, notaAnterior, notaNueva }) {
  const etiqueta = ETIQUETA_EVALUACION[tipo] ?? "Evaluación";
  return {
    titulo: `Se corrigió una calificación de ${materiaNombre}`,
    mensaje: `${etiqueta}: la nota pasó de ${formatoNota(notaAnterior)} a ${formatoNota(notaNueva)}.`,
  };
}

// Aviso para el docente cuando un alumno pide la revisión de una nota: quién, qué evaluación y por qué.
// Hoy el docente no tiene una pantalla de solicitudes, así que el aviso lleva todos los datos.
export function avisoSolicitudRevision({ alumnoNombre, materiaNombre, tipo, nota, fecha, motivo }) {
  const etiqueta = ETIQUETA_EVALUACION[tipo] ?? "evaluación";
  return {
    titulo: `Solicitud de revisión en ${materiaNombre}`,
    mensaje: `${alumnoNombre} pidió la revisión de su ${etiqueta.toLowerCase()} del ${formatoFecha(fecha)} (nota ${formatoNota(nota)}). Motivo: ${motivo}`,
  };
}

// Crea varias notificaciones con texto distinto para cada destinatario, de una sola vez.
// Cada fila: { usuarioId, tipo, titulo, mensaje, materiaId, autorId, clave }. Como pasa con las demás
// notificaciones generadas por el sistema, un texto largo se acorta y nunca hace fallar el cambio.
// Con `clave`, el mismo usuario no recibe dos veces el mismo aviso: la repetida se ignora.
export async function crearNotificacionesIndividuales(db, filas) {
  if (!filas.length) return { creadas: 0 };
  const data = filas.map((f) => {
    if (!TIPOS_NOTIFICACION.includes(f.tipo)) throw errorAcceso(400, "El tipo de notificación no es válido.");
    return {
      usuarioId: f.usuarioId, tipo: f.tipo, materiaId: f.materiaId ?? null, autorId: f.autorId ?? null, clave: f.clave ?? null,
      titulo: acortar(f.titulo, LARGO_TITULO_MAXIMO), mensaje: acortar(f.mensaje, LARGO_MENSAJE_MAXIMO),
    };
  });
  const { count } = await db.notificacion.createMany({ data, skipDuplicates: true });
  return { creadas: count };
}

// Cuerpo de POST /api/docentes/materias/:id/avisos: título y mensaje del aviso.
export function validarAviso(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) throw errorAcceso(400, "Faltan los datos del aviso.");
  return {
    titulo: limpiarTexto(body.titulo, "título", LARGO_TITULO_MAXIMO),
    mensaje: limpiarTexto(body.mensaje, "mensaje", LARGO_MENSAJE_MAXIMO),
  };
}

// Crea la misma notificación para cada destinatario (una fila por persona, sin repetidos).
// Recibe `db` o una transacción: así quien la usa puede hacerlo junto con su propio cambio.
export async function crearNotificaciones(db, destinatarioIds, { tipo, titulo, mensaje, materiaId = null, autorId = null }) {
  if (!TIPOS_NOTIFICACION.includes(tipo)) throw errorAcceso(400, "El tipo de notificación no es válido.");
  const datos = {
    tipo,
    titulo: limpiarTexto(titulo, "título", LARGO_TITULO_MAXIMO),
    mensaje: limpiarTexto(mensaje, "mensaje", LARGO_MENSAJE_MAXIMO),
    materiaId,
    autorId,
  };
  const destinatarios = [...new Set(destinatarioIds)];
  if (!destinatarios.length) return { creadas: 0 };
  const { count } = await db.notificacion.createMany({
    data: destinatarios.map((usuarioId) => ({ ...datos, usuarioId })),
  });
  return { creadas: count };
}

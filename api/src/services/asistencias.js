// El alumno asienta su propio estado de presentismo clase por clase. La
// validación vive acá, separada de la ruta, para poder probarla sin DB.

import { hoy } from "./examenes.js";

export function errorAsistencia(status, message) {
  return Object.assign(new Error(message), { status });
}

const ESTADOS_VALIDOS = ["PRESENTE", "AUSENTE", "TARDE"];

export function validarIdMateria(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) throw errorAsistencia(400, "Seleccioná una materia válida.");
  return id;
}

// Formato YYYY-MM-DD, sin hora: la asistencia es por día, no por instante.
// "Hoy" es la fecha de Argentina (la misma que usan los exámenes), no la del servidor ni la de UTC:
// de noche, UTC ya es el día siguiente y rechazaría la asistencia de hoy como si fuera futura.
export function validarFechaAsistencia(valor, ahora = new Date()) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw errorAsistencia(400, "La fecha debe tener el formato AAAA-MM-DD.");
  }
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) throw errorAsistencia(400, "La fecha no es válida.");

  if (fecha > hoy(ahora)) {
    throw errorAsistencia(400, "No podés asentar asistencia de una fecha futura.");
  }
  return fecha;
}

export function validarEstadoAsistencia(valor) {
  if (!ESTADOS_VALIDOS.includes(valor)) {
    throw errorAsistencia(400, `El estado debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}.`);
  }
  return valor;
}

export function validarAsistencia(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw errorAsistencia(400, "Faltan los datos de la asistencia.");
  }
  return {
    materiaId: validarIdMateria(body.materiaId),
    fecha: validarFechaAsistencia(body.fecha),
    estado: validarEstadoAsistencia(body.estado),
  };
}

// Porcentaje de clases presentes sobre el total asentado (tarde cuenta como presente).
export function calcularPresentismo(asistencias) {
  if (!asistencias.length) return null;
  const presentes = asistencias.filter((a) => a.estado === "PRESENTE" || a.estado === "TARDE").length;
  return Math.round((presentes / asistencias.length) * 1000) / 10;
}

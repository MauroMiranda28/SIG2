// El alumno reclama formalmente una evaluación si considera que hay un error
// de calificación. La validación vive acá, separada de la ruta, para poder
// probarla sin DB.

export function errorRevision(status, message) {
  return Object.assign(new Error(message), { status });
}

const LARGO_MOTIVO_MINIMO = 10;
const LARGO_MOTIVO_MAXIMO = 1000;

export function validarIdEvaluacion(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) throw errorRevision(400, "Seleccioná una evaluación válida.");
  return id;
}

export const ESTADOS_RESOLUCION = ["RESUELTA", "RECHAZADA"];
const LARGO_RESPUESTA_MINIMO = 5;
const LARGO_RESPUESTA_MAXIMO = 1000;

// Cuerpo de PATCH /api/revisiones/:id/resolver: cómo se resuelve y qué se le responde al alumno.
export function validarResolucion(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw errorRevision(400, "Faltan los datos de la resolución.");
  }
  if (!ESTADOS_RESOLUCION.includes(body.estado)) {
    throw errorRevision(400, "Indicá si la solicitud queda resuelta o rechazada.");
  }
  if (typeof body.respuesta !== "string" || !body.respuesta.trim()) {
    throw errorRevision(400, "Escribí una respuesta para el alumno.");
  }
  const respuesta = body.respuesta.trim().replace(/[ \t]+/g, " ");
  if (respuesta.length < LARGO_RESPUESTA_MINIMO) {
    throw errorRevision(400, `La respuesta debe tener al menos ${LARGO_RESPUESTA_MINIMO} caracteres.`);
  }
  if (respuesta.length > LARGO_RESPUESTA_MAXIMO) {
    throw errorRevision(400, `La respuesta puede tener hasta ${LARGO_RESPUESTA_MAXIMO} caracteres.`);
  }
  return { estado: body.estado, respuesta };
}

export function validarSolicitudRevision(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw errorRevision(400, "Faltan los datos de la solicitud.");
  }
  const evaluacionId = validarIdEvaluacion(body.evaluacionId);

  if (typeof body.motivo !== "string" || !body.motivo.trim()) {
    throw errorRevision(400, "Contanos el motivo de tu reclamo.");
  }
  const motivo = body.motivo.trim().replace(/\s+/g, " ");
  if (motivo.length < LARGO_MOTIVO_MINIMO) {
    throw errorRevision(400, `El motivo debe tener al menos ${LARGO_MOTIVO_MINIMO} caracteres.`);
  }
  if (motivo.length > LARGO_MOTIVO_MAXIMO) {
    throw errorRevision(400, `El motivo puede tener hasta ${LARGO_MOTIVO_MAXIMO} caracteres.`);
  }

  return { evaluacionId, motivo };
}

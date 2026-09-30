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

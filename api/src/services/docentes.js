// Acceso de docentes a sus materias (Seg-05: acceso restringido a materias asignadas).
// Un DOCENTE solo puede modificar horarios y material de las materias que dicta
// (tabla MateriaDocente). ADMIN puede operar sobre cualquiera.

export function errorAcceso(status, message) {
  return Object.assign(new Error(message), { status });
}

export function validarId(valor, nombre = "identificador") {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw errorAcceso(400, `El ${nombre} no es válido.`);
  return id;
}

// Devuelve la materia si el usuario puede modificarla; si no, lanza 404 o 403.
export async function verificarAccesoMateria(db, usuario, materiaId) {
  const materia = await db.materia.findUnique({ where: { id: materiaId }, select: { id: true, nombre: true, codigo: true } });
  if (!materia) throw errorAcceso(404, "La materia no existe.");

  if (usuario?.rol === "ADMIN") return materia;
  if (usuario?.rol === "DOCENTE") {
    const asignacion = await db.materiaDocente.findUnique({
      where: { materiaId_docenteId: { materiaId, docenteId: usuario.id } },
      select: { materiaId: true },
    });
    if (asignacion) return materia;
    throw errorAcceso(403, "Solo podés modificar las materias que tenés asignadas.");
  }
  throw errorAcceso(403, "No tenés permiso para esto");
}

// Middleware: obtenerMateriaId(req, db) resuelve a qué materia apunta el pedido
// (directo por parámetro, o a través de la comisión / el bloque).
export function requiereMateriaAsignada(db, obtenerMateriaId) {
  return async (req, res, next) => {
    try {
      const materiaId = await obtenerMateriaId(req, db);
      req.materia = await verificarAccesoMateria(db, req.usuario, materiaId);
      next();
    } catch (e) { next(e); }
  };
}

// ---------- Bloques horarios ----------

export const DIAS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validarBloqueHorario(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw errorAcceso(400, "Faltan los datos del horario.");
  const { comisionId, dia, horaInicio, horaFin, aulaId } = body;
  const datos = {
    comisionId: validarId(comisionId, "identificador de la comisión"),
    dia,
    horaInicio,
    horaFin,
    aulaId: aulaId == null || aulaId === "" ? null : validarId(aulaId, "identificador del aula"),
  };
  if (!DIAS.includes(dia)) throw errorAcceso(400, "Elegí un día válido, de lunes a sábado.");
  if (typeof horaInicio !== "string" || !HORA.test(horaInicio)) throw errorAcceso(400, "La hora de inicio debe tener el formato HH:MM.");
  if (typeof horaFin !== "string" || !HORA.test(horaFin)) throw errorAcceso(400, "La hora de fin debe tener el formato HH:MM.");
  if (horaInicio >= horaFin) throw errorAcceso(400, "La hora de fin tiene que ser posterior a la de inicio.");
  return datos;
}

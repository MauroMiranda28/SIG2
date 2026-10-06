// Correlatividades: qué materias hay que tener regulares (débil) o aprobadas (fuerte)
// para poder cursar otra. La validación y las reglas viven acá para probarlas sin DB.

import { errorAcceso, validarId } from "./docentes.js";
import { regularidadVigente } from "./notas.js";
import { resolverPlanAlumno } from "./planes.js";

export const TIPOS_CORRELATIVIDAD = ["DEBIL", "FUERTE"];

const esObjeto = (v) => v != null && typeof v === "object" && !Array.isArray(v);

export function validarTipoCorrelatividad(tipo) {
  if (!TIPOS_CORRELATIVIDAD.includes(tipo)) throw errorAcceso(400, "Elegí si la correlatividad es débil o fuerte.");
  return tipo;
}

// Cuerpo de POST /api/correlatividades.
export function validarCorrelatividad(body) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos de la correlatividad.");
  const materiaId = validarId(body.materiaId, "identificador de la materia");
  const requiereId = validarId(body.requiereId, "identificador de la materia correlativa");
  if (materiaId === requiereId) throw errorAcceso(400, "Una materia no puede ser correlativa de sí misma.");
  return { materiaId, requiereId, tipo: validarTipoCorrelatividad(body.tipo) };
}

// Cómo tiene el alumno la materia requerida: APROBADA, REGULAR (vigente) o FALTA.
export function situacionRequisito(cursada, ahora = new Date()) {
  if (cursada?.estado === "APROBADA") return "APROBADA";
  if (regularidadVigente(cursada, ahora)) return "REGULAR";
  return "FALTA";
}

// Fuerte: la requerida tiene que estar aprobada. Débil: alcanza con regular (o aprobada).
export function cumpleRequisito(tipo, situacion) {
  return situacion === "APROBADA" || (tipo === "DEBIL" && situacion === "REGULAR");
}

// ¿Agregar "materiaId requiere requiereId" arma un ciclo? Pasa si requiereId ya necesita,
// directa o indirectamente, a materiaId (A → B → A). Se recorre la cadena de requisitos.
export async function generaCiclo(db, materiaId, requiereId) {
  const vistas = new Set([requiereId]);
  let frontera = [requiereId];
  while (frontera.length) {
    const siguientes = await db.correlatividad.findMany({ where: { materiaId: { in: frontera } }, select: { requiereId: true } });
    frontera = [];
    for (const { requiereId: id } of siguientes) {
      if (id === materiaId) return true;
      if (!vistas.has(id)) { vistas.add(id); frontera.push(id); }
    }
  }
  return false;
}

// Materias del plan del alumno con sus correlativas y si las cumple.
export async function correlatividadesDelAlumno(db, alumnoId, ahora = new Date()) {
  const planId = await resolverPlanAlumno(db, alumnoId);
  const materias = await db.materia.findMany({
    where: { planId },
    select: {
      id: true, nombre: true, codigo: true, anio: true, cuatrimestre: true,
      requiere: { select: { tipo: true, requiere: { select: { id: true, nombre: true, codigo: true } } } },
      cursadas: { where: { alumnoId }, select: { estado: true, regularDesde: true } },
    },
    orderBy: [{ anio: "asc" }, { cuatrimestre: "asc" }, { nombre: "asc" }],
  });

  // Las requeridas son del mismo plan, así que su cursada ya vino en la misma consulta.
  const cursadaDe = new Map(materias.map((m) => [m.id, m.cursadas[0]]));
  return materias.map(({ requiere, cursadas, ...materia }) => {
    const requisitos = requiere
      .map(({ tipo, requiere: requerida }) => {
        const situacion = situacionRequisito(cursadaDe.get(requerida.id), ahora);
        return { tipo, materia: requerida, situacion, cumple: cumpleRequisito(tipo, situacion) };
      })
      // Primero las fuertes, después las débiles; dentro de cada tipo, por nombre.
      .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "FUERTE" ? -1 : 1) || a.materia.nombre.localeCompare(b.materia.nombre));
    return {
      ...materia,
      estado: cursadas[0]?.estado ?? "PENDIENTE",
      requisitos,
      puedeCursar: requisitos.every((r) => r.cumple),
    };
  });
}

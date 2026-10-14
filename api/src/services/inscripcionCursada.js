// Inscripción a una materia para cursarla. Si la materia tiene comisiones, el alumno
// tiene que elegir una; si no tiene, se inscribe directamente. Las reglas viven acá,
// separadas de la ruta, para probarlas sin DB.

import { errorAcceso, validarId } from "./docentes.js";
import { regularidadVigente, vencimientoRegularidad } from "./notas.js";
import { situacionRequisito, cumpleRequisito } from "./correlatividades.js";
import { resolverPlanAlumno } from "./planes.js";

const esObjeto = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const formatoFecha = (fecha) => new Date(fecha).toLocaleDateString("es-AR", { timeZone: "UTC" });
const NOMBRE_DIA = { LUNES: "lunes", MARTES: "martes", MIERCOLES: "miércoles", JUEVES: "jueves", VIERNES: "viernes", SABADO: "sábado" };

// Cuerpo de POST /api/inscripciones-cursada.
export function validarInscripcionCursada(body) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos de la inscripción.");
  const materiaId = validarId(body.materiaId, "identificador de la materia");
  const comisionId = body.comisionId == null || body.comisionId === "" ? null : validarId(body.comisionId, "identificador de la comisión");
  return { materiaId, comisionId };
}

// Por qué el alumno no puede inscribirse (o null si puede). `requisitos` ya trae si cumple cada correlativa.
// Libre o con la regularidad vencida sí puede: es justamente volver a inscribirse para recursar.
export function motivoNoPuedeInscribirse(cursada, requisitos, ahora = new Date()) {
  if (cursada?.estado === "APROBADA") return "Ya aprobaste esta materia.";
  if (cursada?.estado === "EN_CURSO") return "Ya estás inscripto a esta materia.";
  if (regularidadVigente(cursada, ahora)) {
    return `Ya la regularizaste: te queda rendir el final (la regularidad vence el ${formatoFecha(vencimientoRegularidad(cursada.regularDesde))}).`;
  }
  const faltan = requisitos.filter((r) => !r.cumple);
  if (faltan.length) {
    const lista = faltan.map((r) => `${r.materia.nombre} (${r.tipo === "FUERTE" ? "aprobada" : "regular"})`).join(", ");
    return `Te faltan correlativas: ${lista}.`;
  }
  return null;
}

// Dos bloques se pisan si caen el mismo día y sus rangos horarios se cruzan ("HH:MM" compara bien como texto).
export const seSuperponen = (a, b) => a.dia === b.dia && a.horaInicio < b.horaFin && a.horaFin > b.horaInicio;

// Mensaje si algún bloque de la comisión se pisa con las comisiones que el alumno ya cursa (o null).
export function choqueDeHorario(bloques, otrasComisiones) {
  for (const otra of otrasComisiones) {
    for (const existente of otra.bloques) {
      const choque = bloques.find((b) => seSuperponen(b, existente));
      if (choque) {
        return `Se superpone con ${otra.materia.nombre} (${otra.nombre}) el ${NOMBRE_DIA[choque.dia]} de ${existente.horaInicio} a ${existente.horaFin}.`;
      }
    }
  }
  return null;
}

const DATOS_COMISION = {
  id: true, nombre: true,
  bloques: { select: { dia: true, horaInicio: true, horaFin: true, aula: { select: { nombre: true } } }, orderBy: [{ dia: "asc" }, { horaInicio: "asc" }] },
};

// Todo lo que necesita la pantalla para inscribirse a una materia: si puede, por qué no,
// sus correlativas y sus comisiones (cada una con su choque de horario, si lo hay).
export async function opcionesDeInscripcion(db, alumnoId, materiaId, ahora = new Date()) {
  const planId = await resolverPlanAlumno(db, alumnoId);
  const materia = await db.materia.findUnique({
    where: { id: materiaId },
    select: {
      id: true, nombre: true, codigo: true, planId: true,
      requiere: { select: { tipo: true, requiere: { select: { id: true, nombre: true, codigo: true } } } },
      comisiones: { select: DATOS_COMISION, orderBy: { nombre: "asc" } },
      cursadas: { where: { alumnoId }, select: { id: true, estado: true, regularDesde: true } },
    },
  });
  if (!materia || materia.planId !== planId) throw errorAcceso(404, "Esa materia no está en tu plan de estudios.");

  // Cómo tiene el alumno cada correlativa.
  const requeridas = materia.requiere.map((r) => r.requiere.id);
  const cursadasRequeridas = requeridas.length
    ? await db.cursada.findMany({ where: { alumnoId, materiaId: { in: requeridas } }, select: { materiaId: true, estado: true, regularDesde: true } })
    : [];
  const cursadaDe = new Map(cursadasRequeridas.map((c) => [c.materiaId, c]));
  const requisitos = materia.requiere.map(({ tipo, requiere }) => {
    const situacion = situacionRequisito(cursadaDe.get(requiere.id), ahora);
    return { tipo, materia: requiere, situacion, cumple: cumpleRequisito(tipo, situacion) };
  });

  // Comisiones que ya cursa en otras materias, para avisar choques de horario.
  const otras = materia.comisiones.length
    ? await db.inscripcionComision.findMany({
      where: { alumnoId, comision: { materiaId: { not: materiaId } } },
      select: { comision: { select: { nombre: true, materia: { select: { nombre: true } }, bloques: { select: { dia: true, horaInicio: true, horaFin: true } } } } },
    })
    : [];
  const otrasComisiones = otras.map((i) => i.comision);

  const cursada = materia.cursadas[0] ?? null;
  const motivo = motivoNoPuedeInscribirse(cursada, requisitos, ahora);
  return {
    materia: { id: materia.id, nombre: materia.nombre, codigo: materia.codigo },
    cursada,
    puedeInscribirse: motivo === null,
    motivo,
    requisitos,
    requiereComision: materia.comisiones.length > 0,
    comisiones: materia.comisiones.map((c) => ({ ...c, choque: choqueDeHorario(c.bloques, otrasComisiones) })),
  };
}

// Inscribe al alumno: la cursada queda EN_CURSO (si había quedado libre, se reabre) y, si
// eligió comisión, reemplaza la que tuviera en esa materia. Todo en una transacción.
export async function inscribirACursar(db, alumnoId, { materiaId, comisionId }, ahora = new Date()) {
  const opciones = await opcionesDeInscripcion(db, alumnoId, materiaId, ahora);
  if (!opciones.puedeInscribirse) throw errorAcceso(opciones.cursada?.estado === "EN_CURSO" ? 409 : 400, opciones.motivo);

  let comision = null;
  if (opciones.requiereComision) {
    if (!comisionId) throw errorAcceso(400, "Esta materia tiene comisiones: elegí con cuál vas a cursar.");
    comision = opciones.comisiones.find((c) => c.id === comisionId);
    if (!comision) throw errorAcceso(400, "Esa comisión no es de esta materia.");
    if (comision.choque) throw errorAcceso(409, comision.choque);
  } else if (comisionId) {
    throw errorAcceso(400, "Esta materia no tiene comisiones: no hace falta elegir una.");
  }

  return db.$transaction(async (tx) => {
    // Recursa (estaba libre o se le venció la regularidad): arranca de cero. Las evaluaciones que ya
    // tenía quedan en el historial, pero no cuentan para el estado de la cursada nueva.
    const ultima = opciones.cursada
      ? await tx.evaluacion.findFirst({ where: { cursadaId: opciones.cursada.id }, orderBy: { id: "desc" }, select: { id: true } })
      : null;
    const cursada = await tx.cursada.upsert({
      where: { alumnoId_materiaId: { alumnoId, materiaId } },
      create: { alumnoId, materiaId, estado: "EN_CURSO" },
      update: { estado: "EN_CURSO", nota: null, regularDesde: null, intentosFinal: 0, evaluacionesDesdeId: ultima?.id ?? 0 },
      select: { id: true, estado: true },
    });
    await tx.inscripcionComision.deleteMany({ where: { alumnoId, comision: { materiaId } } });
    if (comision) await tx.inscripcionComision.create({ data: { alumnoId, comisionId: comision.id } });
    return { materia: opciones.materia, cursada, comision: comision ? { id: comision.id, nombre: comision.nombre } : null };
  });
}

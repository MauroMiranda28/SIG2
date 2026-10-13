// Parciales, recuperatorios y trabajos prácticos que el alumno tiene por delante, con fecha y horario.
// Los parciales y recuperatorios salen de las fechas de examen que programa el docente (FechaExamen);
// los trabajos prácticos, de las tareas con fecha de entrega (Tarea).

import { hoy } from "./examenes.js";

// Ya cerró la cursada: no rinde parciales ni entrega TPs de esa materia.
const CURSADA_CERRADA = ["APROBADA", "REGULAR", "LIBRE"];

// Materias que el alumno está cursando: cursada EN_CURSO, o eligió una comisión
// y todavía no cerró la cursada (aprobada, regular o libre).
export async function materiasQueCursa(db, alumnoId) {
  const [cursadas, inscripciones] = await Promise.all([
    db.cursada.findMany({ where: { alumnoId }, select: { materiaId: true, estado: true } }),
    db.inscripcionComision.findMany({ where: { alumnoId }, select: { comision: { select: { materiaId: true } } } }),
  ]);
  const cerradas = new Set(cursadas.filter((c) => CURSADA_CERRADA.includes(c.estado)).map((c) => c.materiaId));
  const ids = new Set(cursadas.filter((c) => c.estado === "EN_CURSO").map((c) => c.materiaId));
  for (const { comision } of inscripciones) if (!cerradas.has(comision.materiaId)) ids.add(comision.materiaId);
  return [...ids];
}

const MATERIA = { select: { id: true, nombre: true, codigo: true } };

// Ordena por fecha y, dentro del mismo día, por hora (las que no tienen hora van al final).
const clave = (item) => `${new Date(item.fecha).toISOString().slice(0, 10)} ${item.hora ?? "99:99"}`;

export async function proximasEvaluaciones(db, alumnoId, ahora = new Date()) {
  const materiaIds = await materiasQueCursa(db, alumnoId);
  if (!materiaIds.length) return [];
  const desde = hoy(ahora);

  const [examenes, tareas] = await Promise.all([
    db.fechaExamen.findMany({
      where: { materiaId: { in: materiaIds }, tipo: { in: ["PARCIAL", "RECUPERATORIO"] }, fecha: { gte: desde } },
      select: { id: true, tipo: true, fecha: true, hora: true, aula: { select: { id: true, nombre: true } }, materia: MATERIA },
    }),
    db.tarea.findMany({
      where: { materiaId: { in: materiaIds }, fechaEntrega: { gte: desde } },
      select: { id: true, titulo: true, descripcion: true, fechaEntrega: true, horaEntrega: true, materia: MATERIA },
    }),
  ]);

  return [
    ...examenes.map((e) => ({ clave: `examen-${e.id}`, tipo: e.tipo, fecha: e.fecha, hora: e.hora, aula: e.aula, materia: e.materia })),
    ...tareas.map((t) => ({
      clave: `tarea-${t.id}`, tipo: "TRABAJO_PRACTICO", fecha: t.fechaEntrega, hora: t.horaEntrega,
      titulo: t.titulo, descripcion: t.descripcion, materia: t.materia,
    })),
  ].sort((a, b) => clave(a).localeCompare(clave(b)) || a.materia.nombre.localeCompare(b.materia.nombre));
}

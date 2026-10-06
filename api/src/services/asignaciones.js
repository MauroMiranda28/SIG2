// Asignación de docentes a materias (tabla MateriaDocente). Es lo que habilita a un DOCENTE a cargar
// horarios, notas, avisos, fechas de examen y tareas de una materia (Seg-05). La validación y el
// armado de las respuestas viven acá, separados de la ruta, para probarlos sin DB.

import { errorAcceso, validarId } from "./docentes.js";

const esObjeto = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// Cuerpo de POST /api/asignaciones: la materia y el docente a asignar.
export function validarAsignacion(body) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos de la asignación.");
  return {
    materiaId: validarId(body.materiaId, "identificador de la materia"),
    docenteId: validarId(body.docenteId, "identificador del docente"),
  };
}

export const DATOS_DOCENTE = { id: true, nombre: true, apellido: true, email: true };

export const DATOS_MATERIA = {
  id: true, nombre: true, codigo: true, anio: true,
  plan: { select: { id: true, nombre: true, carrera: { select: { nombre: true, codigo: true } } } },
  docentes: { select: { docente: { select: DATOS_DOCENTE } } },
};

const porApellido = (a, b) => a.apellido.localeCompare(b.apellido, "es") || a.nombre.localeCompare(b.nombre, "es");

// Materia con sus docentes en una lista plana, ordenados por apellido.
export function aplanarMateria({ docentes, ...materia }) {
  return { ...materia, docentes: docentes.map((d) => d.docente).sort(porApellido) };
}

// Docente con las materias que dicta en una lista plana, ordenadas por nombre.
export function aplanarDocente({ materiasQueDicta, ...docente }) {
  return { ...docente, materias: materiasQueDicta.map((m) => m.materia).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) };
}

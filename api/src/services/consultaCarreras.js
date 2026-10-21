// Consulta de carreras por parte del docente: la estructura académica de la universidad
// (carreras, sus planes y las materias de cada plan). Es de solo lectura y no incluye datos
// de alumnos. El armado de las respuestas vive acá, separado de la ruta, para probarlo sin DB.

import { ordenarMaterias } from "./consultaMaterias.js";

// Listado: lo necesario para recorrer las carreras. `docenteId` marca dónde dicta materias.
export const datosListadoCarreras = (docenteId) => ({
  id: true, nombre: true, codigo: true, descripcion: true, vigente: true,
  planes: {
    select: {
      vigente: true,
      materias: { select: { id: true, docentes: { where: { docenteId }, select: { docenteId: true } } } },
    },
  },
});

// Vigentes primero; dentro de cada grupo, por nombre.
const porVigenciaYNombre = (a, b) => Number(b.vigente) - Number(a.vigente) || a.nombre.localeCompare(b.nombre, "es");

export function armarListadoCarreras(carreras) {
  return carreras
    .map(({ planes, ...carrera }) => {
      const materias = planes.flatMap((p) => p.materias);
      return {
        ...carrera,
        planes: planes.length,
        planesVigentes: planes.filter((p) => p.vigente).length,
        materias: materias.length,
        dictoMaterias: materias.filter((m) => m.docentes.length > 0).length,
      };
    })
    .sort(porVigenciaYNombre);
}

// Detalle: la carrera con cada plan y sus materias (con sus correlativas).
export const datosDetalleCarrera = (docenteId) => ({
  id: true, nombre: true, codigo: true, descripcion: true, vigente: true,
  planes: {
    select: {
      id: true, nombre: true, anio: true, vigente: true,
      materias: {
        select: {
          id: true, nombre: true, codigo: true, anio: true, cuatrimestre: true, cargaHoraria: true,
          docentes: { select: { docenteId: true, docente: { select: { nombre: true, apellido: true } } } },
          requiere: { select: { tipo: true, requiere: { select: { id: true, nombre: true, codigo: true } } } },
        },
      },
    },
  },
});

// Planes vigentes primero y, dentro de cada grupo, del más nuevo al más viejo.
const porVigenciaYAnio = (a, b) => Number(b.vigente) - Number(a.vigente) || b.anio - a.anio || b.id - a.id;

function armarMateria({ docentes, requiere, ...materia }, docenteId) {
  return {
    ...materia,
    docentes: docentes.map((d) => d.docente),
    laDicto: docentes.some((d) => d.docenteId === docenteId),
    // Primero las fuertes y, dentro de cada tipo, por nombre.
    correlativas: requiere
      .map(({ tipo, requiere: materiaRequerida }) => ({ tipo, materia: materiaRequerida }))
      .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "FUERTE" ? -1 : 1) || a.materia.nombre.localeCompare(b.materia.nombre, "es")),
  };
}

export function armarDetalleCarrera({ planes, ...carrera }, docenteId) {
  return {
    ...carrera,
    planes: [...planes].sort(porVigenciaYAnio).map(({ materias, ...plan }) => {
      const ordenadas = ordenarMaterias(materias.map((m) => armarMateria(m, docenteId)));
      return {
        ...plan,
        materias: ordenadas,
        totales: {
          materias: ordenadas.length,
          anios: new Set(ordenadas.map((m) => m.anio)).size,
          cargaHoraria: ordenadas.reduce((suma, m) => suma + (m.cargaHoraria ?? 0), 0),
        },
      };
    }),
  };
}

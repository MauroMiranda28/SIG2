// Consulta de materias por parte del docente: información académica y materias
// relacionadas (correlatividades dentro del plan). El armado de las respuestas
// vive acá, separado de la ruta, para poder probarlo sin DB.

const BLOQUES = {
  select: { id: true, dia: true, horaInicio: true, horaFin: true, aula: { select: { id: true, nombre: true } } },
  orderBy: [{ dia: "asc" }, { horaInicio: "asc" }],
};

// Datos de una materia relacionada; "laDicto" sale de si el docente consultante figura entre sus docentes.
export const datosMateriaRelacionada = (docenteId) => ({
  id: true, nombre: true, codigo: true, anio: true, cuatrimestre: true, cargaHoraria: true,
  docentes: { where: { docenteId }, select: { docenteId: true } },
});

// Información académica completa. No incluye correo ni teléfono de los docentes.
export const DATOS_INFO_MATERIA = {
  id: true, nombre: true, codigo: true, anio: true, cuatrimestre: true, cargaHoraria: true, descripcion: true,
  programaUrl: true,
  programa: { select: { contenidos: true, bibliografia: true, version: true, vigente: true, actualizadoEn: true } },
  plan: { select: { id: true, nombre: true, anio: true, vigente: true, carrera: { select: { nombre: true, codigo: true } } } },
  docentes: { select: { docente: { select: { id: true, nombre: true, apellido: true } } } },
  comisiones: { select: { id: true, nombre: true, bloques: BLOQUES }, orderBy: { nombre: "asc" } },
};

// Año, cuatrimestre (sin cuatrimestre al final) y nombre.
export function ordenarMaterias(materias) {
  return [...materias].sort((a, b) =>
    a.anio - b.anio
    || (a.cuatrimestre ?? 99) - (b.cuatrimestre ?? 99)
    || a.nombre.localeCompare(b.nombre, "es"));
}

function aMateriaRelacionada({ docentes, ...materia }) {
  return { ...materia, laDicto: docentes.length > 0 };
}

// previas: materias que hay que tener antes de cursar la consultada.
// posteriores: materias que exigen la consultada como correlativa.
export function armarRelacionadas({ requiere, requeridaPor }) {
  return {
    previas: ordenarMaterias(requiere.map((c) => aMateriaRelacionada(c.requiere))),
    posteriores: ordenarMaterias(requeridaPor.map((c) => aMateriaRelacionada(c.materia))),
  };
}

export function armarInfoMateria({ programaUrl, programa, docentes, ...materia }, usuario) {
  const esMia = docentes.some((d) => d.docente.id === usuario.id);
  return {
    ...materia,
    docentes: docentes.map((d) => d.docente),
    // Solo se muestra el programa en texto si está vigente, igual que para el alumno.
    programa: programa?.vigente ? { contenidos: programa.contenidos, bibliografia: programa.bibliografia, version: programa.version, actualizadoEn: programa.actualizadoEn } : null,
    tienePdf: Boolean(programaUrl), // no se expone el nombre del archivo en el servidor
    esMia,
    puedeModificar: esMia || usuario.rol === "ADMIN",
  };
}

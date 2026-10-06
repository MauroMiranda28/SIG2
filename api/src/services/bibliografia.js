// Bibliografía recomendada de las materias del plan del alumno.
// Sale del programa vigente de cada materia (Programa.bibliografia, texto libre).

import { resolverPlanAlumno } from "./planes.js";

// El texto se carga libre: una obra por renglón, a veces con viñetas o numeración
// ("- ", "• ", "1. ", "2) "). Se devuelve una lista limpia, sin renglones vacíos.
export function separarBibliografia(texto) {
  if (typeof texto !== "string") return [];
  return texto
    .split(/\r?\n/)
    .map((linea) => linea.replace(/^\s*(?:[-*•·]|\d{1,3}[.)])\s+/, "").trim())
    .filter(Boolean);
}

export async function bibliografiaDelAlumno(db, alumnoId) {
  const planId = await resolverPlanAlumno(db, alumnoId);
  const materias = await db.materia.findMany({
    where: { planId },
    select: {
      id: true, nombre: true, codigo: true, anio: true, cuatrimestre: true,
      programa: { select: { bibliografia: true, vigente: true, version: true, actualizadoEn: true } },
    },
    orderBy: [{ anio: "asc" }, { cuatrimestre: "asc" }, { nombre: "asc" }],
  });

  // Todas las materias del plan: las que no tienen bibliografía publicada van con la lista vacía,
  // así el alumno sabe que todavía no está cargada (y no que la materia no existe).
  return materias.map(({ programa, ...materia }) => {
    const publicada = programa?.vigente ? programa : null;
    return {
      ...materia,
      bibliografia: separarBibliografia(publicada?.bibliografia),
      actualizadoEn: publicada?.actualizadoEn ?? null,
    };
  });
}

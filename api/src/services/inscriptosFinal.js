// Cuántos inscriptos tiene cada final, separados en regulares y libres.
// El alumno ve solo los números; el docente de la materia ve además quiénes son.

export function resumenInscriptos(modalidades) {
  const regulares = modalidades.filter((m) => m === "REGULAR").length;
  const libres = modalidades.filter((m) => m === "LIBRE").length;
  return { total: regulares + libres, regulares, libres };
}

// Map examenId → { total, regulares, libres } (los que no tienen inscriptos van en cero).
export async function contarInscriptos(db, examenIds) {
  const conteo = new Map(examenIds.map((id) => [id, []]));
  if (!examenIds.length) return new Map();
  const grupos = await db.inscripcionExamen.groupBy({
    by: ["examenId", "modalidad"], where: { examenId: { in: examenIds } }, _count: { _all: true },
  });
  for (const g of grupos) conteo.get(g.examenId)?.push(...Array(g._count._all).fill(g.modalidad));
  return new Map([...conteo].map(([id, modalidades]) => [id, resumenInscriptos(modalidades)]));
}

// Para el docente: los inscriptos de cada final de la materia, con la modalidad de cada uno.
// Map examenId → { total, regulares, libres, alumnos: [{ id, nombre, apellido, email, modalidad }] }.
export async function inscriptosPorFinal(db, examenIds) {
  if (!examenIds.length) return new Map();
  const inscripciones = await db.inscripcionExamen.findMany({
    where: { examenId: { in: examenIds } },
    select: { examenId: true, modalidad: true, alumno: { select: { id: true, nombre: true, apellido: true, email: true } } },
    orderBy: [{ alumno: { apellido: "asc" } }, { alumno: { nombre: "asc" } }],
  });
  return new Map(examenIds.map((id) => {
    const delFinal = inscripciones.filter((i) => i.examenId === id);
    return [id, {
      ...resumenInscriptos(delFinal.map((i) => i.modalidad)),
      alumnos: delFinal.map(({ alumno, modalidad }) => ({ ...alumno, modalidad })),
    }];
  }));
}

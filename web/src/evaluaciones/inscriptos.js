// Texto de los inscriptos a un final (lo usan el alumno y el docente).
// "12 inscriptos: 8 regulares y 4 libres"
export function textoInscriptos(inscriptos) {
  if (!inscriptos?.total) return "Todavía no hay inscriptos.";
  const { total, regulares, libres } = inscriptos;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  return `${plural(total, "inscripto", "inscriptos")}: ${plural(regulares, "regular", "regulares")} y ${plural(libres, "libre", "libres")}`;
}

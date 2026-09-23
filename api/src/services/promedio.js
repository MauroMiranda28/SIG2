// Simulación de promedio: cómo cambiaría el promedio final del alumno si
// aprobara una materia pendiente con una nota hipotética.
// La validación y el cálculo viven acá, separados de la ruta, para poder probarlos sin DB.

export function errorPromedio(status, message) {
  return Object.assign(new Error(message), { status });
}

const NOTA_MINIMA = 0;
const NOTA_MAXIMA = 10;

// Promedio de una lista de notas, redondeado a 2 decimales. null si la lista está vacía.
export function calcularPromedio(notas) {
  if (!notas.length) return null;
  const suma = notas.reduce((acc, nota) => acc + nota, 0);
  return Math.round((suma / notas.length) * 100) / 100;
}

export function validarNotaSimulada(valor) {
  if (valor === null || valor === undefined || valor === "") {
    throw errorPromedio(400, "La nota simulada es obligatoria.");
  }
  const nota = Number(valor);
  if (!Number.isFinite(nota)) throw errorPromedio(400, "La nota simulada debe ser un número.");
  if (nota < NOTA_MINIMA || nota > NOTA_MAXIMA) {
    throw errorPromedio(400, `La nota simulada debe estar entre ${NOTA_MINIMA} y ${NOTA_MAXIMA}.`);
  }
  return Math.round(nota * 100) / 100;
}

export function validarMateriaId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) throw errorPromedio(400, "Seleccioná una materia válida.");
  return id;
}

// notasAprobadas: notas actuales del alumno en materias que ya aprobó.
// notaSimulada: la nota hipotética de la materia pendiente que se quiere simular.
export function simularPromedio(notasAprobadas, notaSimulada) {
  const promedioActual = calcularPromedio(notasAprobadas);
  const promedioSimulado = calcularPromedio([...notasAprobadas, notaSimulada]);
  const diferencia = promedioActual === null ? null : Math.round((promedioSimulado - promedioActual) * 100) / 100;
  return { promedioActual, promedioSimulado, diferencia };
}

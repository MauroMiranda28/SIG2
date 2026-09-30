// Carga y corrección de notas por parte del docente.
// La validación vive acá, separada de la ruta, para poder probarla sin DB.

import { errorAcceso, validarId } from "./docentes.js";

export const TIPOS_EVALUACION = ["PARCIAL", "RECUPERATORIO", "FINAL", "TRABAJO_PRACTICO"];
export const NOTA_MINIMA = 0;
export const NOTA_MAXIMA = 10;
const MAX_NOTAS_POR_CARGA = 500;
const LARGO_OBSERVACIONES_MAXIMO = 500;
const LARGO_MOTIVO_MINIMO = 5;
const LARGO_MOTIVO_MAXIMO = 500;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const esObjeto = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const limpiar = (texto) => texto.trim().replace(/\s+/g, " ");

// Nota entre 0 y 10, con hasta dos decimales (ej. 7.5 o 6.25).
export function validarNota(valor) {
  const nota = typeof valor === "string" && valor.trim() ? Number(valor.replace(",", ".")) : valor;
  if (typeof nota !== "number" || !Number.isFinite(nota) || nota < NOTA_MINIMA || nota > NOTA_MAXIMA) {
    throw errorAcceso(400, `La nota tiene que ser un número entre ${NOTA_MINIMA} y ${NOTA_MAXIMA}.`);
  }
  if (Math.abs(Math.round(nota * 100) - nota * 100) > 1e-6) {
    throw errorAcceso(400, "La nota puede tener hasta dos decimales.");
  }
  return Math.round(nota * 100) / 100;
}

// Fecha de calendario "AAAA-MM-DD"; se guarda como medianoche UTC (ver web/src/formatFecha.js).
export function validarFecha(valor) {
  if (typeof valor !== "string" || !FECHA.test(valor)) throw errorAcceso(400, "La fecha tiene que tener el formato AAAA-MM-DD.");
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) throw errorAcceso(400, "La fecha no es válida.");
  return fecha;
}

// Cuerpo de POST /api/notas/materias/:id: una evaluación (tipo + fecha) con la nota de cada alumno.
export function validarCargaNotas(body) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos de la evaluación.");
  const { tipo, fecha, notas } = body;
  if (!TIPOS_EVALUACION.includes(tipo)) throw errorAcceso(400, "Elegí un tipo de evaluación válido.");
  const fechaValida = validarFecha(fecha);
  if (!Array.isArray(notas) || !notas.length) throw errorAcceso(400, "Cargá la nota de al menos un alumno.");
  if (notas.length > MAX_NOTAS_POR_CARGA) throw errorAcceso(400, `Se pueden cargar hasta ${MAX_NOTAS_POR_CARGA} notas por vez.`);

  const vistos = new Set();
  const normalizadas = notas.map((item) => {
    if (!esObjeto(item)) throw errorAcceso(400, "Hay una nota con datos incompletos.");
    const alumnoId = validarId(item.alumnoId, "identificador del alumno");
    if (vistos.has(alumnoId)) throw errorAcceso(400, "Hay un alumno repetido en la carga.");
    vistos.add(alumnoId);

    let observaciones = null;
    if (item.observaciones != null && item.observaciones !== "") {
      if (typeof item.observaciones !== "string") throw errorAcceso(400, "Las observaciones tienen que ser texto.");
      observaciones = limpiar(item.observaciones) || null;
      if (observaciones && observaciones.length > LARGO_OBSERVACIONES_MAXIMO) {
        throw errorAcceso(400, `Las observaciones pueden tener hasta ${LARGO_OBSERVACIONES_MAXIMO} caracteres.`);
      }
    }
    return { alumnoId, nota: validarNota(item.nota), observaciones };
  });

  return { tipo, fecha: fechaValida, notas: normalizadas };
}

// Cuerpo de PATCH /api/notas/evaluaciones/:id: la nota nueva y por qué se corrige.
export function validarCorreccionNota(body) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos de la corrección.");
  const nota = validarNota(body.nota);
  if (typeof body.motivo !== "string" || !body.motivo.trim()) throw errorAcceso(400, "Indicá el motivo de la corrección.");
  const motivo = limpiar(body.motivo);
  if (motivo.length < LARGO_MOTIVO_MINIMO) throw errorAcceso(400, `El motivo debe tener al menos ${LARGO_MOTIVO_MINIMO} caracteres.`);
  if (motivo.length > LARGO_MOTIVO_MAXIMO) throw errorAcceso(400, `El motivo puede tener hasta ${LARGO_MOTIVO_MAXIMO} caracteres.`);
  return { nota, motivo };
}

// Alumnos de una materia: los que tienen cursada en ella o eligieron alguna de sus comisiones.
export function filtroAlumnosDeMateria(materiaId) {
  return {
    rol: "ALUMNO",
    OR: [
      { cursadas: { some: { materiaId } } },
      { inscripciones: { some: { comision: { materiaId } } } },
    ],
  };
}

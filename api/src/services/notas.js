// Carga y corrección de notas por parte del docente.
// La validación vive acá, separada de la ruta, para poder probarla sin DB.

import { errorAcceso, validarId } from "./docentes.js";

export const TIPOS_EVALUACION = ["PARCIAL", "RECUPERATORIO", "TRABAJO_PRACTICO", "CONDICION_FINAL", "FINAL"];
export const CONDICIONES = ["REGULAR", "PROMOCIONADO"];
export const NOTA_MINIMA = 0;
export const NOTA_MAXIMA = 10;
export const MAX_INTENTOS_FINAL = 3; // desaprobado el tercero, pierde la regularidad
export const ANIOS_REGULARIDAD = 2; // plazo para aprobar el final desde que regulariza
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
    let condicion = null;
    if (tipo === "CONDICION_FINAL") {
      if (!CONDICIONES.includes(item.condicion)) throw errorAcceso(400, "Elegí si cada alumno quedó regular o promocionado.");
      condicion = item.condicion;
    }
    return { alumnoId, nota: validarNota(item.nota), observaciones, condicion };
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

// ---------- Condición de la materia (la define el docente) ----------

// Cuerpo de PUT /api/docentes/materias/:id/condicion.
export function validarCondicionMateria(body) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos de la condición.");
  if (typeof body.esPromocional !== "boolean") throw errorAcceso(400, "Indicá si la materia es promocional.");
  const notaRegularizacion = validarNotaDeCampo(body.notaRegularizacion, "regularizar");
  const notaAprobacionFinal = validarNotaDeCampo(body.notaAprobacionFinal, "aprobar el final");
  let notaPromocion = null;
  if (body.esPromocional) {
    notaPromocion = validarNotaDeCampo(body.notaPromocion, "promocionar");
    if (notaPromocion <= notaRegularizacion) throw errorAcceso(400, "La nota de promoción tiene que ser mayor que la de regularización.");
  }
  return { esPromocional: body.esPromocional, notaRegularizacion, notaPromocion, notaAprobacionFinal };
}

function validarNotaDeCampo(valor, para) {
  if (valor == null || valor === "") throw errorAcceso(400, `Indicá con cuánto se puede ${para}.`);
  try { return validarNota(valor); } catch { throw errorAcceso(400, `La nota para ${para} tiene que ser un número entre ${NOTA_MINIMA} y ${NOTA_MAXIMA}.`); }
}

export const condicionConfigurada = (materia) => materia?.notaRegularizacion != null && materia?.notaAprobacionFinal != null;

// ---------- Regularidad ----------

export function vencimientoRegularidad(regularDesde) {
  if (!regularDesde) return null;
  const vence = new Date(regularDesde);
  vence.setUTCFullYear(vence.getUTCFullYear() + ANIOS_REGULARIDAD);
  return vence;
}

export const regularidadVigente = (cursada, ahora = new Date()) =>
  cursada?.estado === "REGULAR" && cursada.regularDesde != null && ahora <= vencimientoRegularidad(cursada.regularDesde);

// Calcula el estado de la cursada a partir de sus condiciones finales y exámenes finales,
// en orden cronológico. Es pura (sin DB) para poder probar todas las reglas:
// - Promocionado: aprueba la materia con esa nota.
// - Regular: la materia queda REGULAR desde esa fecha; los intentos arrancan de cero.
// - Examen final (solo si está regular y dentro del plazo): cada uno es un intento.
//   Con la nota de aprobación del final, aprueba con esa nota; desaprobado el tercero,
//   pierde la regularidad y vuelve a PENDIENTE (tiene que recursar).
// Devuelve null si no hay condiciones ni finales: entonces no se toca la cursada.
export function estadoDeCursada(evaluaciones, materia) {
  const relevantes = evaluaciones.filter((e) => e.tipo === "CONDICION_FINAL" || e.tipo === "FINAL");
  if (!relevantes.length) return null;
  const ordenadas = [...relevantes].sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || a.id - b.id);

  let estado = { estado: "EN_CURSO", nota: null, regularDesde: null, intentosFinal: 0 };
  for (const ev of ordenadas) {
    if (estado.estado === "APROBADA") break;
    const fecha = new Date(ev.fecha);
    if (ev.tipo === "CONDICION_FINAL") {
      estado = ev.condicion === "PROMOCIONADO"
        ? { estado: "APROBADA", nota: ev.nota, regularDesde: null, intentosFinal: 0 }
        : { estado: "REGULAR", nota: null, regularDesde: fecha, intentosFinal: 0 };
      continue;
    }
    // Examen final: no cuenta si no estaba regular o si lo rindió fuera del plazo.
    if (estado.estado !== "REGULAR" || fecha < estado.regularDesde || fecha > vencimientoRegularidad(estado.regularDesde)) continue;
    const intentosFinal = estado.intentosFinal + 1;
    if (materia.notaAprobacionFinal != null && ev.nota >= materia.notaAprobacionFinal) {
      estado = { ...estado, estado: "APROBADA", nota: ev.nota, intentosFinal };
    } else if (intentosFinal >= MAX_INTENTOS_FINAL) {
      estado = { estado: "PENDIENTE", nota: null, regularDesde: null, intentosFinal: 0 };
    } else {
      estado = { ...estado, intentosFinal };
    }
  }
  return estado;
}

export async function recalcularCursada(tx, cursadaId, materia) {
  const evaluaciones = await tx.evaluacion.findMany({
    where: { cursadaId, tipo: { in: ["CONDICION_FINAL", "FINAL"] } },
    select: { id: true, tipo: true, condicion: true, nota: true, fecha: true },
  });
  const estado = estadoDeCursada(evaluaciones, materia);
  if (estado) await tx.cursada.update({ where: { id: cursadaId }, data: estado });
}

// Antes de guardar, rechaza lo que no corresponde con un mensaje que nombra al alumno.
// `cursada` es el estado actual (estado, regularDesde); `materia` trae la condición configurada.
export function verificarCarga({ tipo, condicion, nota, fecha }, { cursada, materia, nombre }) {
  if (tipo === "CONDICION_FINAL") {
    if (cursada?.estado === "APROBADA") throw errorAcceso(409, `${nombre} ya aprobó la materia.`);
    if (regularidadVigente(cursada)) {
      throw errorAcceso(409, `${nombre} ya está regular (vence el ${formatoFecha(vencimientoRegularidad(cursada.regularDesde))}).`);
    }
    if (condicion === "PROMOCIONADO") {
      if (!materia.esPromocional) throw errorAcceso(400, "Esta materia no es promocional: solo se puede cargar la condición regular.");
      if (nota < materia.notaPromocion) throw errorAcceso(400, `Para promocionar hace falta ${materia.notaPromocion} o más (${nombre} tiene ${nota}).`);
    } else if (nota < materia.notaRegularizacion) {
      throw errorAcceso(400, `Para regularizar hace falta ${materia.notaRegularizacion} o más (${nombre} tiene ${nota}).`);
    }
  }
  if (tipo === "FINAL") {
    if (cursada?.estado !== "REGULAR" || !cursada.regularDesde) throw errorAcceso(400, `${nombre} no está regular: no puede rendir el examen final.`);
    if (fecha < new Date(cursada.regularDesde)) throw errorAcceso(400, `La fecha del final es anterior a la regularización de ${nombre}.`);
    const vence = vencimientoRegularidad(cursada.regularDesde);
    if (fecha > vence) throw errorAcceso(400, `La regularidad de ${nombre} venció el ${formatoFecha(vence)}: tiene que volver a cursar.`);
  }
}

// Las fechas de calendario se guardan a medianoche UTC.
const formatoFecha = (fecha) => new Date(fecha).toLocaleDateString("es-AR", { timeZone: "UTC" });

import { errorAcceso } from "./docentes.js";

export const TIPOS_PERIODO_ACADEMICO = [
  "CLASES_ANUALES",
  "CLASES_CUATRIMESTRE_1",
  "CLASES_CUATRIMESTRE_2",
  "EXAMENES_FINALES",
  "VACACIONES",
  "FERIADO",
];

export async function aniosCalendarioPublicados(db, anios) {
  if (!anios.length) return [];
  const publicaciones = await db.publicacionCalendario.findMany({
    where: { anio: { in: anios }, publicado: true },
    select: { anio: true },
  });
  return publicaciones.map(({ anio }) => anio);
}

const TIPOS_UNICOS_POR_ANIO = new Set([
  "CLASES_ANUALES",
  "CLASES_CUATRIMESTRE_1",
  "CLASES_CUATRIMESTRE_2",
]);
const TIPOS_SIN_SOLAPAMIENTO = new Set([
  ...TIPOS_UNICOS_POR_ANIO,
  "EXAMENES_FINALES",
  "VACACIONES",
  "FERIADO",
]);

function fechaCalendario(valor, campo) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw errorAcceso(400, `Indicá una fecha válida para ${campo}.`);
  }
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
    throw errorAcceso(400, `Indicá una fecha válida para ${campo}.`);
  }
  return fecha;
}

export function validarPeriodoAcademico(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw errorAcceso(400, "Faltan los datos del período académico.");
  }
  const { tipo, nombre, fechaInicio, fechaFin } = body;
  if (!TIPOS_PERIODO_ACADEMICO.includes(tipo)) throw errorAcceso(400, "Elegí un tipo de período académico válido.");
  if (typeof nombre !== "string" || !nombre.trim() || nombre.trim().length > 120) {
    throw errorAcceso(400, "El nombre del período es obligatorio y admite hasta 120 caracteres.");
  }
  const inicio = fechaCalendario(fechaInicio, "inicio");
  const fin = fechaCalendario(fechaFin, "fin");
  const anio = inicio.getUTCFullYear();
  if (anio < 1900 || anio > 2100 || fin < inicio || fin.getUTCFullYear() > 2100 ||
      (tipo !== "VACACIONES" && fin.getUTCFullYear() !== anio)) {
    throw errorAcceso(400, "El período debe tener fechas válidas dentro del año calendario; las vacaciones pueden extenderse al año siguiente.");
  }
  if (tipo === "FERIADO" && inicio.getTime() !== fin.getTime()) {
    throw errorAcceso(400, "Un feriado debe corresponder a un solo día.");
  }
  return { anio, tipo, nombre: nombre.trim(), fechaInicio: inicio, fechaFin: fin };
}

const seSolapan = (a, b) => a.fechaInicio <= b.fechaFin && a.fechaFin >= b.fechaInicio;

export async function validarNoSolapado(db, datos, excluirId = null) {
  if (!TIPOS_SIN_SOLAPAMIENTO.has(datos.tipo)) return;
  const filtro = { tipo: datos.tipo, ...(excluirId ? { id: { not: excluirId } } : {}) };
  const existentes = await db.periodoAcademico.findMany({
    where: {
      ...filtro,
      ...(datos.tipo === "VACACIONES"
        ? { fechaInicio: { lte: datos.fechaFin }, fechaFin: { gte: datos.fechaInicio } }
        : { anio: datos.anio }),
    },
    select: { id: true, fechaInicio: true, fechaFin: true },
  });
  if (TIPOS_UNICOS_POR_ANIO.has(datos.tipo) && existentes.length) {
    throw errorAcceso(409, "Ya existe un período de clases de este tipo para ese año.");
  }
  if (existentes.some((periodo) => seSolapan(periodo, datos))) {
    throw errorAcceso(409, "El período se superpone con otro del mismo tipo.");
  }
}

export async function validarFechaEnPeriodoFinal(db, fecha) {
  const [periodo, feriado] = await Promise.all([
    db.periodoAcademico.findFirst({
      where: { tipo: "EXAMENES_FINALES", fechaInicio: { lte: fecha }, fechaFin: { gte: fecha } },
      select: { id: true, nombre: true },
    }),
    db.periodoAcademico.findFirst({
      where: { tipo: "FERIADO", fechaInicio: { lte: fecha }, fechaFin: { gte: fecha } },
      select: { id: true, nombre: true },
    }),
  ]);
  if (feriado) {
    throw errorAcceso(400, `No se puede programar un examen final en un feriado${feriado.nombre ? ` (${feriado.nombre})` : ""}.`);
  }
  if (!periodo) {
    throw errorAcceso(400, "La fecha debe estar dentro de un período de exámenes finales configurado por administración.");
  }
  return periodo;
}

export async function validarCoberturaExamenesFinales(db, periodo, { excluirId = null, eliminar = false } = {}) {
  const [examenes, periodos] = await Promise.all([
    db.fechaExamen.findMany({ where: { tipo: "FINAL" }, select: { fecha: true } }),
    db.periodoAcademico.findMany({
      where: { tipo: "EXAMENES_FINALES", ...(excluirId ? { id: { not: excluirId } } : {}) },
      select: { fechaInicio: true, fechaFin: true },
    }),
  ]);
  if (!eliminar && periodo.tipo === "EXAMENES_FINALES") {
    periodos.push({ fechaInicio: periodo.fechaInicio, fechaFin: periodo.fechaFin });
  }
  if (examenes.some(({ fecha }) =>
    !periodos.some((p) => fecha >= p.fechaInicio && fecha <= p.fechaFin))) {
    throw errorAcceso(409, "No se puede modificar el período: hay finales programados que quedarían fuera de todos los períodos de examen.");
  }
}

export function tipoPeriodoDeMateria(materia) {
  if (materia.cuatrimestre === 1) return "CLASES_CUATRIMESTRE_1";
  if (materia.cuatrimestre === 2) return "CLASES_CUATRIMESTRE_2";
  return "CLASES_ANUALES";
}

export function claseOcurreEnFecha(materia, fecha, periodos) {
  const fechaDia = fecha instanceof Date ? fecha : new Date(`${fecha}T00:00:00.000Z`);
  if (fechaDia.getUTCDay() === 0) return false;
  const año = fechaDia.getUTCFullYear();
  const tiposLectivos = materia.cuatrimestre == null
    ? ["CLASES_CUATRIMESTRE_1", "CLASES_CUATRIMESTRE_2"]
    : [tipoPeriodoDeMateria(materia)];
  const hayCuatrimestres = periodos.some((periodo) =>
    periodo.anio === año && tiposLectivos.includes(periodo.tipo));
  const tiposAplicables = materia.cuatrimestre == null && !hayCuatrimestres
    ? ["CLASES_ANUALES"]
    : tiposLectivos;
  const enPeriodoLectivo = periodos.some((p) =>
    p.anio === año && tiposAplicables.includes(p.tipo) && fechaDia >= p.fechaInicio && fechaDia <= p.fechaFin);
  if (!enPeriodoLectivo) return false;
  return !periodos.some((p) =>
    ["VACACIONES", "FERIADO"].includes(p.tipo) &&
    fechaDia >= p.fechaInicio &&
    fechaDia <= p.fechaFin);
}

export function marcasCalendarioParaFecha(fecha, periodos) {
  const fechaDia = fecha instanceof Date ? fecha : new Date(`${fecha}T00:00:00.000Z`);
  const fechaISO = fechaDia.toISOString().slice(0, 10);
  const diaSemana = fechaDia.getUTCDay();
  const marcas = periodos
    .filter((periodo) =>
      !["CLASES_ANUALES", "CLASES_CUATRIMESTRE_1", "CLASES_CUATRIMESTRE_2"].includes(periodo.tipo) &&
      !(diaSemana === 0 && ["EXAMENES_FINALES", "VACACIONES"].includes(periodo.tipo)) &&
      fechaDia >= periodo.fechaInicio &&
      fechaDia <= periodo.fechaFin)
    .map(({ tipo, nombre }) => ({ tipo, nombre }));
  const esFeriado = marcas.some(({ tipo }) => tipo === "FERIADO");
  if (esFeriado) {
    for (let indice = marcas.length - 1; indice >= 0; indice -= 1) {
      if (marcas[indice].tipo === "EXAMENES_FINALES") marcas.splice(indice, 1);
    }
  }
  const periodosCuatrimestrales = periodos.filter((periodo) =>
    ["CLASES_CUATRIMESTRE_1", "CLASES_CUATRIMESTRE_2"].includes(periodo.tipo));
  for (const periodo of periodosCuatrimestrales) {
    const etiqueta = periodo.tipo === "CLASES_CUATRIMESTRE_1" ? "1.º cuatrimestre" : "2.º cuatrimestre";
    if (fechaDia.getTime() === periodo.fechaInicio.getTime()) {
      marcas.push({ tipo: "INICIO_CUATRIMESTRE", nombre: `Inicio del ${etiqueta}` });
    }
    if (fechaDia.getTime() === periodo.fechaFin.getTime()) {
      marcas.push({ tipo: "FIN_CUATRIMESTRE", nombre: `Fin del ${etiqueta}` });
    }
  }
  const esNoLaborable = marcas.some(({ tipo }) => tipo === "FERIADO" || tipo === "VACACIONES");
  return {
    esHabil: diaSemana !== 0 && diaSemana !== 6 && !esNoLaborable,
    marcas,
    fecha: fechaISO,
  };
}

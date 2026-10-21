import { errorAcceso } from "./docentes.js";

export const DATOS_ACTIVIDAD_PERSONAL = {
  id: true,
  titulo: true,
  notas: true,
  estado: true,
  duracion: true,
  categoria: true,
  etiquetas: true,
  programacion: true,
  frecuencia: true,
  intervalo: true,
  dia: true,
  fecha: true,
  repetirHasta: true,
  horaInicio: true,
  creadoEn: true,
};

export const CATEGORIAS_ACTIVIDAD = ["TRABAJO", "ESTUDIO", "SALUD", "HOGAR", "OCIO", "OTRA"];
export const ESTADOS_ACTIVIDAD = ["PENDIENTE", "EN_CURSO", "FINALIZADA"];
export const FRECUENCIAS_ACTIVIDAD = ["DIA", "SEMANA", "MES"];
export const DIAS_SEMANA = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];
export const NOMBRE_DIA = {
  LUNES: "Lunes",
  MARTES: "Martes",
  MIERCOLES: "Miércoles",
  JUEVES: "Jueves",
  VIERNES: "Viernes",
  SABADO: "Sábado",
  DOMINGO: "Domingo",
};

const MAX_TITULO = 120;
const MAX_NOTAS = 2000;
const MAX_ETIQUETA = 40;
const MAX_ETIQUETAS = 10;
const MINUTOS_POR_DIA = 1440;

const esObjeto = (valor) => valor !== null && typeof valor === "object" && !Array.isArray(valor);
const limpiarTexto = (valor) => valor.trim().replace(/\s+/g, " ");

function validarTexto(valor, campo, maximo) {
  if (typeof valor !== "string" || !valor.trim()) {
    throw errorAcceso(400, `Falta ${campo}.`);
  }
  const limpio = limpiarTexto(valor);
  if (limpio.length > maximo) {
    throw errorAcceso(400, `${campo[0].toUpperCase()}${campo.slice(1)} puede tener hasta ${maximo} caracteres.`);
  }
  return limpio;
}

function validarNotas(valor) {
  if (valor == null) return null;
  if (typeof valor !== "string") throw errorAcceso(400, "Las notas deben ser texto.");
  const notas = valor.trim();
  if (notas.length > MAX_NOTAS) throw errorAcceso(400, `Las notas pueden tener hasta ${MAX_NOTAS} caracteres.`);
  return notas || null;
}

function validarEstado(valor = "PENDIENTE") {
  if (!ESTADOS_ACTIVIDAD.includes(valor)) {
    throw errorAcceso(400, "Elegí un estado válido para la actividad.");
  }
  return valor;
}

function validarDuracion(valor) {
  if (!Number.isSafeInteger(valor) || valor < 1 || valor > 2147483647) {
    throw errorAcceso(400, "La duración debe ser un número entero de minutos mayor que cero.");
  }
  return valor;
}

function validarCategoria(valor, categorias = CATEGORIAS_ACTIVIDAD) {
  if (!categorias.includes(valor)) {
    throw errorAcceso(400, "Elegí una categoría general de la lista.");
  }
  return valor;
}

function validarEtiquetas(valor) {
  if (!Array.isArray(valor) || valor.length > MAX_ETIQUETAS) {
    throw errorAcceso(400, `Indicá hasta ${MAX_ETIQUETAS} etiquetas como una lista.`);
  }

  const etiquetas = valor.map((etiqueta) => validarTexto(etiqueta, "la etiqueta", MAX_ETIQUETA));
  const unicas = [];
  const vistas = new Set();
  for (const etiqueta of etiquetas) {
    const clave = etiqueta.toLocaleLowerCase("es");
    if (!vistas.has(clave)) {
      vistas.add(clave);
      unicas.push(etiqueta);
    }
  }
  return unicas;
}

function validarHora(valor) {
  if (typeof valor !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(valor)) {
    throw errorAcceso(400, "La hora de inicio debe tener el formato HH:MM.");
  }
  return valor;
}

function validarFechaActividad(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw errorAcceso(400, "Indicá una fecha válida para la actividad.");
  }
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
    throw errorAcceso(400, "Indicá una fecha válida para la actividad.");
  }
  return fecha;
}

function validarProgramacion(body, cambios = false) {
  const camposProgramacion = ["programacion", "frecuencia", "intervalo", "dia", "fecha", "repetirHasta", "horaInicio"];
  const tieneCampos = camposProgramacion.some((campo) => campo in body);
  if (cambios && !tieneCampos) return {};

  const programacion = body.programacion ?? (cambios ? undefined : "PUNTUAL");
  if (!["RECURRENTE", "PUNTUAL"].includes(programacion)) {
    throw errorAcceso(400, "Elegí si la actividad es recurrente o puntual.");
  }
  const horaInicio = validarHora(body.horaInicio);
  const duracion = body.duracion;
  if (Number.isSafeInteger(duracion) && minutosDesdeMedianoche(horaInicio) + duracion > MINUTOS_POR_DIA) {
    throw errorAcceso(400, "La actividad debe terminar antes de la medianoche.");
  }

  if (programacion === "RECURRENTE") {
    const frecuencia = body.frecuencia ?? "SEMANA";
    const intervalo = body.intervalo ?? 1;
    if (!FRECUENCIAS_ACTIVIDAD.includes(frecuencia)) {
      throw errorAcceso(400, "Elegí una frecuencia válida para la actividad.");
    }
    if (!Number.isSafeInteger(intervalo) || intervalo < 1 || intervalo > 365) {
      throw errorAcceso(400, "El intervalo de repetición debe ser un entero entre 1 y 365.");
    }
    const fecha = body.fecha == null || body.fecha === ""
      ? null
      : validarFechaActividad(body.fecha);
    if (!fecha && !DIAS_SEMANA.includes(body.dia)) {
      throw errorAcceso(400, "Indicá una fecha de inicio válida para la actividad recurrente.");
    }
    const repetirHasta = body.repetirHasta == null || body.repetirHasta === ""
      ? null
      : validarFechaActividad(body.repetirHasta);
    if (fecha && repetirHasta && repetirHasta < fecha) {
      throw errorAcceso(400, "La fecha de fin debe ser igual o posterior a la fecha de inicio.");
    }
    return {
      programacion,
      frecuencia,
      intervalo,
      dia: fecha ? etiquetaDiaDeFecha(fecha) : body.dia,
      fecha,
      repetirHasta,
      horaInicio,
    };
  }

  if (body.dia != null && body.dia !== "") {
    throw errorAcceso(400, "Una actividad puntual no lleva un día recurrente.");
  }
  if (body.fecha == null || body.fecha === "") {
    throw errorAcceso(400, "Indicá la fecha de la actividad puntual.");
  }
  if (body.repetirHasta != null && body.repetirHasta !== "") {
    throw errorAcceso(400, "Una actividad puntual no lleva fecha de fin de repetición.");
  }
  return {
    programacion,
    frecuencia: "SEMANA",
    intervalo: 1,
    dia: null,
    fecha: validarFechaActividad(body.fecha),
    repetirHasta: null,
    horaInicio,
  };
}

export function validarNuevaActividadPersonal(body, categorias = CATEGORIAS_ACTIVIDAD) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos de la actividad.");
  return {
    titulo: validarTexto(body.titulo, "el título", MAX_TITULO),
    notas: validarNotas(body.notas),
    estado: validarEstado(body.estado),
    duracion: validarDuracion(body.duracion),
    categoria: validarCategoria(body.categoria, categorias),
    etiquetas: validarEtiquetas(body.etiquetas),
    ...validarProgramacion(body),
  };
}

export function validarCambioActividadPersonal(body, categorias = CATEGORIAS_ACTIVIDAD) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos del cambio.");
  const cambios = {};
  if ("titulo" in body) cambios.titulo = validarTexto(body.titulo, "el título", MAX_TITULO);
  if ("notas" in body) cambios.notas = validarNotas(body.notas);
  if ("estado" in body) cambios.estado = validarEstado(body.estado);
  if ("duracion" in body) cambios.duracion = validarDuracion(body.duracion);
  if ("categoria" in body) cambios.categoria = validarCategoria(body.categoria, categorias);
  if ("etiquetas" in body) cambios.etiquetas = validarEtiquetas(body.etiquetas);
  if (!Object.keys(cambios).length && ![
    "programacion", "frecuencia", "intervalo", "dia", "fecha", "repetirHasta", "horaInicio",
  ].some((campo) => campo in body)) {
    throw errorAcceso(400, "Indicá qué querés cambiar: título, notas, estado, duración, categoría o etiquetas.");
  }
  return { ...cambios, ...validarProgramacion(body, true) };
}

export function validarFiltroEtiqueta(valor) {
  if (valor === undefined) return null;
  return validarTexto(valor, "la etiqueta", MAX_ETIQUETA);
}

export function validarFechaAgenda(valor) {
  if (valor === undefined) return new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw errorAcceso(400, "Indicá una fecha válida para consultar la agenda.");
  }
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
    throw errorAcceso(400, "Indicá una fecha válida para consultar la agenda.");
  }
  return fecha;
}

export function inicioSemana(fecha) {
  const inicio = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const desplazamiento = (inicio.getUTCDay() + 6) % 7;
  inicio.setUTCDate(inicio.getUTCDate() - desplazamiento);
  return inicio;
}

export function fechaParaDia(inicio, dia) {
  const fecha = new Date(inicio);
  fecha.setUTCDate(fecha.getUTCDate() + DIAS_SEMANA.indexOf(dia));
  return fecha;
}

export function etiquetaDiaDeFecha(fecha) {
  return DIAS_SEMANA[fecha.getUTCDay() === 0 ? 6 : fecha.getUTCDay() - 1];
}

export function actividadOcurreEnFecha(actividad, fecha) {
  if (actividad.programacion === "PUNTUAL") {
    return Boolean(actividad.fecha) &&
      actividad.fecha.toISOString().slice(0, 10) === fecha.toISOString().slice(0, 10);
  }

  const inicio = actividad.fecha;
  if (inicio && fecha < inicio) return false;
  if (actividad.repetirHasta && fecha > actividad.repetirHasta) return false;

  const frecuencia = actividad.frecuencia ?? "SEMANA";
  const intervalo = actividad.intervalo ?? 1;
  if (!inicio) return frecuencia === "SEMANA" && actividad.dia === etiquetaDiaDeFecha(fecha);

  if (frecuencia === "DIA") {
    const dias = Math.floor((fecha.getTime() - inicio.getTime()) / 86400000);
    return dias % intervalo === 0;
  }
  if (frecuencia === "SEMANA") {
    if (actividad.dia !== etiquetaDiaDeFecha(fecha)) return false;
    const semanaInicio = inicioSemana(inicio);
    const semanaFecha = inicioSemana(fecha);
    const semanas = Math.floor((semanaFecha.getTime() - semanaInicio.getTime()) / (7 * 86400000));
    return semanas % intervalo === 0;
  }
  if (frecuencia === "MES") {
    const meses = (fecha.getUTCFullYear() - inicio.getUTCFullYear()) * 12 +
      fecha.getUTCMonth() - inicio.getUTCMonth();
    return meses >= 0 && meses % intervalo === 0 && fecha.getUTCDate() === inicio.getUTCDate();
  }
  return false;
}

export function horaFin(horaInicio, duracion) {
  const minutos = Number(horaInicio.slice(0, 2)) * 60 + Number(horaInicio.slice(3)) + duracion;
  if (minutos > MINUTOS_POR_DIA) throw errorAcceso(400, "La actividad debe terminar antes de la medianoche.");
  if (minutos === MINUTOS_POR_DIA) return "24:00";
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

export function minutosDesdeMedianoche(hora) {
  if (hora === "24:00") return MINUTOS_POR_DIA;
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
}

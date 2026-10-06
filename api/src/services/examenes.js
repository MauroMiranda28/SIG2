// Fechas de exámenes que el docente programa. La validación y los textos de los avisos viven acá,
// separados de la ruta, para probarlos sin DB.

import { errorAcceso } from "./docentes.js";
import { validarFecha, filtroAlumnosDeMateria } from "./notas.js";
import { crearNotificacionesIndividuales } from "./notificaciones.js";

export const TIPOS_EXAMEN = ["PARCIAL", "RECUPERATORIO", "FINAL"];
const ETIQUETA = { PARCIAL: "Parcial", RECUPERATORIO: "Recuperatorio", FINAL: "Examen final" };
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const ZONA = "America/Argentina/Buenos_Aires";

export const DATOS_EXAMEN = {
  id: true, tipo: true, fecha: true, hora: true, materiaId: true,
  aula: { select: { id: true, nombre: true } },
};

// La fecha de hoy en Argentina, como fecha de calendario (medianoche UTC) para comparar con Examen.fecha.
export function hoy(ahora = new Date()) {
  return new Date(`${ahora.toLocaleDateString("en-CA", { timeZone: ZONA })}T00:00:00.000Z`);
}

function validarFechaFutura(valor, ahora) {
  const fecha = validarFecha(valor);
  if (fecha < hoy(ahora)) throw errorAcceso(400, "La fecha del examen no puede ser anterior a hoy.");
  return fecha;
}

function validarHora(valor) {
  if (valor == null || valor === "") return null;
  if (typeof valor !== "string" || !HORA.test(valor)) throw errorAcceso(400, "La hora tiene que tener el formato HH:MM.");
  return valor;
}

function validarAula(valor) {
  if (valor == null || valor === "") return null;
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw errorAcceso(400, "El identificador del aula no es válido.");
  return id;
}

const esObjeto = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// Cuerpo de POST /api/examenes/materias/:id.
export function validarNuevoExamen(body, ahora = new Date()) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos del examen.");
  if (!TIPOS_EXAMEN.includes(body.tipo)) throw errorAcceso(400, "Elegí si es parcial, recuperatorio o final.");
  return { tipo: body.tipo, fecha: validarFechaFutura(body.fecha, ahora), hora: validarHora(body.hora), aulaId: validarAula(body.aulaId) };
}

// Cuerpo de PATCH /api/examenes/:id: solo cambian los campos que vienen (hora y aula se pueden vaciar con null).
export function validarCambioExamen(body, ahora = new Date()) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos del cambio.");
  const cambios = {};
  if ("fecha" in body) cambios.fecha = validarFechaFutura(body.fecha, ahora);
  if ("hora" in body) cambios.hora = validarHora(body.hora);
  if ("aulaId" in body) cambios.aulaId = validarAula(body.aulaId);
  if (!Object.keys(cambios).length) throw errorAcceso(400, "Indicá qué querés cambiar: fecha, hora o aula.");
  return cambios;
}

// ---------- Textos de los avisos ----------

const mismaFecha = (a, b) => new Date(a).getTime() === new Date(b).getTime();
// "lunes, 12/5/2026" (las fechas de calendario se guardan a medianoche UTC).
const diaYFecha = (fecha) => new Date(fecha).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });

export function describirExamen({ fecha, hora, aula }) {
  return `${diaYFecha(fecha)}${hora ? ` a las ${hora}` : ""}${aula?.nombre ? ` · ${aula.nombre}` : ""}`;
}

// accion: "NUEVO", "REPROGRAMADO" o "CANCELADO". `anterior` es el examen antes del cambio.
export function avisoExamen({ accion, materiaNombre, examen, anterior }) {
  const etiqueta = ETIQUETA[examen.tipo] ?? "Examen";
  if (accion === "REPROGRAMADO") {
    return {
      titulo: `Se reprogramó el ${etiqueta.toLowerCase()} de ${materiaNombre}`,
      mensaje: `Nueva fecha: ${describirExamen(examen)}. Antes estaba previsto para ${describirExamen(anterior)}.`,
    };
  }
  if (accion === "CANCELADO") {
    return {
      titulo: `Se canceló el ${etiqueta.toLowerCase()} de ${materiaNombre}`,
      mensaje: `El ${etiqueta.toLowerCase()} previsto para ${describirExamen(examen)} ya no se toma en esa fecha. Cuando haya una nueva te avisamos.`,
    };
  }
  return {
    titulo: `${etiqueta} de ${materiaNombre}`,
    mensaje: `Fecha: ${describirExamen(examen)}.`,
  };
}

// ¿Cambió algo que le importe al alumno (fecha, hora o aula)?
export function cambioRelevante(anterior, nuevo) {
  return !mismaFecha(anterior.fecha, nuevo.fecha) || (anterior.hora ?? null) !== (nuevo.hora ?? null) || (anterior.aula?.id ?? null) !== (nuevo.aula?.id ?? null);
}

// Le avisa a los alumnos de la materia (los que tienen cursada o eligieron una de sus comisiones).
// Recibe la transacción del cambio: el aviso se guarda junto con él o no se guarda ninguno de los dos.
export async function avisarAlumnosDeExamen(db, { materia, aviso, autorId }) {
  const alumnos = await db.usuario.findMany({ where: filtroAlumnosDeMateria(materia.id), select: { id: true } });
  return crearNotificacionesIndividuales(db, alumnos.map((a) => ({
    usuarioId: a.id, tipo: "FECHA_EXAMEN", materiaId: materia.id, autorId, ...aviso,
  })));
}

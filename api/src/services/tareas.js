// Tareas con fecha de entrega y su recordatorio. La validación y los textos viven acá, separados de
// la ruta, para probarlos sin DB.

import { errorAcceso } from "./docentes.js";
import { validarFecha } from "./notas.js";
import { hoy } from "./examenes.js";
import { crearNotificacionesIndividuales } from "./notificaciones.js";

export const DIAS_ANTICIPACION = 3; // cuántos días antes de la entrega se manda el recordatorio
export const LARGO_TITULO_MAXIMO = 120;
export const LARGO_DESCRIPCION_MAXIMO = 1000;

export const DATOS_TAREA = { id: true, titulo: true, descripcion: true, fechaEntrega: true, materiaId: true };

const esObjeto = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const limpiar = (texto) => texto.trim().replace(/[ \t]+/g, " ");

function validarTitulo(valor) {
  if (typeof valor !== "string" || !valor.trim()) throw errorAcceso(400, "Falta el título de la tarea.");
  const titulo = limpiar(valor);
  if (titulo.length > LARGO_TITULO_MAXIMO) throw errorAcceso(400, `El título puede tener hasta ${LARGO_TITULO_MAXIMO} caracteres.`);
  return titulo;
}

function validarDescripcion(valor) {
  if (valor == null || valor === "") return null;
  if (typeof valor !== "string") throw errorAcceso(400, "La descripción tiene que ser texto.");
  const descripcion = limpiar(valor);
  if (descripcion.length > LARGO_DESCRIPCION_MAXIMO) throw errorAcceso(400, `La descripción puede tener hasta ${LARGO_DESCRIPCION_MAXIMO} caracteres.`);
  return descripcion || null;
}

function validarEntrega(valor, ahora) {
  const fecha = validarFecha(valor);
  if (fecha < hoy(ahora)) throw errorAcceso(400, "La fecha de entrega no puede ser anterior a hoy.");
  return fecha;
}

// Cuerpo de POST /api/tareas/materias/:id.
export function validarNuevaTarea(body, ahora = new Date()) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos de la tarea.");
  return { titulo: validarTitulo(body.titulo), descripcion: validarDescripcion(body.descripcion), fechaEntrega: validarEntrega(body.fechaEntrega, ahora) };
}

// Cuerpo de PATCH /api/tareas/:id: solo cambian los campos que vienen.
export function validarCambioTarea(body, ahora = new Date()) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos del cambio.");
  const cambios = {};
  if ("titulo" in body) cambios.titulo = validarTitulo(body.titulo);
  if ("descripcion" in body) cambios.descripcion = validarDescripcion(body.descripcion);
  if ("fechaEntrega" in body) cambios.fechaEntrega = validarEntrega(body.fechaEntrega, ahora);
  if (!Object.keys(cambios).length) throw errorAcceso(400, "Indicá qué querés cambiar: título, descripción o fecha de entrega.");
  return cambios;
}

// ---------- Recordatorio ----------

const DIA_MS = 86400e3;
const diaYFecha = (fecha) => new Date(fecha).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });

// Cuántos días faltan desde `desde` (fecha de calendario) hasta la entrega.
export const diasHasta = (fechaEntrega, desde) => Math.round((new Date(fechaEntrega) - desde) / DIA_MS);

export function avisoRecordatorio({ titulo, materiaNombre, fechaEntrega }, desde) {
  const dias = diasHasta(fechaEntrega, desde);
  const cuando = dias <= 0 ? "vence hoy" : dias === 1 ? "vence mañana" : `vence en ${dias} días`;
  return {
    titulo: `Se acerca la entrega: ${titulo}`,
    mensaje: `La entrega de «${titulo}» (${materiaNombre}) ${cuando}: ${diaYFecha(fechaEntrega)}.`,
  };
}

// Una sola vez por alumno, tarea y fecha de entrega: si el docente cambia la fecha, se vuelve a avisar.
export const claveRecordatorio = (tarea) => `entrega-${tarea.id}-${new Date(tarea.fechaEntrega).toISOString().slice(0, 10)}`;

// Materias que cursa el alumno: tiene cursada o eligió una de sus comisiones.
export const filtroMateriasDelAlumno = (alumnoId) => ({
  OR: [
    { cursadas: { some: { alumnoId } } },
    { comisiones: { some: { inscripciones: { some: { alumnoId } } } } },
  ],
});

// Crea los recordatorios que le faltan al alumno: tareas de sus materias que se entregan de hoy a
// DIAS_ANTICIPACION días. No hace falta un proceso programado: se genera cuando el alumno consulta
// sus notificaciones, y la clave única evita repetirlos aunque consulte muchas veces o a la vez.
export async function generarRecordatoriosEntrega(db, alumnoId, ahora = new Date()) {
  const desde = hoy(ahora);
  const hasta = new Date(desde.getTime() + DIAS_ANTICIPACION * DIA_MS);
  const tareas = await db.tarea.findMany({
    where: { fechaEntrega: { gte: desde, lte: hasta }, materia: filtroMateriasDelAlumno(alumnoId) },
    select: { id: true, titulo: true, fechaEntrega: true, materia: { select: { id: true, nombre: true } } },
    orderBy: [{ fechaEntrega: "asc" }, { id: "asc" }],
  });
  return crearNotificacionesIndividuales(db, tareas.map((t) => ({
    usuarioId: alumnoId, tipo: "RECORDATORIO_ENTREGA", materiaId: t.materia.id, clave: claveRecordatorio(t),
    ...avisoRecordatorio({ titulo: t.titulo, materiaNombre: t.materia.nombre, fechaEntrega: t.fechaEntrega }, desde),
  })));
}

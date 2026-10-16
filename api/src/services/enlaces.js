// A qué pantalla lleva cada notificación. Es la única fuente de verdad: la campanita, el email y el
// push arman el mismo enlace desde acá. Las secciones son los ids de las pestañas de web/src/App.jsx
// (NAV_ITEMS) y también la parte que va después del # en la URL (ej. http://localhost:5173/#historial-notas).

// Texto del enlace según la sección a la que lleva.
export const TEXTO_SECCION = {
  materias: "Ver mis materias",
  horario: "Ver mi horario",
  "historial-notas": "Ver mi historial de notas",
  notas: "Ver mis notas y solicitudes de revisión",
  "inscripcion-final": "Ir a la inscripción a finales",
  revisiones: "Ver las solicitudes de revisión",
  "propuestas-programa-docente": "Ver mis propuestas de programa",
};

// Sección por defecto de cada tipo de notificación.
export const SECCION_POR_TIPO = {
  AVISO_DOCENTE: "materias",
  HORARIO_MODIFICADO: "horario",
  CALIFICACION_PUBLICADA: "historial-notas",
  FECHA_EXAMEN: "materias",
  RECORDATORIO_ENTREGA: "materias",
  REVISION_RESUELTA: "notas",
  SOLICITUD_REVISION: "revisiones",
  PROPUESTA_PROGRAMA_RESUELTA: "propuestas-programa-docente",
};

export const SECCION_GENERAL = "materias";

// La sección a la que lleva una notificación: la que se guardó al crearla (ej. un final lleva a la
// inscripción) o, si no hay, la del tipo. Una sección guardada que ya no existe vuelve a la del tipo.
export function seccionDe({ tipo, seccion }) {
  if (seccion && TEXTO_SECCION[seccion]) return seccion;
  return SECCION_POR_TIPO[tipo] ?? SECCION_GENERAL;
}

// { seccion, texto } que se le muestra al usuario.
export function enlaceDe(notificacion) {
  const seccion = seccionDe(notificacion);
  return { seccion, texto: TEXTO_SECCION[seccion] ?? "Abrir" };
}

// URL completa para los medios que salen del sistema (email, push).
export function urlDeSeccion(seccion, baseUrl = process.env.APP_URL) {
  const base = String(baseUrl || "http://localhost:5173").replace(/\/+$/, "");
  return `${base}/#${seccion}`;
}

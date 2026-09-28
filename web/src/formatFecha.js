// Las fechas "de calendario" (sin hora) que vienen de la API llegan como
// medianoche UTC. Formatearlas con la zona horaria local las corre un día
// para atrás en husos negativos (ej. Argentina, UTC-3), así que siempre las
// mostramos interpretadas en UTC.
export function formatFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

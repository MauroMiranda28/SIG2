import { formatFecha } from "../formatFecha.js";

// Cómo se le muestra al alumno el estado de una materia (lo usan «Materias» y «Mis notas»).
// - Cursando: la cursada está en curso o eligió una comisión de la materia.
// - Libre: no regularizó, desaprobó los 3 finales o se le venció la regularidad (2 años).

export const MAX_INTENTOS_FINAL = 3;

const hoy = () => new Date(`${new Date().toLocaleDateString("en-CA")}T00:00:00Z`);
const regularidadVencida = (m) => m.estado === "REGULAR" && m.venceRegularidad && new Date(m.venceRegularidad) < hoy();

export function estadoVisible(m) {
  if (m.estado === "APROBADA") return "APROBADA";
  if (m.estado === "LIBRE" || regularidadVencida(m)) return "LIBRE";
  if (m.estado === "REGULAR") return "REGULAR";
  if (m.estado === "EN_CURSO" || m.inscripto) return "CURSANDO";
  return "PENDIENTE";
}

export const ETIQUETA_ESTADO = {
  PENDIENTE: "Pendiente",
  CURSANDO: "Cursando",
  REGULAR: "Regular",
  LIBRE: "Libre",
  APROBADA: "Aprobada",
};

export const COLOR_ESTADO = {
  PENDIENTE: "#9e9e9e",
  CURSANDO: "#f9a825",
  REGULAR: "#1565c0",
  LIBRE: "#c62828",
  APROBADA: "#2e7d32",
};

// Explicación corta debajo del estado (o null si no hace falta).
export function detalleEstado(m) {
  const estado = estadoVisible(m);
  if (estado === "REGULAR") {
    return `${m.intentosFinal} de ${MAX_INTENTOS_FINAL} intentos de final usados · vence el ${formatFecha(m.venceRegularidad)}`;
  }
  if (estado === "LIBRE") {
    if (regularidadVencida(m)) return `Se venció la regularidad el ${formatFecha(m.venceRegularidad)}. Tenés que volver a inscribirte para cursarla.`;
    if (m.intentosFinal >= MAX_INTENTOS_FINAL) return `Desaprobaste los ${MAX_INTENTOS_FINAL} intentos de final. Tenés que volver a inscribirte para cursarla.`;
    return "No regularizaste la cursada. Tenés que volver a inscribirte para cursarla.";
  }
  return null;
}

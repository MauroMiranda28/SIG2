// Ev-xx: el alumno se inscribe a una fecha de final ya programada. La validación vive acá,
// separada de la ruta, para probarla sin DB.

import { errorAcceso } from "./docentes.js";
import { regularidadVigente, estaLibre } from "./notas.js";
import { hoy } from "./examenes.js";

export const DATOS_INSCRIPCION = {
  id: true, modalidad: true, creadoEn: true,
  examen: {
    select: {
      id: true, tipo: true, fecha: true, hora: true,
      materia: { select: { id: true, nombre: true, codigo: true } },
      aula: { select: { id: true, nombre: true } },
    },
  },
};

// Con qué modalidad puede el alumno inscribirse a un final de esta materia en este momento,
// según su cursada: REGULAR (la tiene vigente), LIBRE (no cursó, se le venció o la perdió),
// o null si todavía no corresponde (sigue cursando o ya aprobó la materia).
export function modalidadDisponible(cursada, ahora = new Date()) {
  if (regularidadVigente(cursada, ahora)) return "REGULAR";
  if (estaLibre(cursada, ahora)) return "LIBRE";
  return null;
}

// Valida que el examen sea un final futuro y que la cursada habilite inscribirse; devuelve la
// modalidad que le corresponde a esta inscripción.
export function validarInscripcion({ examen, cursada }, ahora = new Date()) {
  if (examen.tipo !== "FINAL") throw errorAcceso(400, "Solo te podés inscribir a exámenes finales.");
  if (new Date(examen.fecha) < hoy(ahora)) throw errorAcceso(400, "Ese final ya pasó: no te podés inscribir.");
  const modalidad = modalidadDisponible(cursada, ahora);
  if (!modalidad) throw errorAcceso(400, "Para inscribirte a un final tenés que estar regular o libre en la materia.");
  return modalidad;
}

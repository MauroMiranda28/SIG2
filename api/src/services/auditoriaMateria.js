// Registro de quién modificó los horarios o el material de una materia.
// Cada cambio y su registro se escriben en la MISMA transacción: no puede quedar
// un cambio sin registro ni un registro de un cambio que no se hizo.

const NOMBRE_DIA = {
  LUNES: "Lunes", MARTES: "Martes", MIERCOLES: "Miércoles",
  JUEVES: "Jueves", VIERNES: "Viernes", SABADO: "Sábado",
};

const LARGO_NOMBRE_ARCHIVO = 80;
export const MAX_CAMBIOS_POR_CONSULTA = 200;

export const DATOS_CAMBIO_MATERIA = {
  id: true, accion: true, detalle: true, creadoEn: true,
  autor: { select: { nombre: true, apellido: true, rol: true } },
};

// "Comisión A: Lunes 18:00–20:00 · Aula 1" (o "sin aula").
export function describirBloque({ comisionNombre, dia, horaInicio, horaFin, aulaNombre }) {
  return `${comisionNombre}: ${NOMBRE_DIA[dia] ?? dia} ${horaInicio}–${horaFin} · ${aulaNombre ?? "sin aula"}`;
}

// El nombre del archivo lo manda el cliente: se limpia (sin caracteres de control) y se acota.
export function limpiarNombreArchivo(nombre) {
  const limpio = String(nombre ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!limpio) return "sin nombre";
  return limpio.length > LARGO_NOMBRE_ARCHIVO ? `${limpio.slice(0, LARGO_NOMBRE_ARCHIVO - 1)}…` : limpio;
}

export function describirPrograma({ nombreArchivo, reemplaza }) {
  const archivo = limpiarNombreArchivo(nombreArchivo);
  return reemplaza
    ? `Se reemplazó el programa en PDF por «${archivo}».`
    : `Se subió el programa en PDF «${archivo}».`;
}

export function registrarCambio(db, { materiaId, autorId, accion, detalle }) {
  return db.cambioMateria.create({ data: { materiaId, autorId, accion, detalle } });
}

// Agrega el bloque y deja el registro, todo o nada.
export function crearBloqueConRegistro(db, { bloque, comisionNombre, aulaNombre, materiaId, autorId }) {
  return db.$transaction(async (tx) => {
    const creado = await tx.bloqueHorario.create({ data: bloque });
    await registrarCambio(tx, {
      materiaId, autorId, accion: "HORARIO_AGREGADO",
      detalle: describirBloque({ comisionNombre, aulaNombre, ...bloque }),
    });
    return creado;
  });
}

// Quita el bloque y deja el registro, todo o nada. El detalle se arma con los
// datos que tenía el bloque, porque después de borrarlo ya no hay de dónde sacarlos.
export function quitarBloqueConRegistro(db, { bloque, materiaId, autorId }) {
  return db.$transaction(async (tx) => {
    await tx.bloqueHorario.delete({ where: { id: bloque.id } });
    await registrarCambio(tx, {
      materiaId, autorId, accion: "HORARIO_QUITADO",
      detalle: describirBloque({
        comisionNombre: bloque.comision.nombre, dia: bloque.dia, horaInicio: bloque.horaInicio,
        horaFin: bloque.horaFin, aulaNombre: bloque.aula?.nombre,
      }),
    });
  });
}

// Guarda el nombre del PDF nuevo en la materia y deja el registro, todo o nada.
export function guardarProgramaConRegistro(db, { materiaId, archivoGuardado, nombreOriginal, reemplaza, autorId }) {
  return db.$transaction(async (tx) => {
    const materia = await tx.materia.update({
      where: { id: materiaId },
      data: { programaUrl: archivoGuardado }, // solo el nombre, nunca la ruta
      select: { id: true, nombre: true, codigo: true },
    });
    await registrarCambio(tx, {
      materiaId, autorId, accion: "PROGRAMA_SUBIDO",
      detalle: describirPrograma({ nombreArchivo: nombreOriginal, reemplaza }),
    });
    return materia;
  });
}

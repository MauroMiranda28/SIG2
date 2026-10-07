import { registrarCambio } from "./auditoriaMateria.js";
const error = (status, message) => Object.assign(new Error(message), { status });
export function validarActualizacion(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(k => !["contenidos", "bibliografia", "version", "reemplazarPdf", "pdfEsperado"].includes(k))) {
    throw error(400, "Los datos de actualización no son válidos.");
  }
  if (typeof body.contenidos !== "string" || !body.contenidos.trim() || body.contenidos.length > 20000) throw error(400, "Ingresá contenidos de hasta 20000 caracteres.");
  if (body.bibliografia != null && (typeof body.bibliografia !== "string" || body.bibliografia.length > 10000)) throw error(400, "La bibliografía admite hasta 10000 caracteres.");
  if (!Number.isInteger(body.version) || body.version < 1 || body.version >= 2147483647) throw error(400, "La versión del programa no es válida.");
  if (body.reemplazarPdf != null && typeof body.reemplazarPdf !== "boolean") throw error(400, "La confirmación del PDF no es válida.");
  if (body.pdfEsperado != null && typeof body.pdfEsperado !== "string") throw error(400, "La referencia del PDF no es válida.");
  return { contenidos: body.contenidos.trim(), bibliografia: body.bibliografia?.trim() || null, version: body.version, reemplazarPdf: body.reemplazarPdf === true, pdfEsperado: body.pdfEsperado ?? null };
}
export function actualizarPrograma(db, { id, autorId, datos }) {
  return db.$transaction(async tx => {
    const actual = await tx.programa.findUnique({ where: { id }, include: { materia: { select: { programaUrl: true } } } });
    if (!actual) throw error(404, "El programa ya no existe.");
    if (actual.version !== datos.version) throw error(409, "Otro administrador actualizó el programa. Recargá la versión vigente antes de guardar.");
    const pdfActual = actual.materia.programaUrl ?? null;
    if (pdfActual !== datos.pdfEsperado) throw error(409, "El PDF de la materia cambió. Recargá el programa antes de guardar.");
    if (pdfActual && !datos.reemplazarPdf) throw error(409, "Confirmá que la descarga debe usar el texto actualizado en lugar del PDF anterior.");
    if (actual.vigente && actual.contenidos === datos.contenidos && (actual.bibliografia ?? null) === datos.bibliografia && !pdfActual) throw error(400, "No modificaste el programa.");
    const resultado = await tx.programa.updateMany({
      where: { id, version: datos.version },
      data: { contenidos: datos.contenidos, bibliografia: datos.bibliografia, version: { increment: 1 }, vigente: true },
    });
    if (resultado.count !== 1) throw error(409, "Otro administrador actualizó el programa. Recargá antes de guardar.");
    // Retira solo la asociación: la descarga existente generará el PDF con el texto vigente.
    // No borra archivos del disco durante una transacción que todavía puede fallar.
    if (pdfActual) await tx.materia.update({ where: { id: actual.materiaId }, data: { programaUrl: null } });
    await registrarCambio(tx, {
      materiaId: actual.materiaId, autorId, accion: "PROGRAMA_SUBIDO",
      detalle: `Se actualizó el programa en texto de versión ${actual.version} a ${actual.version + 1} y se publicó como vigente.${pdfActual ? " La descarga PDF ahora se genera desde el texto vigente." : ""}`,
    });
    return tx.programa.findUnique({ where: { id } });
  }, { isolationLevel: "Serializable" });
}

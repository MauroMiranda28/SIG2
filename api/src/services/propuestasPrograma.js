// El docente propone cambios al programa de una materia que dicta; administración los aprueba (se publican
// como la nueva versión vigente) o los rechaza con una respuesta. El docente nunca modifica el programa directo.
// La validación y las reglas viven acá, separadas de la ruta, para probarlas sin DB.

import { errorAcceso, validarId, verificarAccesoMateria } from "./docentes.js";
import { aplicarActualizacion } from "./actualizarProgramas.js";
import { registrarCambio } from "./auditoriaMateria.js";
import { acortar, crearNotificacionesIndividuales } from "./notificaciones.js";

export const LARGO_CONTENIDOS_MAXIMO = 20000;
export const LARGO_BIBLIOGRAFIA_MAXIMO = 10000;
export const LARGO_MOTIVO_MINIMO = 10;
export const LARGO_MOTIVO_MAXIMO = 1000;
export const LARGO_RESPUESTA_MINIMO = 5;
export const LARGO_RESPUESTA_MAXIMO = 1000;
export const MAX_PROPUESTAS_POR_LISTADO = 100;
export const SECCION_PROPUESTAS_DOCENTE = "propuestas-programa-docente";

const esObjeto = (v) => v != null && typeof v === "object" && !Array.isArray(v);

export const DATOS_PROPUESTA = {
  id: true, contenidos: true, bibliografia: true, motivo: true, estado: true, creadoEn: true,
  versionBase: true, respuesta: true, resueltaEn: true,
  materia: { select: { id: true, nombre: true, codigo: true } },
};

// Cuerpo de POST /api/propuestas-programa: la materia, el programa completo como queda con el cambio y por qué.
export function validarPropuesta(body) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos de la propuesta.");
  const materiaId = validarId(body.materiaId, "identificador de la materia");

  if (typeof body.contenidos !== "string" || !body.contenidos.trim()) throw errorAcceso(400, "Los contenidos del programa son obligatorios.");
  if (body.contenidos.length > LARGO_CONTENIDOS_MAXIMO) throw errorAcceso(400, `Los contenidos admiten hasta ${LARGO_CONTENIDOS_MAXIMO} caracteres.`);

  if (body.bibliografia != null && typeof body.bibliografia !== "string") throw errorAcceso(400, "La bibliografía tiene que ser texto.");
  if ((body.bibliografia ?? "").length > LARGO_BIBLIOGRAFIA_MAXIMO) throw errorAcceso(400, `La bibliografía admite hasta ${LARGO_BIBLIOGRAFIA_MAXIMO} caracteres.`);

  if (typeof body.motivo !== "string" || !body.motivo.trim()) throw errorAcceso(400, "Contá por qué proponés el cambio.");
  const motivo = body.motivo.trim().replace(/\s+/g, " ");
  if (motivo.length < LARGO_MOTIVO_MINIMO) throw errorAcceso(400, `El motivo debe tener al menos ${LARGO_MOTIVO_MINIMO} caracteres.`);
  if (motivo.length > LARGO_MOTIVO_MAXIMO) throw errorAcceso(400, `El motivo puede tener hasta ${LARGO_MOTIVO_MAXIMO} caracteres.`);

  return { materiaId, contenidos: body.contenidos.trim(), bibliografia: body.bibliografia?.trim() || null, motivo };
}

// Cuerpo de PATCH /api/propuestas-programa/:id/resolver. Rechazar exige una respuesta (el docente tiene que saber por qué);
// aprobar la admite pero no la exige. `reemplazarPdf` confirma que el texto aprobado pasa a ser el que se descarga en lugar del PDF.
export function validarResolucionPropuesta(body) {
  if (!esObjeto(body)) throw errorAcceso(400, "Faltan los datos de la resolución.");
  if (!["APROBADA", "RECHAZADA"].includes(body.estado)) throw errorAcceso(400, "Indicá si la propuesta se aprueba o se rechaza.");

  let respuesta = null;
  if (body.respuesta != null && body.respuesta !== "") {
    if (typeof body.respuesta !== "string") throw errorAcceso(400, "La respuesta tiene que ser texto.");
    respuesta = body.respuesta.trim().replace(/[ \t]+/g, " ");
  }
  if (body.estado === "RECHAZADA" && !respuesta) throw errorAcceso(400, "Escribí por qué se rechaza la propuesta.");
  if (respuesta && respuesta.length < LARGO_RESPUESTA_MINIMO) throw errorAcceso(400, `La respuesta debe tener al menos ${LARGO_RESPUESTA_MINIMO} caracteres.`);
  if (respuesta && respuesta.length > LARGO_RESPUESTA_MAXIMO) throw errorAcceso(400, `La respuesta puede tener hasta ${LARGO_RESPUESTA_MAXIMO} caracteres.`);

  if (body.reemplazarPdf != null && typeof body.reemplazarPdf !== "boolean") throw errorAcceso(400, "La confirmación del PDF no es válida.");
  return { estado: body.estado, respuesta, reemplazarPdf: body.reemplazarPdf === true };
}

// ¿La propuesta cambia algo respecto del programa vigente?
export function cambiaElPrograma(programa, propuesta) {
  if (!programa) return true;
  return programa.contenidos !== propuesta.contenidos || (programa.bibliografia ?? null) !== propuesta.bibliografia;
}

// Crea la propuesta del docente. Solo para una materia que dicta, una pendiente a la vez por materia y que cambie algo.
// Si la materia todavía no tiene programa, la propuesta es el programa inicial (versionBase 0).
export function crearPropuesta(db, { docente, datos }) {
  return db.$transaction(async (tx) => {
    await verificarAccesoMateria(tx, docente, datos.materiaId);

    const programa = await tx.programa.findUnique({
      where: { materiaId: datos.materiaId }, select: { contenidos: true, bibliografia: true, version: true },
    });
    if (!cambiaElPrograma(programa, datos)) throw errorAcceso(400, "La propuesta no cambia nada del programa vigente.");

    const pendiente = await tx.propuestaPrograma.findFirst({
      where: { materiaId: datos.materiaId, docenteId: docente.id, estado: "PENDIENTE" }, select: { id: true },
    });
    if (pendiente) throw errorAcceso(409, "Ya tenés una propuesta pendiente para esta materia. Esperá a que administración la resuelva.");

    return tx.propuestaPrograma.create({
      data: {
        materiaId: datos.materiaId, docenteId: docente.id, contenidos: datos.contenidos,
        bibliografia: datos.bibliografia, motivo: datos.motivo, versionBase: programa?.version ?? 0,
      },
      select: DATOS_PROPUESTA,
    });
  }, { isolationLevel: "Serializable" });
}

// Texto del aviso al docente cuando administración resuelve su propuesta.
export function avisoPropuestaResuelta({ estado, materiaNombre, respuesta, version }) {
  const aprobada = estado === "APROBADA";
  const partes = [aprobada
    ? `Tu propuesta se publicó como la versión ${version} del programa.`
    : "Tu propuesta no se aplicó al programa."];
  if (respuesta) partes.push(`Respuesta de administración: ${respuesta}`);
  return {
    titulo: acortar(`Tu propuesta de cambio al programa de ${materiaNombre} fue ${aprobada ? "aprobada" : "rechazada"}`, 120),
    mensaje: partes.join(" "),
  };
}

// Resuelve una propuesta pendiente. Todo en una transacción: el cambio al programa, el estado de la propuesta,
// el registro de quién modificó el material y el aviso al docente se guardan juntos o no se guarda ninguno.
export function resolverPropuesta(db, { id, admin, resolucion }) {
  return db.$transaction(async (tx) => {
    const propuesta = await tx.propuestaPrograma.findUnique({
      where: { id },
      include: {
        materia: { select: { id: true, nombre: true, codigo: true, programaUrl: true } },
        docente: { select: { id: true, nombre: true, apellido: true } },
      },
    });
    if (!propuesta) throw errorAcceso(404, "La propuesta no existe.");
    if (propuesta.estado !== "PENDIENTE") throw errorAcceso(409, "Esa propuesta ya fue resuelta.");

    let version = null;
    if (resolucion.estado === "APROBADA") {
      const autor = `${propuesta.docente.nombre} ${propuesta.docente.apellido}`;
      const programa = await tx.programa.findUnique({ where: { materiaId: propuesta.materiaId } });

      if (propuesta.versionBase === 0) {
        // La propuesta era el programa inicial: solo vale si nadie lo cargó mientras tanto.
        if (programa) throw errorAcceso(409, "La materia ya tiene un programa cargado desde que se hizo la propuesta. Rechazala o revisá el programa vigente.");
        const pdfActual = propuesta.materia.programaUrl ?? null;
        if (pdfActual && !resolucion.reemplazarPdf) throw errorAcceso(409, "Confirmá que la descarga debe usar el texto propuesto en lugar del PDF cargado.");
        await tx.programa.create({
          data: { materiaId: propuesta.materiaId, contenidos: propuesta.contenidos, bibliografia: propuesta.bibliografia, version: 1, vigente: true },
        });
        // Retira solo la asociación: la descarga generará el PDF con el texto vigente.
        if (pdfActual) await tx.materia.update({ where: { id: propuesta.materiaId }, data: { programaUrl: null } });
        await registrarCambio(tx, {
          materiaId: propuesta.materiaId, autorId: admin.id, accion: "PROGRAMA_SUBIDO",
          detalle: `Se publicó el programa en texto (versión 1) a partir de la propuesta de ${autor}.${pdfActual ? " La descarga PDF ahora se genera desde el texto vigente." : ""}`,
        });
        version = 1;
      } else {
        if (!programa) throw errorAcceso(409, "El programa de la materia ya no existe. Rechazá la propuesta.");
        if (programa.version !== propuesta.versionBase) {
          throw errorAcceso(409, `El programa cambió (ahora es la versión ${programa.version}) desde que se hizo la propuesta, que partía de la versión ${propuesta.versionBase}. Rechazala, o aplicá los cambios a mano desde «Actualizar programa».`);
        }
        const actualizado = await aplicarActualizacion(tx, {
          id: programa.id, autorId: admin.id,
          datos: {
            contenidos: propuesta.contenidos, bibliografia: propuesta.bibliografia, version: programa.version,
            reemplazarPdf: resolucion.reemplazarPdf, pdfEsperado: propuesta.materia.programaUrl ?? null,
          },
          origen: `Aprobó la propuesta de ${autor}.`,
        });
        version = actualizado.version;
      }
    }

    const resuelta = await tx.propuestaPrograma.update({
      where: { id },
      data: { estado: resolucion.estado, respuesta: resolucion.respuesta, resueltaEn: new Date(), resueltaPorId: admin.id },
      select: DATOS_PROPUESTA,
    });
    await crearNotificacionesIndividuales(tx, [{
      usuarioId: propuesta.docenteId, tipo: "PROPUESTA_PROGRAMA_RESUELTA", materiaId: propuesta.materiaId, autorId: admin.id,
      seccion: SECCION_PROPUESTAS_DOCENTE,
      ...avisoPropuestaResuelta({ estado: resolucion.estado, materiaNombre: propuesta.materia.nombre, respuesta: resolucion.respuesta, version }),
    }]);
    return resuelta;
  }, { isolationLevel: "Serializable" });
}

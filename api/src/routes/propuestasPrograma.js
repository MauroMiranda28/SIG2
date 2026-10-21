import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorAcceso, validarId } from "../services/docentes.js";
import {
  DATOS_PROPUESTA, MAX_PROPUESTAS_POR_LISTADO, crearPropuesta, resolverPropuesta, validarPropuesta, validarResolucionPropuesta,
} from "../services/propuestasPrograma.js";

// Propuestas de cambio al programa. El docente propone sobre las materias que dicta y ve el estado de las suyas;
// administración las revisa, las aprueba (se publica como nueva versión del programa) o las rechaza con una respuesta.
// El docente sale siempre del token: nadie ve ni propone en nombre de otro.
export function crearRouterPropuestasPrograma(db = prisma) {
  const router = Router();
  router.use(requiereAuth);

  const traducirConflicto = (e, res, next) => (e.code === "P2034"
    ? res.status(409).json({ error: "Hubo otra operación simultánea sobre el programa. Volvé a intentarlo." })
    : next(e));

  // ---------- Docente ----------

  // Las propuestas del docente, de la más nueva a la más vieja (opcionalmente solo las de una materia).
  router.get("/mias", requiereRol("DOCENTE"), async (req, res, next) => {
    try {
      const materiaId = req.query.materiaId ? validarId(req.query.materiaId, "identificador de la materia") : null;
      res.json(await db.propuestaPrograma.findMany({
        where: { docenteId: req.usuario.id, ...(materiaId ? { materiaId } : {}) },
        select: DATOS_PROPUESTA,
        orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
        take: MAX_PROPUESTAS_POR_LISTADO,
      }));
    } catch (e) { next(e); }
  });

  router.post("/", requiereRol("DOCENTE"), async (req, res, next) => {
    try {
      const datos = validarPropuesta(req.body);
      res.status(201).json(await crearPropuesta(db, { docente: req.usuario, datos }));
    } catch (e) { traducirConflicto(e, res, next); }
  });

  // ---------- Administración ----------

  // Pendientes por defecto (`?estado=TODAS` trae también las resueltas). Cada una trae el programa vigente para
  // compararlo con lo propuesto y si quedó desactualizada (el programa cambió después de proponer).
  router.get("/", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      const estado = req.query.estado ?? "PENDIENTE";
      if (!["PENDIENTE", "TODAS"].includes(estado)) throw errorAcceso(400, "El filtro de estado tiene que ser PENDIENTE o TODAS.");
      const propuestas = await db.propuestaPrograma.findMany({
        where: estado === "PENDIENTE" ? { estado: "PENDIENTE" } : {},
        select: {
          ...DATOS_PROPUESTA,
          docente: { select: { id: true, nombre: true, apellido: true, email: true } },
          materia: {
            select: {
              id: true, nombre: true, codigo: true, programaUrl: true,
              programa: { select: { contenidos: true, bibliografia: true, version: true } },
            },
          },
        },
        orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
        take: MAX_PROPUESTAS_POR_LISTADO,
      });

      res.json(propuestas
        .map(({ materia: { programaUrl, programa, ...materia }, ...propuesta }) => ({
          ...propuesta,
          materia: { ...materia, tienePdf: Boolean(programaUrl) }, // no se expone el nombre del archivo del servidor
          programaActual: programa,
          desactualizada: propuesta.estado === "PENDIENTE" && (programa?.version ?? 0) !== propuesta.versionBase,
        }))
        .sort((a, b) => (a.estado === "PENDIENTE" ? 0 : 1) - (b.estado === "PENDIENTE" ? 0 : 1)));
    } catch (e) { next(e); }
  });

  router.patch("/:id/resolver", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador de la propuesta");
      const resolucion = validarResolucionPropuesta(req.body);
      res.json(await resolverPropuesta(db, { id, admin: req.usuario, resolucion }));
    } catch (e) { traducirConflicto(e, res, next); }
  });

  return router;
}

export default crearRouterPropuestasPrograma();

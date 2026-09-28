import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorRevision, validarSolicitudRevision } from "../services/revisiones.js";

const DATOS_SOLICITUD = {
  id: true,
  motivo: true,
  estado: true,
  creadoEn: true,
  evaluacion: {
    select: {
      id: true, tipo: true, nota: true, fecha: true,
      cursada: { select: { materia: { select: { nombre: true, codigo: true } } } },
    },
  },
};

function aplanar({ evaluacion, ...solicitud }) {
  const { cursada, ...datosEvaluacion } = evaluacion;
  return { ...solicitud, evaluacion: { ...datosEvaluacion, materia: cursada.materia } };
}

// El alumno reclama formalmente una evaluación si considera que hay un error
// de calificación. La resolución (aceptar/rechazar) queda para una historia
// de docente que todavía no existe.
export function crearRouterRevisiones(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ALUMNO"));

  router.get("/mis-solicitudes", async (req, res, next) => {
    try {
      const solicitudes = await db.solicitudRevision.findMany({
        where: { alumnoId: req.usuario.id },
        select: DATOS_SOLICITUD,
        orderBy: { creadoEn: "desc" },
      });
      res.json(solicitudes.map(aplanar));
    } catch (e) { next(e); }
  });

  router.post("/", async (req, res, next) => {
    try {
      const { evaluacionId, motivo } = validarSolicitudRevision(req.body);

      const evaluacion = await db.evaluacion.findFirst({
        where: { id: evaluacionId, cursada: { alumnoId: req.usuario.id } },
        select: { id: true },
      });
      if (!evaluacion) throw errorRevision(404, "Esa evaluación no existe o no te pertenece.");

      const yaExiste = await db.solicitudRevision.findFirst({
        where: { evaluacionId, alumnoId: req.usuario.id, estado: "PENDIENTE" },
        select: { id: true },
      });
      if (yaExiste) throw errorRevision(409, "Ya tenés una solicitud pendiente para esta evaluación.");

      const solicitud = await db.solicitudRevision.create({
        data: { evaluacionId, alumnoId: req.usuario.id, motivo },
        select: DATOS_SOLICITUD,
      });
      res.status(201).json(aplanar(solicitud));
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterRevisiones();

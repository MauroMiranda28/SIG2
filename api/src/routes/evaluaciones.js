import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";

// Historial de notas: todas las evaluaciones (parciales, recuperatorios,
// finales, trabajos prácticos) de las materias que el alumno cursó o cursa,
// para hacer seguimiento de su rendimiento a lo largo del tiempo.
export function crearRouterEvaluaciones(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ALUMNO"));

  router.get("/", async (req, res, next) => {
    try {
      const evaluaciones = await db.evaluacion.findMany({
        where: { cursada: { alumnoId: req.usuario.id } },
        include: {
          cursada: { include: { materia: { select: { id: true, nombre: true, codigo: true } } } },
          // Si el docente corrigió la nota, el alumno ve el valor anterior y el motivo.
          cambios: { select: { notaAnterior: true, notaNueva: true, motivo: true, creadoEn: true }, orderBy: { creadoEn: "desc" } },
        },
        orderBy: { fecha: "desc" },
      });

      res.json(evaluaciones.map(({ cursada, ...evaluacion }) => ({
        ...evaluacion,
        materia: cursada.materia,
      })));
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterEvaluaciones();

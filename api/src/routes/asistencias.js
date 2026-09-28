import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { calcularPresentismo, errorAsistencia, validarAsistencia } from "../services/asistencias.js";

// El propio alumno asienta su estado de asistencia clase por clase, para
// llevar un control estricto de su presentismo diario.
export function crearRouterAsistencias(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ALUMNO"));

  router.get("/", async (req, res, next) => {
    try {
      const asistencias = await db.asistencia.findMany({
        where: { alumnoId: req.usuario.id },
        include: { materia: { select: { id: true, nombre: true, codigo: true } } },
        orderBy: { fecha: "desc" },
      });
      res.json({ asistencias, presentismo: calcularPresentismo(asistencias) });
    } catch (e) { next(e); }
  });

  // Crea o actualiza (si ya habías asentado esa materia y fecha, se pisa) el
  // estado de asistencia de una clase puntual.
  router.post("/", async (req, res, next) => {
    try {
      const { materiaId, fecha, estado } = validarAsistencia(req.body);

      const cursando = await db.cursada.findFirst({
        where: { alumnoId: req.usuario.id, materiaId, estado: "EN_CURSO" },
        select: { id: true },
      });
      if (!cursando) throw errorAsistencia(404, "Esa materia no está entre las que estás cursando.");

      const asistencia = await db.asistencia.upsert({
        where: { alumnoId_materiaId_fecha: { alumnoId: req.usuario.id, materiaId, fecha } },
        update: { estado },
        create: { alumnoId: req.usuario.id, materiaId, fecha, estado },
        include: { materia: { select: { id: true, nombre: true, codigo: true } } },
      });
      res.status(201).json(asistencia);
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterAsistencias();

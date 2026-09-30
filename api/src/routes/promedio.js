import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { resolverPlanAlumno } from "../services/planes.js";
import { errorPromedio, simularPromedio, validarMateriaId, validarNotaSimulada } from "../services/promedio.js";

// Inyección de DB para probar el contrato HTTP sin credenciales reales (igual que planes/carreras).
export function crearRouterPromedio(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ALUMNO"));

  // Promedio actual (materias aprobadas) + materias pendientes que se pueden simular.
  router.get("/", async (req, res, next) => {
    try {
      const planId = await resolverPlanAlumno(db, req.usuario.id);

      const cursadas = await db.cursada.findMany({
        where: { alumnoId: req.usuario.id, estado: "APROBADA" },
        select: { nota: true },
      });
      const notasAprobadas = cursadas.map((c) => c.nota).filter((n) => n != null);

      const materiasPendientes = await db.materia.findMany({
        where: {
          planId,
          NOT: { cursadas: { some: { alumnoId: req.usuario.id, estado: "APROBADA" } } },
        },
        select: { id: true, nombre: true, codigo: true },
        orderBy: { nombre: "asc" },
      });

      res.json({
        promedioActual: notasAprobadas.length
          ? Math.round((notasAprobadas.reduce((a, n) => a + n, 0) / notasAprobadas.length) * 100) / 100
          : null,
        materiasPendientes,
      });
    } catch (e) { next(e); }
  });

  // Simula aprobar una materia pendiente con una nota hipotética y devuelve
  // cómo quedaría el promedio.
  router.post("/simular", async (req, res, next) => {
    try {
      const materiaId = validarMateriaId(req.body?.materiaId);
      const nota = validarNotaSimulada(req.body?.nota);
      const planId = await resolverPlanAlumno(db, req.usuario.id);

      const materia = await db.materia.findFirst({
        where: { id: materiaId, planId },
        select: {
          id: true, nombre: true, codigo: true,
          cursadas: { where: { alumnoId: req.usuario.id }, select: { estado: true } },
        },
      });
      if (!materia) throw errorPromedio(404, "Esa materia no pertenece a tu plan de estudios.");
      if (materia.cursadas[0]?.estado === "APROBADA") {
        throw errorPromedio(409, "Esa materia ya está aprobada; simulá con una que todavía tengas pendiente.");
      }

      const cursadasAprobadas = await db.cursada.findMany({
        where: { alumnoId: req.usuario.id, estado: "APROBADA" },
        select: { nota: true },
      });
      const notasAprobadas = cursadasAprobadas.map((c) => c.nota).filter((n) => n != null);

      const { promedioActual, promedioSimulado, diferencia } = simularPromedio(notasAprobadas, nota);
      res.json({
        materia: { id: materia.id, nombre: materia.nombre, codigo: materia.codigo },
        notaSimulada: nota,
        promedioActual,
        promedioSimulado,
        diferencia,
      });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterPromedio();

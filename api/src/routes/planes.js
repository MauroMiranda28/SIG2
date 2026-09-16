import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { resolverPlanAlumno, validarPlan, errorPlan } from "../services/planes.js";

// Inyección de DB para probar el contrato HTTP sin credenciales reales.
export function crearRouterPlanes(db = prisma) {
  const router = Router();
  router.use(requiereAuth);

  router.get("/mi-plan", requiereRol("ALUMNO"), async (req, res, next) => {
    try {
      const id = await resolverPlanAlumno(db, req.usuario.id);
      const plan = await db.planEstudio.findUnique({
        where: { id },
        include: {
          carrera: { select: { id: true, nombre: true, codigo: true } },
          materias: { orderBy: [{ anio: "asc" }, { cuatrimestre: "asc" }, { nombre: "asc" }] },
        },
      });
      if (!plan) throw errorPlan(404, "El plan ya no está disponible.");
      res.json(plan);
    } catch (e) { next(e); }
  });

  // Catálogo necesario para crear planes; no reemplaza el módulo de carreras.
  router.get("/carreras", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      res.json(await db.carrera.findMany({ where: { vigente: true }, select: { id: true, nombre: true, codigo: true }, orderBy: { nombre: "asc" } }));
    } catch (e) { next(e); }
  });

  router.post("/", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      const { materias, ...datos } = validarPlan(req.body);
      const plan = await db.$transaction(async (tx) => {
        const carrera = await tx.carrera.findUnique({ where: { id: datos.carreraId } });
        if (!carrera?.vigente) throw errorPlan(400, "La carrera no existe o no está vigente.");
        const repetido = await tx.planEstudio.findFirst({ where: { carreraId: datos.carreraId, anio: datos.anio, nombre: { equals: datos.nombre, mode: "insensitive" } } });
        if (repetido) throw errorPlan(409, "Ya existe un plan con ese nombre y año en la carrera.");
        return tx.planEstudio.create({ data: { ...datos, materias: { create: materias } }, include: { materias: true, carrera: true } });
      }, { isolationLevel: "Serializable" });
      res.status(201).json(plan);
    } catch (e) {
      if (e.code === "P2002") return res.status(409).json({ error: "Uno de los códigos de materia ya existe. Los códigos son únicos en todo el sistema." });
      if (e.code === "P2034") return res.status(409).json({ error: "Hubo otra carga simultánea. Revisá los datos e intentá guardar nuevamente." });
      next(e);
    }
  });
  return router;
}
export default crearRouterPlanes();

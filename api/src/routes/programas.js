import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";

function validarPrograma(body) {
  const { materiaId, contenidos, bibliografia } = body ?? {};
  if (!Number.isInteger(materiaId) || materiaId < 1 || materiaId > 2147483647) {
    return { error: "Seleccioná una materia válida." };
  }
  if (typeof contenidos !== "string" || !contenidos.trim() || contenidos.length > 20000) {
    return { error: "Los contenidos son obligatorios y admiten hasta 20000 caracteres." };
  }
  if (bibliografia != null && (typeof bibliografia !== "string" || bibliografia.length > 10000)) {
    return { error: "La bibliografía debe ser texto de hasta 10000 caracteres." };
  }
  return { data: { materiaId, contenidos: contenidos.trim(), bibliografia: bibliografia?.trim() || null, vigente: true, version: 1 } };
}

export function crearRouterProgramas(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ADMIN"));

  // El administrador no necesita tener una carrera personal asignada.
  router.get("/materias", async (req, res, next) => {
    try {
      const materias = await db.materia.findMany({
        select: {
          id: true, nombre: true, codigo: true, programaUrl: true,
          plan: { select: { id: true, nombre: true, anio: true, carrera: { select: { id: true, nombre: true } } } },
          programa: { select: { id: true, vigente: true, version: true } },
        },
        orderBy: [{ nombre: "asc" }, { codigo: "asc" }],
      });
      res.json(materias);
    } catch (e) { next(e); }
  });

  router.post("/", async (req, res, next) => {
    const { data, error } = validarPrograma(req.body);
    if (error) return res.status(400).json({ error });
    try {
      const materia = await db.materia.findUnique({ where: { id: data.materiaId }, select: { id: true } });
      if (!materia) return res.status(404).json({ error: "La materia seleccionada ya no existe." });
      // La restricción única de materiaId también evita duplicados entre dos administradores simultáneos.
      const programa = await db.programa.create({ data });
      res.status(201).json(programa);
    } catch (e) {
      if (e.code === "P2002") return res.status(409).json({ error: "Esta materia ya tiene un programa cargado. No se reemplazó su contenido." });
      if (e.code === "P2003") return res.status(404).json({ error: "La materia seleccionada ya no existe." });
      next(e);
    }
  });
  return router;
}

export default crearRouterProgramas();

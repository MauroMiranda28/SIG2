import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import {
  validarCarrera,
  validarCambiosCarrera,
  validarIdCarrera,
  buscarDuplicado,
  errorCarrera,
} from "../services/carreras.js";

const DATOS_CARRERA = {
  id: true,
  nombre: true,
  codigo: true,
  descripcion: true,
  vigente: true,
  _count: { select: { planes: true, usuarios: true } },
};

// Errores de Prisma que tienen sentido para el usuario.
function traducirErrorPrisma(e, res) {
  if (e.code === "P2002") return res.status(409).json({ error: "Ya existe una carrera con ese código." });
  if (e.code === "P2025") return res.status(404).json({ error: "La carrera no existe." });
  if (e.code === "P2034") return res.status(409).json({ error: "Hubo otra carga simultánea. Revisá los datos e intentá guardar nuevamente." });
  return null;
}

// Inyección de DB para probar el contrato HTTP sin credenciales reales (igual que planes).
export function crearRouterCarreras(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ADMIN"));

  // Listado completo (vigentes y no vigentes) para la pantalla de administración.
  // El catálogo de vigentes para formularios sigue en GET /api/planes/carreras.
  router.get("/", async (req, res, next) => {
    try {
      res.json(await db.carrera.findMany({ select: DATOS_CARRERA, orderBy: { nombre: "asc" } }));
    } catch (e) { next(e); }
  });

  // Registrar carrera
  router.post("/", async (req, res, next) => {
    try {
      const datos = validarCarrera(req.body);
      const carrera = await db.$transaction(async (tx) => {
        await buscarDuplicado(tx, datos);
        return tx.carrera.create({ data: datos, select: DATOS_CARRERA }); // vigente = true por defecto
      }, { isolationLevel: "Serializable" });
      res.status(201).json(carrera);
    } catch (e) {
      if (!traducirErrorPrisma(e, res)) next(e);
    }
  });

  // Modificar carrera: solo cambia los campos enviados.
  router.patch("/:id", async (req, res, next) => {
    try {
      const id = validarIdCarrera(req.params.id);
      const cambios = validarCambiosCarrera(req.body);
      const carrera = await db.$transaction(async (tx) => {
        const actual = await tx.carrera.findUnique({ where: { id }, select: { id: true } });
        if (!actual) throw errorCarrera(404, "La carrera no existe.");
        await buscarDuplicado(tx, cambios, id);
        // Planes, materias y alumnos apuntan al id, así que cambiar nombre o código no los desvincula.
        return tx.carrera.update({ where: { id }, data: cambios, select: DATOS_CARRERA });
      }, { isolationLevel: "Serializable" });
      res.json(carrera);
    } catch (e) {
      if (!traducirErrorPrisma(e, res)) next(e);
    }
  });

  return router;
}

export default crearRouterCarreras();

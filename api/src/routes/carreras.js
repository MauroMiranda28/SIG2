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

function traducirErrorPrisma(e, res) {
  if (e.code === "P2002") return res.status(409).json({ error: "Ya existe una carrera con ese código." });
  if (e.code === "P2025") return res.status(404).json({ error: "La carrera no existe." });
  if (e.code === "P2034") return res.status(409).json({ error: "Hubo otra carga simultánea. Revisá los datos e intentá guardar nuevamente." });
  return null;
}

export function crearRouterCarreras(db = prisma) {
  const router = Router();

  // ==========================================
  // RUTAS PARA ALUMNOS (Solo requieren Auth)
  // ==========================================

  // GET: Consultar información de la carrera del alumno
  router.get('/mi-carrera', requiereAuth, async (req, res) => {
    // Validamos la sesión del alumno
    const carreraId = req.usuario?.carreraId || req.user?.carreraId; 
    if (!carreraId) return res.status(404).json({ error: "No tienes una carrera asignada" });

    try {
      const carreraInfo = await db.carrera.findUnique({
        where: { id: parseInt(carreraId) }
      });
      res.json(carreraInfo);
    } catch (error) {
      res.status(500).json({ error: "Error al obtener la información de la carrera" });
    }
  });

  // ==========================================
  // RUTAS PARA ADMIN IT
  // ==========================================
  router.use(requiereAuth, requiereRol("ADMIN"));

  router.get("/", async (req, res, next) => {
    try {
      res.json(await db.carrera.findMany({ select: DATOS_CARRERA, orderBy: { nombre: "asc" } }));
    } catch (e) { next(e); }
  });

  router.post("/", async (req, res, next) => {
    try {
      const datos = validarCarrera(req.body);
      const carrera = await db.$transaction(async (tx) => {
        await buscarDuplicado(tx, datos);
        return tx.carrera.create({ data: datos, select: DATOS_CARRERA });
      }, { isolationLevel: "Serializable" });
      res.status(201).json(carrera);
    } catch (e) {
      if (!traducirErrorPrisma(e, res)) next(e);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const id = validarIdCarrera(req.params.id);
      const cambios = validarCambiosCarrera(req.body);
      const carrera = await db.$transaction(async (tx) => {
        const actual = await tx.carrera.findUnique({ where: { id }, select: { id: true } });
        if (!actual) throw errorCarrera(404, "La carrera no existe.");
        await buscarDuplicado(tx, cambios, id);
        return tx.carrera.update({ where: { id }, data: cambios, select: DATOS_CARRERA });
      }, { isolationLevel: "Serializable" });
      res.json(carrera);
    } catch (e) {
      if (!traducirErrorPrisma(e, res)) next(e);
    }
  });

  // PUT: Deshabilitar/Habilitar carrera (Admin IT)
  router.put('/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { vigente } = req.body; 
    try {
      const carrera = await db.carrera.update({
        where: { id: parseInt(id) },
        data: { vigente },
        select: DATOS_CARRERA
      });
      res.json(carrera);
    } catch (error) {
      res.status(500).json({ error: "Error al cambiar estado de la carrera" });
    }
  });

  return router;
}

export default crearRouterCarreras();
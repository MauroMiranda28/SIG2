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

  // Consulta la asignación actual en DB, no un carreraId enviado por el cliente.
  router.get("/mi-carrera", requiereAuth, requiereRol("ALUMNO"), async (req, res, next) => {
    try {
      const alumno = await db.usuario.findUnique({
        where: { id: req.usuario.id },
        select: { carrera: { select: { id: true, nombre: true, codigo: true, descripcion: true, vigente: true } } },
      });
      if (!alumno) return res.status(401).json({ error: "El usuario ya no existe. Volvé a iniciar sesión." });
      if (!alumno.carrera) return res.status(404).json({ error: "Todavía no tenés una carrera asignada. Consultá a administración." });
      res.json(alumno.carrera);
    } catch (e) { next(e); }
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
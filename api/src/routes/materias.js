import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js"; // <- Agregamos requiereRol
import multer from 'multer';
const upload = multer({ dest: 'uploads/programas/' });

import { resolverPlanAlumno } from "../services/planes.js";

const router = Router();

// Mat-01: materias de la carrera del alumno, con el estado de cursada de cada una
// Mat-08: búsqueda por nombre o código con ?q=
router.get("/", requiereAuth, async (req, res, next) => {
  try {
    const planId = await resolverPlanAlumno(prisma, req.usuario.id);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const materias = await prisma.materia.findMany({
      where: {
        planId,
        ...(q ? {
          OR: [
            { nombre: { contains: q, mode: "insensitive" } },
            { codigo: { contains: q, mode: "insensitive" } },
          ],
        } : {}),
      },
      include: {
        cursadas: {
          where: { alumnoId: req.usuario.id },
          select: { estado: true, nota: true },
        },
      },
      orderBy: [{ anio: "asc" }, { nombre: "asc" }],
    });

    const materiasConEstado = materias.map(({ cursadas, ...materia }) => ({
      ...materia,
      estado: cursadas[0]?.estado ?? "PENDIENTE",
      nota: cursadas[0]?.nota ?? null,
    }));

    res.json(materiasConEstado);
  } catch (e) {
    next(e);
  }
});

// Mat-03: información de una materia
router.get("/:id", requiereAuth, async (req, res, next) => {
  try {
    const materia = await prisma.materia.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        plan: { include: { carrera: true } },
        programa: true,
        docentes: { include: { docente: { select: { nombre: true, apellido: true } } } },
      },
    });

    if (!materia) return res.status(404).json({ error: "No existe esa materia" });
    res.json(materia);
  } catch (e) {
    next(e);
  }
});

// HU-PRO: programa de una materia (contenidos y bibliografía en texto)
router.get("/:id/programa", requiereAuth, async (req, res, next) => {
  try {
    const materia = await prisma.materia.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        nombre: true,
        codigo: true,
        programa: {
          select: {
            contenidos: true,
            bibliografia: true,
            version: true,
            vigente: true,
            actualizadoEn: true,
          },
        },
      },
    });

    if (!materia) return res.status(404).json({ error: "No existe esa materia" });
    if (!materia.programa || !materia.programa.vigente) {
      return res.status(404).json({ error: "Esta materia todavía no tiene un programa vigente publicado" });
    }

    const { vigente, ...programa } = materia.programa;
    res.json({ materia: { nombre: materia.nombre, codigo: materia.codigo }, programa });
  } catch (e) {
    next(e);
  }
});

// Horarios U-01: comisiones de una materia con su horario
router.get("/:id/comisiones", requiereAuth, async (req, res, next) => {
  try {
    const materiaId = Number(req.params.id);

    const comisiones = await prisma.comision.findMany({
      where: { materiaId },
      include: {
        bloques: { include: { aula: true }, orderBy: [{ dia: "asc" }, { horaInicio: "asc" }] },
        inscripciones: { where: { alumnoId: req.usuario.id }, select: { id: true } },
      },
      orderBy: { nombre: "asc" },
    });

    const conElegida = comisiones.map(({ inscripciones, ...comision }) => ({
      ...comision,
      elegidaPorMi: inscripciones.length > 0,
    }));

    res.json(conElegida);
  } catch (e) {
    next(e);
  }
});

// ==========================================
// NUEVA RUTA PARA HISTORIA DE USUARIO
// ==========================================

// POST: Cargar programa de la materia en PDF (Admin IT)
router.post("/:id/programa", requiereAuth, requiereRol("ADMIN"), upload.single('archivo'), async (req, res) => {
  const { id } = req.params;
  const archivo = req.file;

  if (!archivo) return res.status(400).json({ error: "No se subió ningún archivo PDF" });

  try {
    const materia = await prisma.materia.update({
      where: { id: parseInt(id) },
      data: { programaUrl: archivo.path }
    });
    res.json({ mensaje: "Programa cargado con éxito", materia });
  } catch (error) {
    res.status(500).json({ error: "Error al guardar el programa en la base de datos" });
  }
});

export default router;
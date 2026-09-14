import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth } from "../middleware/auth.js";

const router = Router();

// Mat-01: materias de la carrera del alumno
router.get("/", requiereAuth, async (req, res, next) => {
  try {
    const { carreraId } = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: { carreraId: true },
    });

    const materias = await prisma.materia.findMany({
      where: { plan: { carreraId, vigente: true } },
      orderBy: [{ anio: "asc" }, { nombre: "asc" }],
    });

    res.json(materias);
  } catch (e) {
    next(e);
  }
});

// Mat-03: información de una materia  <-- ESTA ES TUYA
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

export default router;

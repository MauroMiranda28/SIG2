import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth } from "../middleware/auth.js";

const router = Router();

// Mat-01: materias de la carrera del alumno, con el estado de cursada de cada una
router.get("/", requiereAuth, async (req, res, next) => {
  try {
    const { carreraId } = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: { carreraId: true },
    });

    const materias = await prisma.materia.findMany({
      where: { plan: { carreraId, vigente: true } },
      include: {
        cursadas: {
          where: { alumnoId: req.usuario.id },
          select: { estado: true, nota: true },
        },
      },
      orderBy: [{ anio: "asc" }, { nombre: "asc" }],
    });

    // Aplana la cursada del alumno (o PENDIENTE si nunca la cursó) en vez de
    // devolver el array de relación tal cual.
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

// HU-PRO: programa de una materia (contenidos y bibliografía)
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

export default router;
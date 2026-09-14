import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";

const router = Router();

// Horarios U-01: grilla semanal de una comisión  <-- ESTA ES TUYA
router.get("/comision/:id", requiereAuth, async (req, res, next) => {
  try {
    const bloques = await prisma.bloqueHorario.findMany({
      where: { comisionId: Number(req.params.id) },
      include: { aula: true, comision: { include: { materia: true } } },
      orderBy: [{ dia: "asc" }, { horaInicio: "asc" }],
    });
    res.json(bloques);
  } catch (e) {
    next(e);
  }
});

// Carga de bloque horario + aula.
// OJO: la historia dice "Como estudiante", pero cargar aulas es tarea de
// gestión. Queda restringido a DOCENTE/ADMIN hasta que el grupo lo defina.
router.post("/", requiereAuth, requiereRol("DOCENTE", "ADMIN"), async (req, res, next) => {
  try {
    const { comisionId, dia, horaInicio, horaFin, aulaId } = req.body;

    // TODO: validar superposición antes de crear (parte de la historia)
    const bloque = await prisma.bloqueHorario.create({
      data: { comisionId, dia, horaInicio, horaFin, aulaId },
    });

    res.status(201).json(bloque);
  } catch (e) {
    next(e);
  }
});

export default router;

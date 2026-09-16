import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";

const router = Router();

// Dos bloques se pisan si caen el mismo día y sus rangos horarios se cruzan.
// "HH:MM" compara bien como string porque siempre tiene 2 dígitos.
function seSuperponen(a, b) {
  return a.dia === b.dia && a.horaInicio < b.horaFin && a.horaFin > b.horaInicio;
}

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
// gestión. Queda restringido a DOCENTE/ADMIN. Lo que sí hace el estudiante es
// elegir con qué comisión cursa cada materia (ver POST /inscripcion), y ahí
// se arma su grilla y se controlan las superposiciones.
router.post("/", requiereAuth, requiereRol("DOCENTE", "ADMIN"), async (req, res, next) => {
  try {
    const { comisionId, dia, horaInicio, horaFin, aulaId } = req.body;

    if (aulaId) {
      const bloquesDelAula = await prisma.bloqueHorario.findMany({ where: { aulaId } });
      const choque = bloquesDelAula.find((b) => seSuperponen(b, { dia, horaInicio, horaFin }));
      if (choque) {
        return res.status(409).json({ error: "Esa aula ya tiene otro bloque asignado en ese horario" });
      }
    }

    const bloque = await prisma.bloqueHorario.create({
      data: { comisionId, dia, horaInicio, horaFin, aulaId },
    });

    res.status(201).json(bloque);
  } catch (e) {
    next(e);
  }
});

// Horarios U-01: el alumno elige la comisión con la que cursa una materia.
// Si ya tenía otra comisión elegida para esa misma materia, la reemplaza.
// Antes de guardar, chequea que los bloques de la comisión nueva no se
// superpongan con los de otra materia que ya tenga elegida.
router.post("/inscripcion", requiereAuth, async (req, res, next) => {
  try {
    const { comisionId } = req.body;

    const comisionElegida = await prisma.comision.findUnique({
      where: { id: comisionId },
      include: { bloques: true },
    });
    if (!comisionElegida) return res.status(404).json({ error: "No existe esa comisión" });

    const otrasInscripciones = await prisma.inscripcionComision.findMany({
      where: {
        alumnoId: req.usuario.id,
        comision: { materiaId: { not: comisionElegida.materiaId } },
      },
      include: { comision: { include: { bloques: true, materia: { select: { nombre: true } } } } },
    });

    for (const inscripcion of otrasInscripciones) {
      for (const bloqueExistente of inscripcion.comision.bloques) {
        const choque = comisionElegida.bloques.find((b) => seSuperponen(b, bloqueExistente));
        if (choque) {
          return res.status(409).json({
            error: `Se superpone con ${inscripcion.comision.materia.nombre} (${inscripcion.comision.nombre}) el ${choque.dia}`,
          });
        }
      }
    }

    const inscripcion = await prisma.$transaction(async (tx) => {
      await tx.inscripcionComision.deleteMany({
        where: { alumnoId: req.usuario.id, comision: { materiaId: comisionElegida.materiaId } },
      });
      return tx.inscripcionComision.create({
        data: { alumnoId: req.usuario.id, comisionId },
      });
    });

    res.status(201).json(inscripcion);
  } catch (e) {
    next(e);
  }
});

// Horarios U-01: grilla semanal armada con las comisiones que el alumno eligió.
router.get("/mi-grilla", requiereAuth, async (req, res, next) => {
  try {
    const inscripciones = await prisma.inscripcionComision.findMany({
      where: { alumnoId: req.usuario.id },
      include: {
        comision: {
          include: {
            materia: { select: { id: true, nombre: true, codigo: true } },
            bloques: { include: { aula: true } },
          },
        },
      },
    });

    const bloques = inscripciones.flatMap(({ comision }) =>
      comision.bloques.map((bloque) => ({
        dia: bloque.dia,
        horaInicio: bloque.horaInicio,
        horaFin: bloque.horaFin,
        aula: bloque.aula?.nombre ?? null,
        materia: comision.materia.nombre,
        comision: comision.nombre,
      }))
    );

    res.json(bloques);
  } catch (e) {
    next(e);
  }
});

export default router;

import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { validarBloqueHorario, verificarAccesoMateria, validarId, errorAcceso } from "../services/docentes.js";
import { crearBloqueConRegistro, quitarBloqueConRegistro } from "../services/auditoriaMateria.js";

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
// Seg-05: un DOCENTE solo puede cargar horarios en comisiones de materias que tiene asignadas.
router.post("/", requiereAuth, requiereRol("DOCENTE", "ADMIN"), async (req, res, next) => {
  try {
    const { comisionId, dia, horaInicio, horaFin, aulaId } = validarBloqueHorario(req.body);

    const comision = await prisma.comision.findUnique({ where: { id: comisionId }, select: { materiaId: true, nombre: true } });
    if (!comision) throw errorAcceso(404, "No existe esa comisión.");
    const materia = await verificarAccesoMateria(prisma, req.usuario, comision.materiaId);

    const aula = aulaId ? await prisma.aula.findUnique({ where: { id: aulaId }, select: { id: true, nombre: true } }) : null;
    if (aulaId && !aula) throw errorAcceso(400, "El aula elegida no existe.");

    if (aulaId) {
      const bloquesDelAula = await prisma.bloqueHorario.findMany({ where: { aulaId } });
      const choque = bloquesDelAula.find((b) => seSuperponen(b, { dia, horaInicio, horaFin }));
      if (choque) {
        return res.status(409).json({ error: "Esa aula ya tiene otro bloque asignado en ese horario" });
      }
    }

    // Quién lo cargó queda registrado en la misma transacción (CambioMateria), y los alumnos
    // inscriptos en la comisión reciben la notificación del cambio de horario.
    const bloque = await crearBloqueConRegistro(prisma, {
      bloque: { comisionId, dia, horaInicio, horaFin, aulaId },
      comisionNombre: comision.nombre,
      aulaNombre: aula?.nombre,
      materiaId: comision.materiaId,
      materiaNombre: materia.nombre,
      autorId: req.usuario.id,
    });

    res.status(201).json(bloque);
  } catch (e) {
    next(e);
  }
});

// Quitar un bloque horario (para corregir uno mal cargado). Mismo control de acceso que al cargar.
router.delete("/bloques/:id", requiereAuth, requiereRol("DOCENTE", "ADMIN"), async (req, res, next) => {
  try {
    const id = validarId(req.params.id, "identificador del bloque");
    const bloque = await prisma.bloqueHorario.findUnique({
      where: { id },
      select: {
        id: true, comisionId: true, dia: true, horaInicio: true, horaFin: true,
        aula: { select: { nombre: true } },
        comision: { select: { nombre: true, materiaId: true } },
      },
    });
    if (!bloque) throw errorAcceso(404, "No existe ese bloque horario.");
    const materia = await verificarAccesoMateria(prisma, req.usuario, bloque.comision.materiaId);

    await quitarBloqueConRegistro(prisma, { bloque, materiaId: materia.id, materiaNombre: materia.nombre, autorId: req.usuario.id });
    res.json({ ok: true });
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

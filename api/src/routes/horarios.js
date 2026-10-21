import { Router } from "express";
import { prisma } from "../db.js";
import { aniosCalendarioPublicados, claseOcurreEnFecha } from "../services/calendarioAcademico.js";
import { DIAS_SEMANA } from "../services/actividadesPersonales.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { validarBloqueHorario, verificarAccesoMateria, validarId, errorAcceso } from "../services/docentes.js";
import { crearBloqueConRegistro, quitarBloqueConRegistro } from "../services/auditoriaMateria.js";

const router = Router();

export function validarAsignacionDocente(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !("docenteId" in body)) {
    throw errorAcceso(400, "Indicá el docente asignado o null para dejar el bloque sin asignar.");
  }
  return body.docenteId == null || body.docenteId === ""
    ? null
    : validarId(body.docenteId, "identificador del docente");
}

export function docenteTieneSuperposicion(bloque, otrosBloques) {
  return otrosBloques.find((otro) =>
    otro.id !== bloque.id &&
    otro.dia === bloque.dia &&
    otro.horaInicio < bloque.horaFin &&
    otro.horaFin > bloque.horaInicio);
}

export function validarEleccionComision(cursada) {
  if (["REGULAR", "LIBRE", "APROBADA"].includes(cursada?.estado)) {
    throw errorAcceso(409, cursada.estado === "APROBADA"
      ? "La materia ya está aprobada; no podés elegir una comisión."
      : "La cursada ya finalizó; podés inscribirte a un examen final, pero no elegir una comisión.");
  }
}

export function crearRouterAsignacionesDocentes(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ADMIN"));

  router.get("/", async (req, res, next) => {
    try {
      const materias = await db.materia.findMany({
        select: {
          id: true,
          nombre: true,
          codigo: true,
          docentes: {
            select: {
              docente: { select: { id: true, nombre: true, apellido: true, email: true } },
            },
            orderBy: { docente: { apellido: "asc" } },
          },
          comisiones: {
            select: {
              id: true,
              nombre: true,
              bloques: {
                select: {
                  id: true,
                  dia: true,
                  horaInicio: true,
                  horaFin: true,
                  docenteId: true,
                  aula: { select: { nombre: true } },
                  docente: { select: { id: true, nombre: true, apellido: true } },
                },
                orderBy: [{ dia: "asc" }, { horaInicio: "asc" }],
              },
            },
            orderBy: { nombre: "asc" },
          },
        },
        orderBy: [{ nombre: "asc" }],
      });
      res.json(materias);
    } catch (e) {
      next(e);
    }
  });

  router.put("/bloques/:id/docente", async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador del bloque");
      const docenteId = validarAsignacionDocente(req.body);
      const bloque = await db.bloqueHorario.findUnique({
        where: { id },
        select: {
          id: true,
          dia: true,
          horaInicio: true,
          horaFin: true,
          comision: {
            select: {
              nombre: true,
              materiaId: true,
              materia: { select: { nombre: true } },
            },
          },
        },
      });
      if (!bloque) throw errorAcceso(404, "No existe ese bloque horario.");

      if (docenteId !== null) {
        const asignacion = await db.materiaDocente.findUnique({
          where: { materiaId_docenteId: { materiaId: bloque.comision.materiaId, docenteId } },
          select: { docenteId: true },
        });
        if (!asignacion) {
          throw errorAcceso(400, "El docente elegido no está asignado a esta materia.");
        }

        const otrosBloques = await db.bloqueHorario.findMany({
          where: { docenteId, dia: bloque.dia },
          select: {
            id: true,
            dia: true,
            horaInicio: true,
            horaFin: true,
            comision: { select: { nombre: true, materia: { select: { nombre: true } } } },
          },
        });
        const choque = docenteTieneSuperposicion(bloque, otrosBloques);
        if (choque) {
          throw errorAcceso(
            409,
            `El docente ya tiene ${choque.comision.materia.nombre} (${choque.comision.nombre}) asignada ese día entre ${choque.horaInicio} y ${choque.horaFin}.`,
          );
        }
      }

      const actualizado = await db.bloqueHorario.update({
        where: { id },
        data: { docenteId },
        select: {
          id: true,
          dia: true,
          horaInicio: true,
          horaFin: true,
          docenteId: true,
          docente: { select: { id: true, nombre: true, apellido: true } },
        },
      });
      res.json(actualizado);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

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
router.post("/inscripcion", requiereAuth, requiereRol("ALUMNO"), async (req, res, next) => {
  try {
    const { comisionId } = req.body;

    const comisionElegida = await prisma.comision.findUnique({
      where: { id: comisionId },
      include: { bloques: true },
    });
    if (!comisionElegida) return res.status(404).json({ error: "No existe esa comisión" });

    const cursada = await prisma.cursada.findUnique({
      where: { alumnoId_materiaId: { alumnoId: req.usuario.id, materiaId: comisionElegida.materiaId } },
      select: { estado: true },
    });
    // Quien ya cerró la cursada no elige comisión; y para cambiar de comisión hay que estar inscripto
    // a la materia (la inscripción, con «Inscribirme», es la que controla las correlatividades).
    validarEleccionComision(cursada);
    if (cursada?.estado !== "EN_CURSO") {
      return res.status(400).json({ error: "Primero inscribite a la materia con el botón «Inscribirme». Desde acá solo podés cambiar de comisión." });
    }

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
    const referencia = req.query.fecha ?? new Date().toISOString().slice(0, 10);
    if (typeof referencia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(referencia)) {
      throw errorAcceso(400, "Indicá una fecha válida para consultar la grilla.");
    }
    const diaReferencia = new Date(`${referencia}T00:00:00.000Z`);
    if (Number.isNaN(diaReferencia.getTime()) || diaReferencia.toISOString().slice(0, 10) !== referencia) {
      throw errorAcceso(400, "Indicá una fecha válida para consultar la grilla.");
    }
    const inicioSemana = new Date(diaReferencia);
    inicioSemana.setUTCDate(inicioSemana.getUTCDate() - ((inicioSemana.getUTCDay() + 6) % 7));
    const finSemana = new Date(inicioSemana);
    finSemana.setUTCDate(finSemana.getUTCDate() + 6);
    const aniosSemana = [...new Set([inicioSemana.getUTCFullYear(), finSemana.getUTCFullYear()])];
    const aniosPublicados = await aniosCalendarioPublicados(prisma, aniosSemana);
    const inscripciones = await prisma.inscripcionComision.findMany({
      where: { alumnoId: req.usuario.id },
      include: {
        comision: {
          include: {
            materia: {
              select: {
                id: true,
                nombre: true,
                codigo: true,
                cuatrimestre: true,
                cursadas: {
                  where: { alumnoId: req.usuario.id },
                  select: { estado: true },
                },
              },
            },
            bloques: { include: { aula: true } },
          },
        },
      },
    });
    const periodos = await prisma.periodoAcademico.findMany({
      where: {
        anio: { in: aniosPublicados },
        fechaInicio: { lte: finSemana },
        fechaFin: { gte: inicioSemana },
      },
      select: { anio: true, tipo: true, nombre: true, fechaInicio: true, fechaFin: true },
    });

    const cursando = inscripciones.filter(({ comision }) =>
      !["REGULAR", "LIBRE", "APROBADA"].includes(comision.materia.cursadas[0]?.estado));
    const bloques = cursando.flatMap(({ comision }) =>
      comision.bloques.filter((bloque) => {
        const fecha = new Date(inicioSemana);
        fecha.setUTCDate(fecha.getUTCDate() + DIAS_SEMANA.indexOf(bloque.dia));
        return claseOcurreEnFecha(comision.materia, fecha, periodos);
      }).map((bloque) => ({
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

import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorAcceso, requiereMateriaAsignada, validarId } from "../services/docentes.js";
import {
  DATOS_EXAMEN, avisarAlumnosDeExamen, avisoExamen, cambioRelevante, validarCambioExamen, validarNuevoExamen,
} from "../services/examenes.js";

const materiaDelParametro = (req) => validarId(req.params.id, "identificador de la materia");

// La materia de un examen se resuelve desde la base, nunca desde el body.
async function materiaDelExamen(req, db) {
  const id = validarId(req.params.id, "identificador del examen");
  const examen = await db.fechaExamen.findUnique({ where: { id }, select: { materiaId: true } });
  if (!examen) throw errorAcceso(404, "El examen no existe.");
  return examen.materiaId;
}

async function verificarAula(db, aulaId) {
  if (aulaId == null) return;
  if (!(await db.aula.findUnique({ where: { id: aulaId }, select: { id: true } }))) throw errorAcceso(400, "El aula elegida no existe.");
}

// El docente programa las fechas de parciales, recuperatorios y finales de las materias que tiene
// asignadas (Seg-05; ADMIN puede en cualquiera). Los alumnos de la materia reciben una notificación
// FECHA_EXAMEN cuando se carga, se reprograma o se cancela, en la misma transacción que el cambio.
export function crearRouterExamenes(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("DOCENTE", "ADMIN"));

  // Fechas ya programadas de la materia, de la más próxima a la más lejana.
  router.get("/materias/:id", requiereMateriaAsignada(db, materiaDelParametro), async (req, res, next) => {
    try {
      const examenes = await db.fechaExamen.findMany({
        where: { materiaId: req.materia.id }, select: DATOS_EXAMEN, orderBy: [{ fecha: "asc" }, { id: "asc" }],
      });
      res.json({ materia: req.materia, examenes });
    } catch (e) { next(e); }
  });

  router.post("/materias/:id", requiereMateriaAsignada(db, materiaDelParametro), async (req, res, next) => {
    try {
      const { tipo, fecha, hora, aulaId } = validarNuevoExamen(req.body);
      await verificarAula(db, aulaId);
      const examen = await db.$transaction(async (tx) => {
        const creado = await tx.fechaExamen.create({
          data: { tipo, fecha, hora, aulaId, materiaId: req.materia.id, creadoPorId: req.usuario.id }, select: DATOS_EXAMEN,
        });
        await avisarAlumnosDeExamen(tx, {
          materia: req.materia, autorId: req.usuario.id, aviso: avisoExamen({ accion: "NUEVO", materiaNombre: req.materia.nombre, examen: creado }),
        });
        return creado;
      });
      res.status(201).json(examen);
    } catch (e) { next(e); }
  });

  // Reprograma (fecha, hora o aula). Si no cambia nada, no avisa y responde 400.
  router.patch("/:id", requiereMateriaAsignada(db, materiaDelExamen), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador del examen");
      const cambios = validarCambioExamen(req.body);
      await verificarAula(db, cambios.aulaId);
      const actualizado = await db.$transaction(async (tx) => {
        const anterior = await tx.fechaExamen.findUnique({ where: { id }, select: DATOS_EXAMEN });
        if (!anterior) throw errorAcceso(404, "El examen no existe.");
        const nuevo = await tx.fechaExamen.update({ where: { id }, data: cambios, select: DATOS_EXAMEN });
        if (!cambioRelevante(anterior, nuevo)) throw errorAcceso(400, "Los datos nuevos son iguales a los actuales.");
        await avisarAlumnosDeExamen(tx, {
          materia: req.materia, autorId: req.usuario.id,
          aviso: avisoExamen({ accion: "REPROGRAMADO", materiaNombre: req.materia.nombre, examen: nuevo, anterior }),
        });
        return nuevo;
      });
      res.json(actualizado);
    } catch (e) { next(e); }
  });

  router.delete("/:id", requiereMateriaAsignada(db, materiaDelExamen), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador del examen");
      await db.$transaction(async (tx) => {
        const examen = await tx.fechaExamen.findUnique({ where: { id }, select: DATOS_EXAMEN });
        if (!examen) throw errorAcceso(404, "El examen no existe.");
        await tx.fechaExamen.delete({ where: { id } });
        await avisarAlumnosDeExamen(tx, {
          materia: req.materia, autorId: req.usuario.id, aviso: avisoExamen({ accion: "CANCELADO", materiaNombre: req.materia.nombre, examen }),
        });
      });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterExamenes();

import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorAcceso, requiereMateriaAsignada, validarId } from "../services/docentes.js";
import { DATOS_TAREA, validarCambioTarea, validarNuevaTarea } from "../services/tareas.js";

const materiaDelParametro = (req) => validarId(req.params.id, "identificador de la materia");

// La materia de una tarea se resuelve desde la base, nunca desde el body.
async function materiaDeLaTarea(req, db) {
  const id = validarId(req.params.id, "identificador de la tarea");
  const tarea = await db.tarea.findUnique({ where: { id }, select: { materiaId: true } });
  if (!tarea) throw errorAcceso(404, "La tarea no existe.");
  return tarea.materiaId;
}

// El docente carga las tareas de las materias que tiene asignadas (Seg-05; ADMIN puede en cualquiera).
// Los alumnos de la materia reciben el recordatorio cuando se acerca la entrega: lo genera
// GET /api/notificaciones (ver generarRecordatoriosEntrega en services/tareas.js).
export function crearRouterTareas(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("DOCENTE", "ADMIN"));

  // Tareas de la materia, de la entrega más próxima a la más lejana.
  router.get("/materias/:id", requiereMateriaAsignada(db, materiaDelParametro), async (req, res, next) => {
    try {
      const tareas = await db.tarea.findMany({
        where: { materiaId: req.materia.id }, select: DATOS_TAREA, orderBy: [{ fechaEntrega: "asc" }, { id: "asc" }],
      });
      res.json({ materia: req.materia, tareas });
    } catch (e) { next(e); }
  });

  router.post("/materias/:id", requiereMateriaAsignada(db, materiaDelParametro), async (req, res, next) => {
    try {
      const datos = validarNuevaTarea(req.body);
      const tarea = await db.tarea.create({
        data: { ...datos, materiaId: req.materia.id, creadaPorId: req.usuario.id }, select: DATOS_TAREA,
      });
      res.status(201).json(tarea);
    } catch (e) { next(e); }
  });

  router.patch("/:id", requiereMateriaAsignada(db, materiaDeLaTarea), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador de la tarea");
      res.json(await db.tarea.update({ where: { id }, data: validarCambioTarea(req.body), select: DATOS_TAREA }));
    } catch (e) { next(e); }
  });

  router.delete("/:id", requiereMateriaAsignada(db, materiaDeLaTarea), async (req, res, next) => {
    try {
      await db.tarea.delete({ where: { id: validarId(req.params.id, "identificador de la tarea") } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterTareas();

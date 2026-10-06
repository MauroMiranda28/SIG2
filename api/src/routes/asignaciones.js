import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorAcceso, validarId } from "../services/docentes.js";
import { DATOS_DOCENTE, DATOS_MATERIA, aplanarDocente, aplanarMateria, validarAsignacion } from "../services/asignaciones.js";

// El ADMIN decide qué docente dicta cada materia. Sin esta asignación un DOCENTE no puede
// cargar horarios, notas, avisos, fechas de examen ni tareas de la materia (Seg-05).
export function crearRouterAsignaciones(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ADMIN"));

  // Materias con sus docentes asignados.
  router.get("/materias", async (req, res, next) => {
    try {
      const materias = await db.materia.findMany({
        select: DATOS_MATERIA,
        orderBy: [{ plan: { carrera: { nombre: "asc" } } }, { anio: "asc" }, { nombre: "asc" }],
      });
      res.json(materias.map(aplanarMateria));
    } catch (e) { next(e); }
  });

  // Docentes con las materias que dictan.
  router.get("/docentes", async (req, res, next) => {
    try {
      const docentes = await db.usuario.findMany({
        where: { rol: "DOCENTE" },
        select: { ...DATOS_DOCENTE, materiasQueDicta: { select: { materia: { select: { id: true, nombre: true, codigo: true } } } } },
        orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
      });
      res.json(docentes.map(aplanarDocente));
    } catch (e) { next(e); }
  });

  // Asigna un docente a una materia. Solo se asignan usuarios con rol DOCENTE.
  router.post("/", async (req, res, next) => {
    try {
      const { materiaId, docenteId } = validarAsignacion(req.body);
      const [materia, docente] = await Promise.all([
        db.materia.findUnique({ where: { id: materiaId }, select: { id: true, nombre: true, codigo: true } }),
        db.usuario.findUnique({ where: { id: docenteId }, select: { ...DATOS_DOCENTE, rol: true } }),
      ]);
      if (!materia) throw errorAcceso(404, "La materia no existe.");
      if (!docente) throw errorAcceso(404, "El docente no existe.");
      if (docente.rol !== "DOCENTE") throw errorAcceso(400, "Solo se pueden asignar usuarios con rol docente.");

      const existente = await db.materiaDocente.findUnique({ where: { materiaId_docenteId: { materiaId, docenteId } }, select: { materiaId: true } });
      if (existente) throw errorAcceso(409, `${docente.nombre} ${docente.apellido} ya dicta ${materia.nombre}.`);

      await db.materiaDocente.create({ data: { materiaId, docenteId } });
      const { rol, ...datosDocente } = docente;
      res.status(201).json({ materia, docente: datosDocente });
    } catch (e) { next(e); }
  });

  // Quita la asignación (el docente deja de poder modificar esa materia).
  router.delete("/materias/:materiaId/docentes/:docenteId", async (req, res, next) => {
    try {
      const materiaId = validarId(req.params.materiaId, "identificador de la materia");
      const docenteId = validarId(req.params.docenteId, "identificador del docente");
      const existente = await db.materiaDocente.findUnique({ where: { materiaId_docenteId: { materiaId, docenteId } }, select: { materiaId: true } });
      if (!existente) throw errorAcceso(404, "Ese docente no está asignado a esa materia.");
      await db.materiaDocente.delete({ where: { materiaId_docenteId: { materiaId, docenteId } } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterAsignaciones();

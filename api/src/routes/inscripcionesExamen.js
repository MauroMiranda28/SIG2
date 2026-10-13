import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorAcceso, validarId } from "../services/docentes.js";
import { hoy } from "../services/examenes.js";
import { DATOS_INSCRIPCION, modalidadDisponible, validarInscripcion } from "../services/inscripcionesExamen.js";
import { contarInscriptos } from "../services/inscriptosFinal.js";

async function cursadaDelAlumno(db, alumnoId, materiaId) {
  return db.cursada.findUnique({
    where: { alumnoId_materiaId: { alumnoId, materiaId } },
    select: { estado: true, regularDesde: true },
  });
}

// El alumno se inscribe a los finales ya programados de las materias en las que está regular o
// libre (Ev-xx). Separado de /examenes, que es donde el docente programa las fechas.
export function crearRouterInscripcionesExamen(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ALUMNO"));

  // Finales futuros de las materias donde el alumno puede inscribirse, con la modalidad que le
  // corresponde (REGULAR o LIBRE), si ya se inscribió y cuántos inscriptos hay (regulares y libres).
  router.get("/", async (req, res, next) => {
    try {
      const cursadas = await db.cursada.findMany({
        where: { alumnoId: req.usuario.id, estado: { in: ["REGULAR", "LIBRE"] } },
        select: { materiaId: true, estado: true, regularDesde: true },
      });
      if (!cursadas.length) return res.json([]);
      const porMateria = new Map(cursadas.map((c) => [c.materiaId, c]));

      const examenes = await db.fechaExamen.findMany({
        where: { tipo: "FINAL", materiaId: { in: [...porMateria.keys()] }, fecha: { gte: hoy() } },
        select: {
          id: true, fecha: true, hora: true, materiaId: true,
          materia: { select: { id: true, nombre: true, codigo: true } },
          aula: { select: { id: true, nombre: true } },
          inscripciones: { where: { alumnoId: req.usuario.id }, select: { id: true, modalidad: true } },
        },
        orderBy: [{ fecha: "asc" }, { id: "asc" }],
      });

      const inscriptos = await contarInscriptos(db, examenes.map((e) => e.id));
      res.json(examenes.map(({ inscripciones, materiaId, ...examen }) => ({
        ...examen,
        modalidadDisponible: modalidadDisponible(porMateria.get(materiaId)),
        inscripcion: inscripciones[0] ?? null,
        inscriptos: inscriptos.get(examen.id),
      })));
    } catch (e) { next(e); }
  });

  router.post("/:id", async (req, res, next) => {
    try {
      const examenId = validarId(req.params.id, "identificador del examen");
      const examen = await db.fechaExamen.findUnique({
        where: { id: examenId }, select: { id: true, tipo: true, fecha: true, materiaId: true },
      });
      if (!examen) throw errorAcceso(404, "El examen no existe.");

      const cursada = await cursadaDelAlumno(db, req.usuario.id, examen.materiaId);
      const modalidad = validarInscripcion({ examen, cursada });

      const inscripcion = await db.inscripcionExamen.create({
        data: { alumnoId: req.usuario.id, examenId, modalidad }, select: DATOS_INSCRIPCION,
      });
      res.status(201).json(inscripcion);
    } catch (e) {
      if (e.code === "P2002") return res.status(409).json({ error: "Ya estás inscripto a ese final." });
      next(e);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const examenId = validarId(req.params.id, "identificador del examen");
      const borrada = await db.inscripcionExamen.deleteMany({ where: { examenId, alumnoId: req.usuario.id } });
      if (!borrada.count) throw errorAcceso(404, "No estabas inscripto a ese final.");
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterInscripcionesExamen();

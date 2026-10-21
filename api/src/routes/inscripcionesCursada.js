import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { validarId } from "../services/docentes.js";
import { opcionesDeInscripcion, inscribirACursar, validarInscripcionCursada } from "../services/inscripcionCursada.js";

// El alumno se inscribe a una materia de su plan para cursarla, eligiendo comisión si la
// materia tiene. Se controlan las correlatividades y los choques de horario.
// El alumno sale siempre del token.
export function crearRouterInscripcionesCursada(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ALUMNO"));

  // Si se puede inscribir, por qué no, sus correlativas y sus comisiones.
  router.get("/:materiaId", async (req, res, next) => {
    try {
      const materiaId = validarId(req.params.materiaId, "identificador de la materia");
      res.json(await opcionesDeInscripcion(db, req.usuario.id, materiaId));
    } catch (e) { next(e); }
  });

  router.post("/", async (req, res, next) => {
    try {
      res.status(201).json(await inscribirACursar(db, req.usuario.id, validarInscripcionCursada(req.body)));
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterInscripcionesCursada();

import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { validarId, errorAcceso } from "../services/docentes.js";
import {
  validarCorrelatividad, validarTipoCorrelatividad, generaCiclo, correlatividadesDelAlumno,
} from "../services/correlatividades.js";

const DATOS_CORRELATIVIDAD = {
  id: true, tipo: true, materiaId: true,
  requiere: { select: { id: true, nombre: true, codigo: true, anio: true } },
};

// El alumno consulta qué necesita para cursar cada materia de su plan.
// El ADMIN carga las correlatividades de cada plan (son parte del plan de estudios).
export function crearRouterCorrelatividades(db = prisma) {
  const router = Router();
  router.use(requiereAuth);

  // ALUMNO: materias de su plan con sus correlativas y si las cumple. El alumno sale del token.
  router.get("/", requiereRol("ALUMNO"), async (req, res, next) => {
    try {
      res.json(await correlatividadesDelAlumno(db, req.usuario.id));
    } catch (e) { next(e); }
  });

  // ADMIN: planes para elegir en el formulario.
  router.get("/planes", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      res.json(await db.planEstudio.findMany({
        select: { id: true, nombre: true, anio: true, vigente: true, carrera: { select: { nombre: true, codigo: true } } },
        orderBy: [{ carrera: { nombre: "asc" } }, { anio: "desc" }],
      }));
    } catch (e) { next(e); }
  });

  // ADMIN: materias de un plan con las correlativas que ya tienen.
  router.get("/plan/:id", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      const planId = validarId(req.params.id, "identificador del plan");
      const plan = await db.planEstudio.findUnique({ where: { id: planId }, select: { id: true } });
      if (!plan) throw errorAcceso(404, "El plan no existe.");
      res.json(await db.materia.findMany({
        where: { planId },
        select: {
          id: true, nombre: true, codigo: true, anio: true, cuatrimestre: true,
          requiere: { select: DATOS_CORRELATIVIDAD, orderBy: { requiere: { nombre: "asc" } } },
        },
        orderBy: [{ anio: "asc" }, { cuatrimestre: "asc" }, { nombre: "asc" }],
      }));
    } catch (e) { next(e); }
  });

  // ADMIN: agrega una correlativa. Las dos materias tienen que ser del mismo plan y no puede armar un ciclo.
  router.post("/", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      const { materiaId, requiereId, tipo } = validarCorrelatividad(req.body);
      const materias = await db.materia.findMany({ where: { id: { in: [materiaId, requiereId] } }, select: { id: true, planId: true } });
      if (materias.length !== 2) throw errorAcceso(404, "Alguna de las materias no existe.");
      if (materias[0].planId !== materias[1].planId) throw errorAcceso(400, "Las dos materias tienen que ser del mismo plan.");

      const existente = await db.correlatividad.findUnique({ where: { materiaId_requiereId: { materiaId, requiereId } }, select: { id: true } });
      if (existente) throw errorAcceso(409, "Esa correlatividad ya existe. Si querés, cambiale el tipo.");
      if (await generaCiclo(db, materiaId, requiereId)) {
        throw errorAcceso(400, "No se puede: la materia correlativa ya necesita (directa o indirectamente) a esta materia.");
      }

      res.status(201).json(await db.correlatividad.create({ data: { materiaId, requiereId, tipo }, select: DATOS_CORRELATIVIDAD }));
    } catch (e) { next(e); }
  });

  // ADMIN: cambia el tipo (débil ↔ fuerte).
  router.patch("/:id", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador de la correlatividad");
      const tipo = validarTipoCorrelatividad(req.body?.tipo);
      const existente = await db.correlatividad.findUnique({ where: { id }, select: { id: true } });
      if (!existente) throw errorAcceso(404, "La correlatividad no existe.");
      res.json(await db.correlatividad.update({ where: { id }, data: { tipo }, select: DATOS_CORRELATIVIDAD }));
    } catch (e) { next(e); }
  });

  // ADMIN: quita una correlativa.
  router.delete("/:id", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador de la correlatividad");
      const existente = await db.correlatividad.findUnique({ where: { id }, select: { id: true } });
      if (!existente) throw errorAcceso(404, "La correlatividad no existe.");
      await db.correlatividad.delete({ where: { id } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterCorrelatividades();

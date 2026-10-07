import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { requiereMateriaAsignada, validarId } from "../services/docentes.js";
import { errorRevision, validarResolucion, validarSolicitudRevision } from "../services/revisiones.js";
import {
  avisoRevisionResuelta, avisoSolicitudRevision, crearNotificacionesIndividuales,
} from "../services/notificaciones.js";

const DATOS_SOLICITUD = {
  id: true,
  motivo: true,
  estado: true,
  creadoEn: true,
  respuesta: true,
  resueltaEn: true,
  evaluacion: {
    select: {
      id: true, tipo: true, nota: true, fecha: true,
      cursada: { select: { materia: { select: { nombre: true, codigo: true } } } },
    },
  },
};

function aplanar({ evaluacion, ...solicitud }) {
  const { cursada, ...datosEvaluacion } = evaluacion;
  return { ...solicitud, evaluacion: { ...datosEvaluacion, materia: cursada.materia } };
}

const materiaDelParametro = (req) => validarId(req.params.id, "identificador de la materia");

// La materia de una solicitud se resuelve desde la base, nunca desde el body.
async function materiaDeLaSolicitud(req, db) {
  const id = validarId(req.params.id, "identificador de la solicitud");
  const solicitud = await db.solicitudRevision.findUnique({ where: { id }, select: { evaluacion: { select: { cursada: { select: { materiaId: true } } } } } });
  if (!solicitud) throw errorRevision(404, "La solicitud no existe.");
  return solicitud.evaluacion.cursada.materiaId;
}

// El alumno reclama formalmente una evaluación si considera que hay un error de calificación.
// Al crear la solicitud, los docentes de la materia reciben una notificación SOLICITUD_REVISION.
// El docente de la materia (o ADMIN) la resuelve o la rechaza con una respuesta, y el alumno recibe
// una notificación REVISION_RESUELTA. Corregir la nota reclamada también la resuelve (ver routes/notas.js).
export function crearRouterRevisiones(db = prisma) {
  const router = Router();
  router.use(requiereAuth);

  // ---------- Alumno ----------

  router.get("/mis-solicitudes", requiereRol("ALUMNO"), async (req, res, next) => {
    try {
      const solicitudes = await db.solicitudRevision.findMany({
        where: { alumnoId: req.usuario.id },
        select: DATOS_SOLICITUD,
        orderBy: { creadoEn: "desc" },
      });
      res.json(solicitudes.map(aplanar));
    } catch (e) { next(e); }
  });

  router.post("/", requiereRol("ALUMNO"), async (req, res, next) => {
    try {
      const { evaluacionId, motivo } = validarSolicitudRevision(req.body);

      const evaluacion = await db.evaluacion.findFirst({
        where: { id: evaluacionId, cursada: { alumnoId: req.usuario.id } },
        select: {
          id: true, tipo: true, nota: true, fecha: true,
          cursada: { select: { materia: { select: { id: true, nombre: true } }, alumno: { select: { nombre: true, apellido: true } } } },
        },
      });
      if (!evaluacion) throw errorRevision(404, "Esa evaluación no existe o no te pertenece.");

      const yaExiste = await db.solicitudRevision.findFirst({
        where: { evaluacionId, alumnoId: req.usuario.id, estado: "PENDIENTE" },
        select: { id: true },
      });
      if (yaExiste) throw errorRevision(409, "Ya tenés una solicitud pendiente para esta evaluación.");

      // La solicitud y el aviso a los docentes de la materia se guardan juntos o no se guarda ninguno.
      const { materia, alumno } = evaluacion.cursada;
      const solicitud = await db.$transaction(async (tx) => {
        const creada = await tx.solicitudRevision.create({
          data: { evaluacionId, alumnoId: req.usuario.id, motivo },
          select: DATOS_SOLICITUD,
        });
        const docentes = await tx.materiaDocente.findMany({ where: { materiaId: materia.id }, select: { docenteId: true } });
        const aviso = avisoSolicitudRevision({
          alumnoNombre: `${alumno.nombre} ${alumno.apellido}`, materiaNombre: materia.nombre,
          tipo: evaluacion.tipo, nota: evaluacion.nota, fecha: evaluacion.fecha, motivo,
        });
        await crearNotificacionesIndividuales(tx, docentes.map((d) => ({
          usuarioId: d.docenteId, tipo: "SOLICITUD_REVISION", materiaId: materia.id, autorId: req.usuario.id, ...aviso,
        })));
        return creada;
      });
      res.status(201).json(aplanar(solicitud));
    } catch (e) { next(e); }
  });

  // ---------- Docente (Seg-05: solo las materias que tiene asignadas; ADMIN en cualquiera) ----------

  // Solicitudes de la materia: primero las pendientes, después las resueltas, de la más nueva a la más vieja.
  router.get("/materias/:id", requiereRol("DOCENTE", "ADMIN"), requiereMateriaAsignada(db, materiaDelParametro), async (req, res, next) => {
    try {
      const solicitudes = await db.solicitudRevision.findMany({
        where: { evaluacion: { cursada: { materiaId: req.materia.id } } },
        select: { ...DATOS_SOLICITUD, alumno: { select: { id: true, nombre: true, apellido: true, email: true } } },
        orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      });
      const ordenadas = solicitudes.map(aplanar).sort((a, b) => (a.estado === "PENDIENTE" ? 0 : 1) - (b.estado === "PENDIENTE" ? 0 : 1));
      res.json({ materia: req.materia, solicitudes: ordenadas });
    } catch (e) { next(e); }
  });

  // Resuelve (RESUELTA) o rechaza (RECHAZADA) una solicitud pendiente y le responde al alumno.
  // Solo se resuelve una vez: si ya no está pendiente responde 409. El aviso al alumno se guarda
  // en la misma transacción.
  router.patch("/:id/resolver", requiereRol("DOCENTE", "ADMIN"), requiereMateriaAsignada(db, materiaDeLaSolicitud), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador de la solicitud");
      const { estado, respuesta } = validarResolucion(req.body);

      const resuelta = await db.$transaction(async (tx) => {
        // updateMany con el estado en el filtro: dos docentes a la vez no la resuelven dos veces.
        const { count } = await tx.solicitudRevision.updateMany({
          where: { id, estado: "PENDIENTE" },
          data: { estado, respuesta, resueltaEn: new Date(), resueltaPorId: req.usuario.id },
        });
        if (!count) throw errorRevision(409, "Esa solicitud ya fue resuelta.");

        const solicitud = await tx.solicitudRevision.findUnique({
          where: { id },
          select: { ...DATOS_SOLICITUD, alumnoId: true, evaluacion: { select: { ...DATOS_SOLICITUD.evaluacion.select, cursada: { select: { materia: { select: { id: true, nombre: true, codigo: true } } } } } } },
        });
        const { materia } = solicitud.evaluacion.cursada;
        await crearNotificacionesIndividuales(tx, [{
          usuarioId: solicitud.alumnoId, tipo: "REVISION_RESUELTA", materiaId: materia.id, autorId: req.usuario.id,
          ...avisoRevisionResuelta({
            estado, materiaNombre: materia.nombre, tipo: solicitud.evaluacion.tipo,
            nota: solicitud.evaluacion.nota, fecha: solicitud.evaluacion.fecha, respuesta,
          }),
        }]);
        const { alumnoId, ...visible } = solicitud;
        return visible;
      });
      res.json(aplanar(resuelta));
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterRevisiones();

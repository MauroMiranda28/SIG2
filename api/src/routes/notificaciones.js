import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth } from "../middleware/auth.js";
import { errorAcceso, validarId } from "../services/docentes.js";
import {
  DATOS_NOTIFICACION, filtroNotificaciones, validarCursor, validarLimite, validarSoloNoLeidas,
} from "../services/notificaciones.js";
import { generarRecordatoriosEntrega } from "../services/tareas.js";

// Historial de notificaciones del usuario logueado. El usuario sale siempre del token
// (req.usuario.id): no se acepta un id por query ni por body, así nadie lee ni marca las de otro.
export function crearRouterNotificaciones(db = prisma) {
  const router = Router();
  router.use(requiereAuth);

  // Historial, de la más nueva a la más vieja. Se pagina con `limite` y `antesDeId`
  // (el id de la última que ya se vio). Las leídas no desaparecen: son el historial.
  router.get("/", async (req, res, next) => {
    try {
      const limite = validarLimite(req.query.limite);
      const antesDeId = validarCursor(req.query.antesDeId);
      const soloNoLeidas = validarSoloNoLeidas(req.query.soloNoLeidas);

      // Al abrir el historial (primera página), el alumno recibe los recordatorios de las entregas que
      // se acercan. Si falla, no se rompe el historial: solo se anota en la consola de la API.
      if (req.usuario.rol === "ALUMNO" && !antesDeId) {
        await generarRecordatoriosEntrega(db, req.usuario.id).catch((e) => console.error("No se pudieron generar los recordatorios de entrega:", e.message));
      }

      const [filas, noLeidas] = await Promise.all([
        db.notificacion.findMany({
          where: filtroNotificaciones(req.usuario.id, { soloNoLeidas, antesDeId }),
          select: DATOS_NOTIFICACION,
          orderBy: { id: "desc" },
          take: limite + 1, // una de más para saber si quedan
        }),
        db.notificacion.count({ where: filtroNotificaciones(req.usuario.id, { soloNoLeidas: true }) }),
      ]);

      res.json({
        noLeidas,
        hayMas: filas.length > limite,
        notificaciones: filas.slice(0, limite).map(({ leidaEn, ...n }) => ({ ...n, leida: leidaEn != null, leidaEn })),
      });
    } catch (e) { next(e); }
  });

  // Marca todas las propias como leídas.
  router.post("/leer-todas", async (req, res, next) => {
    try {
      const { count } = await db.notificacion.updateMany({
        where: filtroNotificaciones(req.usuario.id, { soloNoLeidas: true }),
        data: { leidaEn: new Date() },
      });
      res.json({ marcadas: count });
    } catch (e) { next(e); }
  });

  // Marca una como leída. Si es de otro usuario responde 404, igual que si no existiera.
  router.post("/:id/leer", async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador de la notificación");
      const notificacion = await db.notificacion.findFirst({ where: { id, usuarioId: req.usuario.id }, select: { id: true, leidaEn: true } });
      if (!notificacion) throw errorAcceso(404, "La notificación no existe.");
      const leidaEn = notificacion.leidaEn ?? new Date();
      if (!notificacion.leidaEn) await db.notificacion.update({ where: { id }, data: { leidaEn } });
      res.json({ id, leida: true, leidaEn });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterNotificaciones();

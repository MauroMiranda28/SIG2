import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorAcceso, validarId } from "../services/docentes.js";
import { configuracionCanales } from "../services/canales.js";
import { enlaceDe } from "../services/enlaces.js";
import { destinoEmail } from "../services/envios.js";
import {
  armarMatriz, validarEndpointPush, validarPreferencias, validarSuscripcionPush, verificarCanalesDisponibles,
} from "../services/preferencias.js";
import {
  DATOS_NOTIFICACION, filtroNotificaciones, validarCursor, validarLimite, validarSoloNoLeidas,
} from "../services/notificaciones.js";
import { generarRecordatoriosEntrega } from "../services/tareas.js";

// Historial de notificaciones del usuario logueado. El usuario sale siempre del token
// (req.usuario.id): no se acepta un id por query ni por body, así nadie lee ni marca las de otro.
// `canales` dice qué medios tiene habilitados el servidor (email y push necesitan configuración).
export function crearRouterNotificaciones(db = prisma, canales = configuracionCanales()) {
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
        // `enlace` lleva a la sección de la app a la que se refiere el aviso (ver services/enlaces.js).
        notificaciones: filas.slice(0, limite).map(({ leidaEn, seccion, ...n }) => ({
          ...n, leida: leidaEn != null, leidaEn, enlace: enlaceDe({ tipo: n.tipo, seccion }),
        })),
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

  // Vuelve a dejar una notificación como no leída (la inversa de /leer). Una ajena responde 404.
  router.post("/:id/no-leida", async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador de la notificación");
      const notificacion = await db.notificacion.findFirst({ where: { id, usuarioId: req.usuario.id }, select: { id: true, leidaEn: true } });
      if (!notificacion) throw errorAcceso(404, "La notificación no existe.");
      if (notificacion.leidaEn) await db.notificacion.update({ where: { id }, data: { leidaEn: null } });
      res.json({ id, leida: false, leidaEn: null });
    } catch (e) { next(e); }
  });

  // ---------- Preferencias: qué avisos recibir y por qué medio ----------
  // Solo alumnos y docentes reciben avisos. Como siempre, el usuario sale del token.

  async function estadoPreferencias(usuario) {
    const [filas, dispositivos, datos] = await Promise.all([
      db.preferenciaNotificacion.findMany({ where: { usuarioId: usuario.id }, select: { tipo: true, canal: true, activa: true } }),
      db.pushSuscripcion.count({ where: { usuarioId: usuario.id } }),
      db.usuario.findUnique({ where: { id: usuario.id }, select: { email: true, emailPersonal: true } }),
    ]);
    return {
      tipos: armarMatriz(usuario.rol, filas),
      canales: {
        SISTEMA: { disponible: true },
        EMAIL: { disponible: canales.disponibles.EMAIL, destino: destinoEmail(datos) },
        PUSH: { disponible: canales.disponibles.PUSH, clavePublica: canales.pushClavePublica, dispositivos },
      },
    };
  }

  router.get("/preferencias", requiereRol("ALUMNO", "DOCENTE"), async (req, res, next) => {
    try { res.json(await estadoPreferencias(req.usuario)); } catch (e) { next(e); }
  });

  // Cambia las preferencias indicadas (el resto queda como está). Activar email o push solo se permite si el
  // servidor lo tiene configurado, y push además exige haber permitido las notificaciones en algún navegador.
  router.put("/preferencias", requiereRol("ALUMNO", "DOCENTE"), async (req, res, next) => {
    try {
      const cambios = validarPreferencias(req.body, req.usuario.rol);
      const dispositivos = await db.pushSuscripcion.count({ where: { usuarioId: req.usuario.id } });
      verificarCanalesDisponibles(cambios, { disponibles: canales.disponibles, dispositivos });

      await db.$transaction(async (tx) => {
        for (const { tipo, canal, activa } of cambios) {
          await tx.preferenciaNotificacion.upsert({
            where: { usuarioId_tipo_canal: { usuarioId: req.usuario.id, tipo, canal } },
            update: { activa },
            create: { usuarioId: req.usuario.id, tipo, canal, activa },
          });
        }
      });
      res.json(await estadoPreferencias(req.usuario));
    } catch (e) { next(e); }
  });

  // ---------- Push: dispositivos del usuario ----------

  // Registra (o actualiza) el navegador del usuario. Si el mismo navegador estaba a nombre de otra persona
  // (se cerró una sesión y entró otra), pasa a ser del usuario actual.
  router.post("/push/suscripcion", requiereRol("ALUMNO", "DOCENTE"), async (req, res, next) => {
    try {
      if (!canales.disponibles.PUSH) throw errorAcceso(409, "Las notificaciones push no están habilitadas en este servidor.");
      const { endpoint, p256dh, auth } = validarSuscripcionPush(req.body);
      await db.pushSuscripcion.upsert({
        where: { endpoint },
        update: { usuarioId: req.usuario.id, p256dh, auth },
        create: { endpoint, p256dh, auth, usuarioId: req.usuario.id },
      });
      res.status(201).json({ dispositivos: await db.pushSuscripcion.count({ where: { usuarioId: req.usuario.id } }) });
    } catch (e) { next(e); }
  });

  // Quita un navegador del usuario. Si era el último, el push queda apagado en sus preferencias.
  router.delete("/push/suscripcion", requiereRol("ALUMNO", "DOCENTE"), async (req, res, next) => {
    try {
      const endpoint = validarEndpointPush(req.body?.endpoint);
      await db.pushSuscripcion.deleteMany({ where: { endpoint, usuarioId: req.usuario.id } });
      const dispositivos = await db.pushSuscripcion.count({ where: { usuarioId: req.usuario.id } });
      if (dispositivos === 0) {
        await db.preferenciaNotificacion.updateMany({ where: { usuarioId: req.usuario.id, canal: "PUSH", activa: true }, data: { activa: false } });
      }
      res.json({ dispositivos });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterNotificaciones();

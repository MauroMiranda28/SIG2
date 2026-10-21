import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { validarId, errorAcceso } from "../services/docentes.js";
import {
  aniosCalendarioPublicados, validarCoberturaExamenesFinales, validarPeriodoAcademico, validarNoSolapado,
} from "../services/calendarioAcademico.js";

export function crearRouterCalendarioAcademico(db = prisma) {
  const router = Router();
  router.use(requiereAuth);

  router.get("/", async (req, res, next) => {
    try {
      const anio = req.query.anio == null ? new Date().getFullYear() : Number(req.query.anio);
      if (!Number.isInteger(anio) || anio < 1900 || anio > 2100) {
        throw errorAcceso(400, "Indicá un año calendario válido.");
      }
      const esAdmin = req.usuario.rol === "ADMIN";
      const aniosPublicados = await aniosCalendarioPublicados(db, [anio]);
      if (!esAdmin && !aniosPublicados.includes(anio)) {
        return res.json([]);
      }
      const periodos = await db.periodoAcademico.findMany({
        where: {
          OR: [
            { anio },
            {
              tipo: "VACACIONES",
              fechaInicio: { lte: new Date(Date.UTC(anio, 11, 31)) },
              fechaFin: { gte: new Date(Date.UTC(anio, 0, 1)) },
            },
          ],
        },
        orderBy: [{ fechaInicio: "asc" }, { tipo: "asc" }, { nombre: "asc" }],
      });
      res.json(periodos);
    } catch (e) { next(e); }
  });

  router.get("/estado", async (req, res, next) => {
    try {
      const anio = Number(req.query.anio);
      if (!Number.isInteger(anio) || anio < 1900 || anio > 2100) {
        throw errorAcceso(400, "Indicá un año calendario válido.");
      }
      const publicacion = await db.publicacionCalendario.findUnique({
        where: { anio },
        select: { publicado: true, actualizadoEn: true },
      });
      res.json({ anio, publicado: publicacion?.publicado ?? false, actualizadoEn: publicacion?.actualizadoEn ?? null });
    } catch (e) { next(e); }
  });

  router.put("/publicacion/:anio", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      const anio = validarId(req.params.anio, "año del calendario");
      if (anio < 1900 || anio > 2100) throw errorAcceso(400, "Indicá un año calendario válido.");
      if (!req.body || typeof req.body.publicado !== "boolean") {
        throw errorAcceso(400, "Indicá si el calendario debe publicarse.");
      }
      const publicado = req.body.publicado;
      if (publicado) {
        const periodos = await db.periodoAcademico.findMany({ where: { anio }, select: { tipo: true } });
        const tipos = new Set(periodos.map(({ tipo }) => tipo));
        if (!tipos.has("CLASES_CUATRIMESTRE_1") || !tipos.has("CLASES_CUATRIMESTRE_2")) {
          throw errorAcceso(400, "Configurá las fechas del primer y segundo cuatrimestre antes de confirmar el calendario.");
        }
      }
      const resultado = await db.publicacionCalendario.upsert({
        where: { anio },
        create: { anio, publicado },
        update: { publicado },
      });
      res.json(resultado);
    } catch (e) { next(e); }
  });

  router.post("/", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      const datos = validarPeriodoAcademico(req.body);
      await validarNoSolapado(db, datos);
      const periodo = await db.periodoAcademico.create({ data: datos });
      await db.publicacionCalendario.updateMany({ where: { anio: datos.anio, publicado: true }, data: { publicado: false } });
      res.status(201).json(periodo);
    } catch (e) { next(e); }
  });

  router.put("/:id", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador del período");
      const actual = await db.periodoAcademico.findUnique({ where: { id }, select: { id: true, tipo: true, anio: true } });
      if (!actual) throw errorAcceso(404, "El período académico no existe.");
      const datos = validarPeriodoAcademico(req.body);
      await validarNoSolapado(db, datos, id);
      if (actual.tipo === "EXAMENES_FINALES" || datos.tipo === "EXAMENES_FINALES") {
        await validarCoberturaExamenesFinales(db, datos, { excluirId: id });
      }
      const periodo = await db.periodoAcademico.update({ where: { id }, data: datos });
      await db.publicacionCalendario.updateMany({ where: { anio: { in: [actual.anio, datos.anio] }, publicado: true }, data: { publicado: false } });
      res.json(periodo);
    } catch (e) { next(e); }
  });

  router.delete("/:id", requiereRol("ADMIN"), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador del período");
      const periodo = await db.periodoAcademico.findUnique({ where: { id } });
      if (!periodo) throw errorAcceso(404, "El período académico no existe.");
      if (periodo.tipo === "EXAMENES_FINALES") {
        await validarCoberturaExamenesFinales(db, periodo, { excluirId: id, eliminar: true });
      }
      await db.periodoAcademico.delete({ where: { id } });
      await db.publicacionCalendario.updateMany({ where: { anio: periodo.anio, publicado: true }, data: { publicado: false } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterCalendarioAcademico();

import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorAcceso, validarId } from "../services/docentes.js";
import {
  DATOS_ACTIVIDAD_PERSONAL,
  DIAS_SEMANA,
  etiquetaDiaDeFecha,
  fechaParaDia,
  horaFin,
  inicioSemana,
  minutosDesdeMedianoche,
  NOMBRE_DIA,
  validarCambioActividadPersonal,
  validarFechaAgenda,
  validarFiltroEtiqueta,
  validarNuevaActividadPersonal,
} from "../services/actividadesPersonales.js";

function seSuperponen(a, b) {
  return minutosDesdeMedianoche(a.horaInicio) < minutosDesdeMedianoche(b.horaFin) &&
    minutosDesdeMedianoche(a.horaFin) > minutosDesdeMedianoche(b.horaInicio);
}

function diaDeActividad(actividad) {
  return actividad.programacion === "RECURRENTE" ? actividad.dia : etiquetaDiaDeFecha(actividad.fecha);
}

function ocurreEnDia(actividad, dia, fecha) {
  if (!actividad.horaInicio || !actividad.duracion) return false;
  if (actividad.programacion === "RECURRENTE") return actividad.dia === dia;
  if (!fecha && actividad.fecha) {
    const hoy = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    return actividad.fecha >= hoy && etiquetaDiaDeFecha(actividad.fecha) === dia;
  }
  return fecha && actividad.fecha && actividad.fecha.toISOString().slice(0, 10) === fecha.toISOString().slice(0, 10);
}

export async function buscarConflictosActividad(db, usuarioId, actividad, excluirId) {
  if (!actividad.horaInicio || !actividad.duracion || !actividad.programacion) return [];
  const dia = diaDeActividad(actividad);
  const fecha = actividad.programacion === "PUNTUAL" ? actividad.fecha : null;
  const hora = {
    horaInicio: actividad.horaInicio,
    horaFin: horaFin(actividad.horaInicio, actividad.duracion),
  };
  const inscripciones = await db.inscripcionComision.findMany({
    where: { alumnoId: usuarioId },
    select: {
      comision: {
        select: {
          nombre: true,
          materia: { select: { nombre: true } },
          bloques: { select: { dia: true, horaInicio: true, horaFin: true } },
        },
      },
    },
  });
  const conflictos = [];

  for (const { comision } of inscripciones) {
    for (const bloque of comision.bloques) {
      if (bloque.dia === dia && seSuperponen(hora, bloque)) {
        conflictos.push({
          tipo: "CLASE",
          titulo: `${comision.materia.nombre} (${comision.nombre})`,
          dia,
          fecha,
          horaInicio: bloque.horaInicio,
          horaFin: bloque.horaFin,
        });
      }
    }
  }

  const actividades = await db.actividadPersonal.findMany({
    where: { usuarioId, ...(excluirId ? { id: { not: excluirId } } : {}) },
    select: { id: true, titulo: true, programacion: true, dia: true, fecha: true, duracion: true, horaInicio: true },
  });
  for (const existente of actividades) {
    if (!ocurreEnDia(existente, dia, fecha)) continue;
    const existenteHora = {
      horaInicio: existente.horaInicio,
      horaFin: horaFin(existente.horaInicio, existente.duracion),
    };
    if (seSuperponen(hora, existenteHora)) {
      conflictos.push({
        tipo: "ACTIVIDAD",
        titulo: existente.titulo,
        dia,
        fecha: existente.programacion === "PUNTUAL" ? existente.fecha : fecha,
        horaInicio: existenteHora.horaInicio,
        horaFin: existenteHora.horaFin,
      });
    }
  }
  return conflictos;
}

function eventoActividad(actividad, fecha, dia) {
  return {
    tipoEvento: "ACTIVIDAD",
    id: actividad.id,
    titulo: actividad.titulo,
    categoria: actividad.categoria,
    etiquetas: actividad.etiquetas,
    fecha,
    dia,
    horaInicio: actividad.horaInicio,
    horaFin: horaFin(actividad.horaInicio, actividad.duracion),
    duracion: actividad.duracion,
    programacion: actividad.programacion,
  };
}

export function crearRouterActividadesPersonales(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ALUMNO"));

  router.get("/agenda", async (req, res, next) => {
    try {
      const fechaElegida = validarFechaAgenda(req.query.fecha);
      const inicio = inicioSemana(fechaElegida);
      const fin = new Date(inicio);
      fin.setUTCDate(fin.getUTCDate() + 7);

      const [actividades, inscripciones] = await Promise.all([
        db.actividadPersonal.findMany({
          where: { usuarioId: req.usuario.id },
          select: DATOS_ACTIVIDAD_PERSONAL,
          orderBy: [{ horaInicio: "asc" }, { id: "asc" }],
        }),
        db.inscripcionComision.findMany({
          where: { alumnoId: req.usuario.id },
          select: {
            comision: {
              select: {
                nombre: true,
                materia: { select: { nombre: true } },
                bloques: { select: { dia: true, horaInicio: true, horaFin: true } },
              },
            },
          },
        }),
      ]);
      const eventos = [];

      for (const actividad of actividades) {
        if (!actividad.horaInicio || !actividad.duracion) continue;
        if (actividad.programacion === "RECURRENTE" && actividad.dia) {
          const fecha = fechaParaDia(inicio, actividad.dia);
          eventos.push(eventoActividad(actividad, fecha, actividad.dia));
        } else if (
          actividad.programacion === "PUNTUAL" &&
          actividad.fecha &&
          actividad.fecha >= inicio &&
          actividad.fecha < fin
        ) {
          eventos.push(eventoActividad(actividad, actividad.fecha, etiquetaDiaDeFecha(actividad.fecha)));
        }
      }

      for (const { comision } of inscripciones) {
        for (const bloque of comision.bloques) {
          const fecha = fechaParaDia(inicio, bloque.dia);
          eventos.push({
            tipoEvento: "CLASE",
            titulo: `${comision.materia.nombre} (${comision.nombre})`,
            fecha,
            dia: bloque.dia,
            horaInicio: bloque.horaInicio,
            horaFin: bloque.horaFin,
            duracion: minutosDesdeMedianoche(bloque.horaFin) - minutosDesdeMedianoche(bloque.horaInicio),
          });
        }
      }

      eventos.sort((a, b) => a.fecha - b.fecha || a.horaInicio.localeCompare(b.horaInicio) || a.titulo.localeCompare(b.titulo, "es"));
      res.json({
        desde: inicio,
        hasta: new Date(fin.getTime() - 86400000),
        dias: DIAS_SEMANA.map((dia) => ({
          dia,
          nombre: NOMBRE_DIA[dia],
          fecha: fechaParaDia(inicio, dia),
          eventos: eventos.filter((evento) => evento.dia === dia),
        })),
        eventos,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const etiqueta = validarFiltroEtiqueta(req.query.etiqueta);
      const actividades = await db.actividadPersonal.findMany({
        where: {
          usuarioId: req.usuario.id,
          ...(etiqueta ? { etiquetas: { has: etiqueta } } : {}),
        },
        select: DATOS_ACTIVIDAD_PERSONAL,
        orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      });
      res.json({ actividades });
    } catch (e) {
      next(e);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const actividad = await db.actividadPersonal.create({
        data: { ...validarNuevaActividadPersonal(req.body), usuarioId: req.usuario.id },
        select: DATOS_ACTIVIDAD_PERSONAL,
      });
      const conflictos = await buscarConflictosActividad(db, req.usuario.id, actividad, actividad.id);
      res.status(201).json({ ...actividad, conflictos });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador de la actividad");
      const actual = await db.actividadPersonal.findFirst({
        where: { id, usuarioId: req.usuario.id },
        select: DATOS_ACTIVIDAD_PERSONAL,
      });
      if (!actual) throw errorAcceso(404, "La actividad no existe.");
      const cambios = validarCambioActividadPersonal(req.body);
      const actividadFutura = { ...actual, ...cambios };
      if (actividadFutura.horaInicio && actividadFutura.duracion) {
        horaFin(actividadFutura.horaInicio, actividadFutura.duracion);
      }
      const resultado = await db.actividadPersonal.updateMany({
        where: { id, usuarioId: req.usuario.id },
        data: cambios,
      });
      if (!resultado.count) throw errorAcceso(404, "La actividad no existe.");
      const actividad = await db.actividadPersonal.findFirst({
        where: { id, usuarioId: req.usuario.id },
        select: DATOS_ACTIVIDAD_PERSONAL,
      });
      if (!actividad) throw errorAcceso(404, "La actividad no existe.");
      const conflictos = await buscarConflictosActividad(db, req.usuario.id, actividadFutura, id);
      res.json({ ...actividad, conflictos });
    } catch (e) {
      next(e);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador de la actividad");
      const resultado = await db.actividadPersonal.deleteMany({
        where: { id, usuarioId: req.usuario.id },
      });
      if (!resultado.count) throw errorAcceso(404, "La actividad no existe.");
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

export default crearRouterActividadesPersonales();

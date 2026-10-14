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

const CATEGORIAS_DOCENTE = [
  "TRABAJO",
  "ESTUDIO",
  "PREPARACION_CLASE",
  "PREPARACION_EXAMEN",
  "CORRECCION_EXAMENES",
  "OTRA_ACADEMICA",
];

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

export async function buscarConflictosActividad(db, usuarioId, actividad, excluirId, incluirClases = true) {
  if (!actividad.horaInicio || !actividad.duracion || !actividad.programacion) return [];
  const dia = diaDeActividad(actividad);
  const fecha = actividad.programacion === "PUNTUAL" ? actividad.fecha : null;
  const hora = {
    horaInicio: actividad.horaInicio,
    horaFin: horaFin(actividad.horaInicio, actividad.duracion),
  };
  const inscripciones = incluirClases ? await db.inscripcionComision.findMany({
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
  }) : [];
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

function eventoClase(inicio, materiaNombre, comision, bloque) {
  const fecha = fechaParaDia(inicio, bloque.dia);
  return {
    tipoEvento: "CLASE",
    titulo: materiaNombre,
    comision: comision.nombre,
    aula: bloque.aula?.nombre ?? null,
    fecha,
    dia: bloque.dia,
    horaInicio: bloque.horaInicio,
    horaFin: bloque.horaFin,
    duracion: minutosDesdeMedianoche(bloque.horaFin) - minutosDesdeMedianoche(bloque.horaInicio),
  };
}

export function crearRouterActividadesPersonales(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("ALUMNO", "DOCENTE"));

  router.get("/agenda", async (req, res, next) => {
    try {
      const fechaElegida = validarFechaAgenda(req.query.fecha);
      const inicio = inicioSemana(fechaElegida);
      const fin = new Date(inicio);
      fin.setUTCDate(fin.getUTCDate() + 7);

      const esAlumno = req.usuario.rol === "ALUMNO";
      const [actividades, inscripciones, cursadas, materiasDocente] = await Promise.all([
        db.actividadPersonal.findMany({
          where: { usuarioId: req.usuario.id },
          select: DATOS_ACTIVIDAD_PERSONAL,
          orderBy: [{ horaInicio: "asc" }, { id: "asc" }],
        }),
        esAlumno ? db.inscripcionComision.findMany({
          where: { alumnoId: req.usuario.id },
          select: {
            comision: {
              select: {
                nombre: true,
                materia: { select: { nombre: true } },
                bloques: {
                  select: {
                    dia: true,
                    horaInicio: true,
                    horaFin: true,
                    aula: { select: { nombre: true } },
                  },
                },
              },
            },
          },
        }) : Promise.resolve([]),
        esAlumno ? db.cursada.findMany({
          where: { alumnoId: req.usuario.id },
          select: { materiaId: true },
        }) : Promise.resolve([]),
        esAlumno ? Promise.resolve([]) : db.materia.findMany({
          where: { docentes: { some: { docenteId: req.usuario.id } } },
          select: {
            nombre: true,
            comisiones: {
              select: {
                nombre: true,
                bloques: {
                  where: { docenteId: req.usuario.id },
                  select: {
                    dia: true,
                    horaInicio: true,
                    horaFin: true,
                    aula: { select: { nombre: true } },
                  },
                },
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
          eventos.push(eventoClase(inicio, comision.materia.nombre, comision, bloque));
        }
      }

      for (const materia of materiasDocente) {
        for (const comision of materia.comisiones) {
          for (const bloque of comision.bloques) {
            eventos.push(eventoClase(inicio, materia.nombre, comision, bloque));
          }
        }
      }

      const materiaIds = [...new Set(cursadas.map(({ materiaId }) => materiaId))];
      if (materiaIds.length > 0) {
        const examenes = await db.fechaExamen.findMany({
          where: { materiaId: { in: materiaIds }, fecha: { gte: inicio, lt: fin } },
          select: {
            id: true,
            tipo: true,
            fecha: true,
            hora: true,
            materia: { select: { nombre: true } },
            aula: { select: { nombre: true } },
          },
          orderBy: [{ fecha: "asc" }, { hora: "asc" }, { id: "asc" }],
        });
        for (const examen of examenes) {
          eventos.push({
            tipoEvento: "EXAMEN",
            id: examen.id,
            titulo: examen.materia.nombre,
            tipoExamen: examen.tipo,
            aula: examen.aula?.nombre ?? null,
            fecha: examen.fecha,
            dia: etiquetaDiaDeFecha(examen.fecha),
            horaInicio: examen.hora,
            horaFin: null,
          });
        }
      }

      eventos.sort((a, b) => a.fecha - b.fecha ||
        (a.horaInicio ?? "99:99").localeCompare(b.horaInicio ?? "99:99") ||
        a.titulo.localeCompare(b.titulo, "es"));
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
        data: {
          ...validarNuevaActividadPersonal(
            req.body,
            req.usuario.rol === "DOCENTE" ? CATEGORIAS_DOCENTE : undefined,
          ),
          usuarioId: req.usuario.id,
        },
        select: DATOS_ACTIVIDAD_PERSONAL,
      });
      const conflictos = await buscarConflictosActividad(
        db,
        req.usuario.id,
        actividad,
        actividad.id,
        req.usuario.rol === "ALUMNO",
      );
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
      const cambios = validarCambioActividadPersonal(
        req.body,
        req.usuario.rol === "DOCENTE" ? CATEGORIAS_DOCENTE : undefined,
      );
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
      const conflictos = await buscarConflictosActividad(
        db,
        req.usuario.id,
        actividadFutura,
        id,
        req.usuario.rol === "ALUMNO",
      );
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

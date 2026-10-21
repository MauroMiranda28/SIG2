import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorAcceso, validarId } from "../services/docentes.js";
import {
  aniosCalendarioPublicados, claseOcurreEnFecha, marcasCalendarioParaFecha,
} from "../services/calendarioAcademico.js";
import {
  DATOS_ACTIVIDAD_PERSONAL,
  actividadOcurreEnFecha,
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

function ocurrenciasEnRango(actividad, desde, hasta, alOcurrir) {
  const fecha = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  const fin = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate()));
  while (fecha <= fin) {
    if (actividadOcurreEnFecha(actividad, fecha) && alOcurrir(fecha)) return true;
    fecha.setUTCDate(fecha.getUTCDate() + 1);
  }
  return false;
}

function rangoOcurrencias(actividad, ahora, inicioSinFecha = null) {
  if (actividad.programacion === "PUNTUAL") {
    return actividad.fecha ? { desde: actividad.fecha, hasta: actividad.fecha } : null;
  }
  const fechaHoy = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  const referencia = inicioSinFecha ?? fechaHoy;
  const desde = actividad.fecha && actividad.fecha > referencia ? actividad.fecha : referencia;
  const maximo = new Date(desde.getTime() + 366 * 86400000);
  const hasta = actividad.repetirHasta && actividad.repetirHasta < maximo ? actividad.repetirHasta : maximo;
  return { desde, hasta };
}

export async function buscarConflictosActividad(db, usuarioId, actividad, excluirId, incluirClases = true) {
  if (!actividad.horaInicio || !actividad.duracion || !actividad.programacion) return [];
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
      const rango = rangoOcurrencias(actividad, new Date());
      const ocurreConClase = rango && ocurrenciasEnRango(
        actividad,
        rango.desde,
        rango.hasta,
        (fecha) => etiquetaDiaDeFecha(fecha) === bloque.dia && seSuperponen(hora, bloque),
      );
      if (ocurreConClase) {
        conflictos.push({
          tipo: "CLASE",
          titulo: `${comision.materia.nombre} (${comision.nombre})`,
          dia: bloque.dia,
          fecha: actividad.programacion === "PUNTUAL" ? actividad.fecha : null,
          horaInicio: bloque.horaInicio,
          horaFin: bloque.horaFin,
        });
      }
    }
  }

  const actividades = await db.actividadPersonal.findMany({
    where: { usuarioId, ...(excluirId ? { id: { not: excluirId } } : {}) },
    select: {
      id: true,
      titulo: true,
      programacion: true,
      frecuencia: true,
      intervalo: true,
      dia: true,
      fecha: true,
      repetirHasta: true,
      duracion: true,
      horaInicio: true,
    },
  });
  for (const existente of actividades) {
    const existenteHora = {
      horaInicio: existente.horaInicio,
      horaFin: horaFin(existente.horaInicio, existente.duracion),
    };
    const ahora = new Date();
    const rangoA = rangoOcurrencias(actividad, ahora);
    if (!rangoA) continue;
    const rangoB = rangoOcurrencias(
      existente,
      ahora,
      actividad.programacion === "PUNTUAL" ? actividad.fecha : rangoA.desde,
    );
    if (!rangoB) continue;
    const inicioComun = rangoA.desde > rangoB.desde ? rangoA.desde : rangoB.desde;
    const finComun = rangoA.hasta < rangoB.hasta ? rangoA.hasta : rangoB.hasta;
    let fechaConflicto = null;
    if (inicioComun <= finComun) ocurrenciasEnRango(
      actividad,
      inicioComun,
      finComun,
      (fecha) => {
        if (!actividadOcurreEnFecha(existente, fecha) || !seSuperponen(hora, existenteHora)) return false;
        fechaConflicto = new Date(fecha);
        return true;
      },
    );
    if (fechaConflicto) {
      conflictos.push({
        tipo: "ACTIVIDAD",
        titulo: existente.titulo,
        dia: etiquetaDiaDeFecha(fechaConflicto),
        fecha: fechaConflicto,
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
    notas: actividad.notas,
    estado: actividad.estado,
    categoria: actividad.categoria,
    etiquetas: actividad.etiquetas,
    fecha,
    dia,
    horaInicio: actividad.horaInicio,
    horaFin: horaFin(actividad.horaInicio, actividad.duracion),
    duracion: actividad.duracion,
    programacion: actividad.programacion,
    frecuencia: actividad.frecuencia,
    intervalo: actividad.intervalo,
    repetirHasta: actividad.repetirHasta,
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

function marcarFecha(porFecha, fecha, titulo) {
  const iso = fecha.toISOString().slice(0, 10);
  const titulos = porFecha.get(iso) ?? new Set();
  titulos.add(titulo);
  porFecha.set(iso, titulos);
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
      const hasta = new Date(fin.getTime() - 86400000);
      const aniosSemana = [...new Set([inicio.getUTCFullYear(), hasta.getUTCFullYear()])];
      const aniosPublicados = await aniosCalendarioPublicados(db, aniosSemana);
      const [actividades, inscripciones, cursadas, materiasDocente, periodos] = await Promise.all([
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
                materia: {
                  select: {
                    nombre: true,
                    cuatrimestre: true,
                    cursadas: { where: { alumnoId: req.usuario.id }, select: { estado: true } },
                  },
                },
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
            cuatrimestre: true,
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
        db.periodoAcademico.findMany({
          where: {
            anio: { in: aniosPublicados },
            fechaInicio: { lte: hasta },
            fechaFin: { gte: inicio },
          },
          select: { anio: true, tipo: true, nombre: true, fechaInicio: true, fechaFin: true },
        }),
      ]);
      const eventos = [];

      for (const actividad of actividades) {
        if (!actividad.horaInicio || !actividad.duracion) continue;
        for (let desplazamiento = 0; desplazamiento < 7; desplazamiento += 1) {
          const fecha = fechaParaDia(inicio, DIAS_SEMANA[desplazamiento]);
          if (actividadOcurreEnFecha(actividad, fecha)) {
            eventos.push(eventoActividad(actividad, fecha, etiquetaDiaDeFecha(fecha)));
          }
        }
      }

      for (const { comision } of inscripciones) {
        if (["REGULAR", "LIBRE", "APROBADA"].includes(comision.materia.cursadas?.[0]?.estado)) continue;
        for (const bloque of comision.bloques) {
          const fecha = fechaParaDia(inicio, bloque.dia);
          if (claseOcurreEnFecha(comision.materia, fecha, periodos)) {
            eventos.push(eventoClase(inicio, comision.materia.nombre, comision, bloque));
          }
        }
      }

      for (const materia of materiasDocente) {
        for (const comision of materia.comisiones) {
          for (const bloque of comision.bloques) {
            const fecha = fechaParaDia(inicio, bloque.dia);
            if (claseOcurreEnFecha(materia, fecha, periodos)) {
              eventos.push(eventoClase(inicio, materia.nombre, comision, bloque));
            }
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
        hasta,
        dias: DIAS_SEMANA.map((dia) => ({
          dia,
          nombre: NOMBRE_DIA[dia],
          fecha: fechaParaDia(inicio, dia),
          calendario: marcasCalendarioParaFecha(fechaParaDia(inicio, dia), periodos),
          eventos: eventos.filter((evento) => evento.dia === dia),
        })),
        eventos,
      });
    } catch (e) {
      next(e);
    }
  });

  // Integra «Mi horario» (clases, exámenes y actividades personales) con el calendario académico
  // anual: para cada fecha del año devuelve los títulos de lo que ese día tiene en la agenda,
  // así el calendario puede marcarlas sin repetir la lógica de ocurrencias en el cliente.
  router.get("/calendario-anual", async (req, res, next) => {
    try {
      const anio = Number(req.query.anio);
      if (!Number.isInteger(anio) || anio < 1900 || anio > 2100) {
        throw errorAcceso(400, "Indicá un año calendario válido.");
      }
      const esAlumno = req.usuario.rol === "ALUMNO";
      const inicioAnio = new Date(Date.UTC(anio, 0, 1));
      const finAnio = new Date(Date.UTC(anio, 11, 31));
      const aniosPublicados = await aniosCalendarioPublicados(db, [anio]);
      if (!aniosPublicados.includes(anio)) return res.json({ anio, fechas: [] });

      const [actividades, inscripciones, cursadas, materiasDocente, periodos] = await Promise.all([
        db.actividadPersonal.findMany({ where: { usuarioId: req.usuario.id }, select: DATOS_ACTIVIDAD_PERSONAL }),
        esAlumno ? db.inscripcionComision.findMany({
          where: { alumnoId: req.usuario.id },
          select: {
            comision: {
              select: {
                materia: {
                  select: { nombre: true, cuatrimestre: true, cursadas: { where: { alumnoId: req.usuario.id }, select: { estado: true } } },
                },
                bloques: { select: { dia: true } },
              },
            },
          },
        }) : Promise.resolve([]),
        esAlumno ? db.cursada.findMany({ where: { alumnoId: req.usuario.id }, select: { materiaId: true } }) : Promise.resolve([]),
        esAlumno ? Promise.resolve([]) : db.materia.findMany({
          where: { docentes: { some: { docenteId: req.usuario.id } } },
          select: { nombre: true, cuatrimestre: true, comisiones: { select: { bloques: { where: { docenteId: req.usuario.id }, select: { dia: true } } } } },
        }),
        db.periodoAcademico.findMany({
          where: { OR: [{ anio }, { tipo: "VACACIONES", fechaInicio: { lte: finAnio }, fechaFin: { gte: inicioAnio } }] },
          select: { anio: true, tipo: true, nombre: true, fechaInicio: true, fechaFin: true },
        }),
      ]);

      const bloquesClase = [];
      for (const { comision } of inscripciones) {
        if (["REGULAR", "LIBRE", "APROBADA"].includes(comision.materia.cursadas?.[0]?.estado)) continue;
        for (const bloque of comision.bloques) bloquesClase.push({ materia: comision.materia, dia: bloque.dia, titulo: comision.materia.nombre });
      }
      for (const materia of materiasDocente) {
        for (const comision of materia.comisiones) {
          for (const bloque of comision.bloques) bloquesClase.push({ materia, dia: bloque.dia, titulo: materia.nombre });
        }
      }

      const porFecha = new Map();
      for (let tiempo = inicioAnio.getTime(); tiempo <= finAnio.getTime(); tiempo += 86400000) {
        const fecha = new Date(tiempo);
        const dia = etiquetaDiaDeFecha(fecha);
        for (const bloque of bloquesClase) {
          if (bloque.dia === dia && claseOcurreEnFecha(bloque.materia, fecha, periodos)) marcarFecha(porFecha, fecha, bloque.titulo);
        }
        for (const actividad of actividades) {
          if (actividad.horaInicio && actividadOcurreEnFecha(actividad, fecha)) marcarFecha(porFecha, fecha, actividad.titulo);
        }
      }

      if (esAlumno) {
        const materiaIds = [...new Set(cursadas.map(({ materiaId }) => materiaId))];
        if (materiaIds.length > 0) {
          const examenes = await db.fechaExamen.findMany({
            where: { materiaId: { in: materiaIds }, fecha: { gte: inicioAnio, lte: finAnio } },
            select: { fecha: true, materia: { select: { nombre: true } } },
          });
          for (const examen of examenes) marcarFecha(porFecha, examen.fecha, examen.materia.nombre);
        }
      }

      const fechas = [...porFecha.entries()]
        .map(([fecha, titulos]) => ({ fecha, titulos: [...titulos] }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      res.json({ anio, fechas });
    } catch (e) { next(e); }
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

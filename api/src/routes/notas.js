import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { requiereMateriaAsignada, validarId, errorAcceso } from "../services/docentes.js";
import {
  validarCargaNotas, validarCorreccionNota, filtroAlumnosDeMateria, condicionConfigurada,
  verificarCarga, recalcularCursada, vencimientoRegularidad,
} from "../services/notas.js";
import { hoy } from "../services/examenes.js";
import { avisoCalificacion, avisoCorreccion, crearNotificacionesIndividuales } from "../services/notificaciones.js";

const DATOS_CAMBIO = {
  id: true, notaAnterior: true, notaNueva: true, motivo: true, creadoEn: true,
  autor: { select: { nombre: true, apellido: true } },
};

const DATOS_EVALUACION = {
  id: true, tipo: true, condicion: true, nota: true, fecha: true, observaciones: true,
  cargadaPor: { select: { nombre: true, apellido: true } },
  cambios: { select: DATOS_CAMBIO, orderBy: { creadoEn: "desc" } },
};

const CONDICION_MATERIA = { esPromocional: true, notaRegularizacion: true, notaPromocion: true, notaAprobacionFinal: true };

const materiaDelParametro = (req) => validarId(req.params.id, "identificador de la materia");

// La materia de una evaluación se resuelve desde la base, nunca desde el body.
async function materiaDeLaEvaluacion(req, db) {
  const id = validarId(req.params.id, "identificador de la evaluación");
  const evaluacion = await db.evaluacion.findUnique({ where: { id }, select: { cursada: { select: { materiaId: true } } } });
  if (!evaluacion) throw errorAcceso(404, "La evaluación no existe.");
  return evaluacion.cursada.materiaId;
}

// Mesas de final de la materia (de la más reciente a la más vieja) con sus inscriptos y a quiénes ya
// se les cargó la nota de esa mesa.
async function mesasDeFinal(db, materiaId) {
  const mesas = await db.fechaExamen.findMany({
    where: { materiaId, tipo: "FINAL" },
    select: {
      id: true, fecha: true, hora: true, aula: { select: { nombre: true } },
      inscripciones: { select: { alumnoId: true, modalidad: true } },
      notas: { select: { cursada: { select: { alumnoId: true } } } },
    },
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
  });
  return mesas.map(({ notas, ...mesa }) => ({ ...mesa, rendida: mesa.fecha <= hoy(), calificados: (notas ?? []).map((n) => n.cursada.alumnoId) }));
}

// La mesa tiene que ser un final de esta materia que ya se rindió (hoy o antes).
async function verificarMesa(tx, examenId, materiaId) {
  const mesa = await tx.fechaExamen.findUnique({
    where: { id: examenId }, select: { tipo: true, fecha: true, materiaId: true, inscripciones: { select: { alumnoId: true, modalidad: true } } },
  });
  if (!mesa || mesa.tipo !== "FINAL" || mesa.materiaId !== materiaId) throw errorAcceso(400, "Elegí una mesa de final de esta materia.");
  if (mesa.fecha > hoy()) throw errorAcceso(400, "Ese final todavía no se rindió: la nota se carga desde el día del examen.");
  return mesa;
}

const SIN_CONDICION = "Configurá la condición de la materia en «Mis materias» antes de cargar condiciones finales o exámenes finales.";

// El docente carga y corrige las notas de las materias que tiene asignadas (Seg-05).
// ADMIN puede en cualquiera. Los alumnos las ven en su historial (/api/evaluaciones)
// apenas se guardan: no hay un paso de aprobación administrativa en el medio.
// La condición final (regular/promocionado) y los exámenes finales además actualizan
// el estado de la materia según la condición que configuró el docente (ver services/notas.js).
export function crearRouterNotas(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("DOCENTE", "ADMIN"));

  // Alumnos de la materia con su estado, sus notas cargadas y sus correcciones, y las mesas de
  // final con sus inscriptos (para cargar las notas del examen final por mesa).
  router.get("/materias/:id", requiereMateriaAsignada(db, materiaDelParametro), async (req, res, next) => {
    try {
      const materiaId = req.materia.id;
      const condicion = await db.materia.findUnique({ where: { id: materiaId }, select: CONDICION_MATERIA });
      const alumnos = await db.usuario.findMany({
        where: filtroAlumnosDeMateria(materiaId),
        select: {
          id: true, nombre: true, apellido: true, email: true,
          cursadas: {
            where: { materiaId },
            select: {
              estado: true, nota: true, regularDesde: true, intentosFinal: true,
              evaluaciones: { select: DATOS_EVALUACION, orderBy: { fecha: "asc" } },
            },
          },
        },
        orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
      });

      const mesas = await mesasDeFinal(db, materiaId);
      res.json({
        materia: { ...req.materia, ...condicion, condicionConfigurada: condicionConfigurada(condicion) },
        mesas,
        alumnos: alumnos.map(({ cursadas, ...alumno }) => {
          const cursada = cursadas[0];
          return {
            ...alumno,
            estado: cursada?.estado ?? "PENDIENTE",
            nota: cursada?.nota ?? null,
            regularDesde: cursada?.regularDesde ?? null,
            venceRegularidad: vencimientoRegularidad(cursada?.regularDesde),
            intentosFinal: cursada?.intentosFinal ?? 0,
            evaluaciones: cursada?.evaluaciones ?? [],
          };
        }),
      });
    } catch (e) { next(e); }
  });

  // Carga una evaluación (tipo + fecha) con la nota de cada alumno, todo o nada.
  router.post("/materias/:id", requiereMateriaAsignada(db, materiaDelParametro), async (req, res, next) => {
    try {
      const carga = validarCargaNotas(req.body);
      const { tipo, notas } = carga;
      let { fecha } = carga;
      const materiaId = req.materia.id;
      const alumnoIds = notas.map((n) => n.alumnoId);
      const cierraCursada = tipo === "CONDICION_FINAL" || tipo === "FINAL";

      const creadas = await db.$transaction(async (tx) => {
        const materia = cierraCursada ? await tx.materia.findUnique({ where: { id: materiaId }, select: CONDICION_MATERIA }) : null;
        if (cierraCursada && !condicionConfigurada(materia)) throw errorAcceso(400, SIN_CONDICION);

        // Examen final: la fecha es la de la mesa y cada alumno tiene que estar inscripto (de ahí sale su modalidad).
        const modalidadDe = new Map();
        if (tipo === "FINAL") {
          const mesa = await verificarMesa(tx, carga.examenId, materiaId);
          fecha = mesa.fecha;
          for (const i of mesa.inscripciones) modalidadDe.set(i.alumnoId, i.modalidad);
          const sinInscripcion = notas.filter((n) => !modalidadDe.has(n.alumnoId));
          if (sinInscripcion.length) throw errorAcceso(400, "Solo se puede cargar la nota del final a los alumnos inscriptos a esa mesa.");
        }

        const validos = await tx.usuario.findMany({
          where: { id: { in: alumnoIds }, ...filtroAlumnosDeMateria(materiaId) },
          select: { id: true, nombre: true, apellido: true },
        });
        if (validos.length !== alumnoIds.length) throw errorAcceso(400, "Hay alumnos que no cursan esta materia.");
        const nombres = new Map(validos.map((a) => [a.id, `${a.nombre} ${a.apellido}`]));

        // Evita cargar dos veces la misma evaluación (ej. doble clic o recarga del formulario).
        const repetidas = await tx.evaluacion.findMany({
          where: { tipo, fecha, cursada: { materiaId, alumnoId: { in: alumnoIds } } },
          select: { cursada: { select: { alumnoId: true } } },
        });
        if (repetidas.length) {
          const lista = repetidas.map((r) => nombres.get(r.cursada.alumnoId)).join(", ");
          throw errorAcceso(409, `Ya hay una nota de esa evaluación en esa fecha para: ${lista}. Si hay un error, corregila.`);
        }

        const resultado = [];
        const avisos = []; // una notificación por alumno, con su propia nota
        for (const item of notas) {
          const { alumnoId, nota, observaciones, condicion } = item;
          const cursada = await tx.cursada.upsert({
            where: { alumnoId_materiaId: { alumnoId, materiaId } },
            create: { alumnoId, materiaId, estado: "EN_CURSO" },
            update: {},
            select: { id: true, estado: true, regularDesde: true, evaluacionesDesdeId: true },
          });
          const modalidad = modalidadDe.get(alumnoId) ?? null;
          verificarCarga({ tipo, condicion, nota, fecha, modalidad }, { cursada, materia, nombre: nombres.get(alumnoId) });

          resultado.push(await tx.evaluacion.create({
            data: {
              tipo, condicion, fecha, nota, observaciones, cursadaId: cursada.id, cargadaPorId: req.usuario.id,
              examenId: tipo === "FINAL" ? carga.examenId : null, modalidad,
            },
            select: { id: true, tipo: true, condicion: true, nota: true, fecha: true, observaciones: true, cursada: { select: { alumnoId: true } } },
          }));
          if (cierraCursada) await recalcularCursada(tx, { ...cursada, alumnoId, materiaId }, materia);
          avisos.push({
            usuarioId: alumnoId, tipo: "CALIFICACION_PUBLICADA", materiaId, autorId: req.usuario.id,
            ...avisoCalificacion({ materiaNombre: req.materia.nombre, tipo, condicion, nota, fecha }),
          });
        }
        // El alumno se entera apenas se publica; si algo falla antes, no se guarda ni la nota ni el aviso.
        await crearNotificacionesIndividuales(tx, avisos);
        return resultado;
      });

      res.status(201).json(creadas.map(({ cursada, ...evaluacion }) => ({ ...evaluacion, alumnoId: cursada.alumnoId })));
    } catch (e) { next(e); }
  });

  // Corrige una nota ya publicada. Cada corrección deja una fila en CambioNota
  // (nota anterior, nueva, autor, fecha y motivo) que no se edita ni se borra.
  // Si es una condición final o un examen final, se recalcula el estado de la materia.
  router.patch("/evaluaciones/:id", requiereMateriaAsignada(db, materiaDeLaEvaluacion), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador de la evaluación");
      const { nota, motivo } = validarCorreccionNota(req.body);

      const actualizada = await db.$transaction(async (tx) => {
        const actual = await tx.evaluacion.findUnique({
          where: { id },
          select: {
            nota: true, tipo: true, condicion: true, cursadaId: true,
            cursada: { select: { alumnoId: true, materiaId: true, evaluacionesDesdeId: true, materia: { select: CONDICION_MATERIA } } },
          },
        });
        if (!actual) throw errorAcceso(404, "La evaluación no existe.");
        if (actual.nota === nota) throw errorAcceso(400, "La nota nueva es igual a la actual.");

        const materia = actual.cursada.materia;
        if (actual.tipo === "CONDICION_FINAL") {
          const minimo = { PROMOCIONADO: materia.notaPromocion, REGULAR: materia.notaRegularizacion }[actual.condicion];
          if (minimo != null && nota < minimo) {
            const para = actual.condicion === "PROMOCIONADO" ? "promocionar" : "regularizar";
            throw errorAcceso(400, `Para ${para} hace falta ${minimo} o más.`);
          }
        }

        await tx.cambioNota.create({
          data: { evaluacionId: id, notaAnterior: actual.nota, notaNueva: nota, motivo, autorId: req.usuario.id },
        });
        const evaluacion = await tx.evaluacion.update({ where: { id }, data: { nota }, select: DATOS_EVALUACION });
        if (actual.tipo === "CONDICION_FINAL" || actual.tipo === "FINAL") {
          const { alumnoId, materiaId, evaluacionesDesdeId } = actual.cursada;
          await recalcularCursada(tx, { id: actual.cursadaId, alumnoId, materiaId, evaluacionesDesdeId }, materia);
        }
        await crearNotificacionesIndividuales(tx, [{
          usuarioId: actual.cursada.alumnoId, tipo: "CALIFICACION_PUBLICADA", materiaId: actual.cursada.materiaId, autorId: req.usuario.id,
          ...avisoCorreccion({ materiaNombre: req.materia.nombre, tipo: actual.tipo, notaAnterior: actual.nota, notaNueva: nota }),
        }]);
        // Si el alumno había reclamado esta nota, corregirla es la respuesta: sus solicitudes pendientes quedan
        // resueltas. No hace falta otro aviso: ya recibió el de la corrección de la nota.
        await tx.solicitudRevision.updateMany({
          where: { evaluacionId: id, estado: "PENDIENTE" },
          data: {
            estado: "RESUELTA", resueltaEn: new Date(), resueltaPorId: req.usuario.id,
            respuesta: `Se corrigió la nota: pasó de ${String(actual.nota).replace(".", ",")} a ${String(nota).replace(".", ",")}. Motivo: ${motivo}`,
          },
        });
        return evaluacion;
      });

      res.json(actualizada);
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterNotas();

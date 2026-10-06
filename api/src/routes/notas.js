import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { requiereMateriaAsignada, validarId, errorAcceso } from "../services/docentes.js";
import {
  validarCargaNotas, validarCorreccionNota, filtroAlumnosDeMateria, condicionConfigurada,
  verificarCarga, recalcularCursada, vencimientoRegularidad,
} from "../services/notas.js";

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

const SIN_CONDICION = "Configurá la condición de la materia en «Mis materias» antes de cargar condiciones finales o exámenes finales.";

// El docente carga y corrige las notas de las materias que tiene asignadas (Seg-05).
// ADMIN puede en cualquiera. Los alumnos las ven en su historial (/api/evaluaciones)
// apenas se guardan: no hay un paso de aprobación administrativa en el medio.
// La condición final (regular/promocionado) y los exámenes finales además actualizan
// el estado de la materia según la condición que configuró el docente (ver services/notas.js).
export function crearRouterNotas(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("DOCENTE", "ADMIN"));

  // Alumnos de la materia con su estado, sus notas cargadas y sus correcciones.
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

      res.json({
        materia: { ...req.materia, ...condicion, condicionConfigurada: condicionConfigurada(condicion) },
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
      const { tipo, fecha, notas } = validarCargaNotas(req.body);
      const materiaId = req.materia.id;
      const alumnoIds = notas.map((n) => n.alumnoId);
      const cierraCursada = tipo === "CONDICION_FINAL" || tipo === "FINAL";

      const creadas = await db.$transaction(async (tx) => {
        const materia = cierraCursada ? await tx.materia.findUnique({ where: { id: materiaId }, select: CONDICION_MATERIA }) : null;
        if (cierraCursada && !condicionConfigurada(materia)) throw errorAcceso(400, SIN_CONDICION);

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
        for (const item of notas) {
          const { alumnoId, nota, observaciones, condicion } = item;
          const cursada = await tx.cursada.upsert({
            where: { alumnoId_materiaId: { alumnoId, materiaId } },
            create: { alumnoId, materiaId, estado: "EN_CURSO" },
            update: {},
            select: { id: true, estado: true, regularDesde: true },
          });
          if (cierraCursada) verificarCarga({ tipo, condicion, nota, fecha }, { cursada, materia, nombre: nombres.get(alumnoId) });

          resultado.push(await tx.evaluacion.create({
            data: { tipo, condicion, fecha, nota, observaciones, cursadaId: cursada.id, cargadaPorId: req.usuario.id },
            select: { id: true, tipo: true, condicion: true, nota: true, fecha: true, observaciones: true, cursada: { select: { alumnoId: true } } },
          }));
          if (cierraCursada) await recalcularCursada(tx, cursada.id, materia);
        }
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
          select: { nota: true, tipo: true, condicion: true, cursadaId: true, cursada: { select: { materia: { select: CONDICION_MATERIA } } } },
        });
        if (!actual) throw errorAcceso(404, "La evaluación no existe.");
        if (actual.nota === nota) throw errorAcceso(400, "La nota nueva es igual a la actual.");

        const materia = actual.cursada.materia;
        if (actual.tipo === "CONDICION_FINAL") {
          const minimo = actual.condicion === "PROMOCIONADO" ? materia.notaPromocion : materia.notaRegularizacion;
          if (minimo != null && nota < minimo) {
            const para = actual.condicion === "PROMOCIONADO" ? "promocionar" : "regularizar";
            throw errorAcceso(400, `Para ${para} hace falta ${minimo} o más.`);
          }
        }

        await tx.cambioNota.create({
          data: { evaluacionId: id, notaAnterior: actual.nota, notaNueva: nota, motivo, autorId: req.usuario.id },
        });
        const evaluacion = await tx.evaluacion.update({ where: { id }, data: { nota }, select: DATOS_EVALUACION });
        if (actual.tipo === "CONDICION_FINAL" || actual.tipo === "FINAL") await recalcularCursada(tx, actual.cursadaId, materia);
        return evaluacion;
      });

      res.json(actualizada);
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterNotas();

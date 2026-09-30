import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { requiereMateriaAsignada, validarId, errorAcceso } from "../services/docentes.js";
import { validarCargaNotas, validarCorreccionNota, filtroAlumnosDeMateria } from "../services/notas.js";

const DATOS_CAMBIO = {
  id: true, notaAnterior: true, notaNueva: true, motivo: true, creadoEn: true,
  autor: { select: { nombre: true, apellido: true } },
};

const DATOS_EVALUACION = {
  id: true, tipo: true, nota: true, fecha: true, observaciones: true,
  cargadaPor: { select: { nombre: true, apellido: true } },
  cambios: { select: DATOS_CAMBIO, orderBy: { creadoEn: "desc" } },
};

const materiaDelParametro = (req) => validarId(req.params.id, "identificador de la materia");

// La materia de una evaluación se resuelve desde la base, nunca desde el body.
async function materiaDeLaEvaluacion(req, db) {
  const id = validarId(req.params.id, "identificador de la evaluación");
  const evaluacion = await db.evaluacion.findUnique({ where: { id }, select: { cursada: { select: { materiaId: true } } } });
  if (!evaluacion) throw errorAcceso(404, "La evaluación no existe.");
  return evaluacion.cursada.materiaId;
}

// El docente carga y corrige las notas de las materias que tiene asignadas (Seg-05).
// ADMIN puede en cualquiera. Los alumnos las ven en su historial (/api/evaluaciones)
// apenas se guardan: no hay un paso de aprobación administrativa en el medio.
export function crearRouterNotas(db = prisma) {
  const router = Router();
  router.use(requiereAuth, requiereRol("DOCENTE", "ADMIN"));

  // Alumnos de la materia con las notas que ya tienen cargadas y sus correcciones.
  router.get("/materias/:id", requiereMateriaAsignada(db, materiaDelParametro), async (req, res, next) => {
    try {
      const materiaId = req.materia.id;
      const alumnos = await db.usuario.findMany({
        where: filtroAlumnosDeMateria(materiaId),
        select: {
          id: true, nombre: true, apellido: true, email: true,
          cursadas: {
            where: { materiaId },
            select: { evaluaciones: { select: DATOS_EVALUACION, orderBy: { fecha: "asc" } } },
          },
        },
        orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
      });

      res.json({
        materia: req.materia,
        alumnos: alumnos.map(({ cursadas, ...alumno }) => ({ ...alumno, evaluaciones: cursadas[0]?.evaluaciones ?? [] })),
      });
    } catch (e) { next(e); }
  });

  // Carga una evaluación (tipo + fecha) con la nota de cada alumno, todo o nada.
  router.post("/materias/:id", requiereMateriaAsignada(db, materiaDelParametro), async (req, res, next) => {
    try {
      const { tipo, fecha, notas } = validarCargaNotas(req.body);
      const materiaId = req.materia.id;
      const alumnoIds = notas.map((n) => n.alumnoId);

      const creadas = await db.$transaction(async (tx) => {
        const validos = await tx.usuario.findMany({
          where: { id: { in: alumnoIds }, ...filtroAlumnosDeMateria(materiaId) },
          select: { id: true },
        });
        if (validos.length !== alumnoIds.length) throw errorAcceso(400, "Hay alumnos que no cursan esta materia.");

        // Evita cargar dos veces la misma evaluación (ej. doble clic o recarga del formulario).
        const repetidas = await tx.evaluacion.findMany({
          where: { tipo, fecha, cursada: { materiaId, alumnoId: { in: alumnoIds } } },
          select: { cursada: { select: { alumno: { select: { nombre: true, apellido: true } } } } },
        });
        if (repetidas.length) {
          const nombres = repetidas.map((r) => `${r.cursada.alumno.nombre} ${r.cursada.alumno.apellido}`).join(", ");
          throw errorAcceso(409, `Ya hay una nota de esa evaluación en esa fecha para: ${nombres}. Si hay un error, corregila.`);
        }

        const resultado = [];
        for (const { alumnoId, nota, observaciones } of notas) {
          const cursada = await tx.cursada.upsert({
            where: { alumnoId_materiaId: { alumnoId, materiaId } },
            create: { alumnoId, materiaId, estado: "EN_CURSO" },
            update: {},
            select: { id: true },
          });
          resultado.push(await tx.evaluacion.create({
            data: { tipo, fecha, nota, observaciones, cursadaId: cursada.id, cargadaPorId: req.usuario.id },
            select: { id: true, tipo: true, nota: true, fecha: true, observaciones: true, cursada: { select: { alumnoId: true } } },
          }));
        }
        return resultado;
      });

      res.status(201).json(creadas.map(({ cursada, ...evaluacion }) => ({ ...evaluacion, alumnoId: cursada.alumnoId })));
    } catch (e) { next(e); }
  });

  // Corrige una nota ya publicada. Cada corrección deja una fila en CambioNota
  // (nota anterior, nueva, autor, fecha y motivo) que no se edita ni se borra.
  router.patch("/evaluaciones/:id", requiereMateriaAsignada(db, materiaDeLaEvaluacion), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador de la evaluación");
      const { nota, motivo } = validarCorreccionNota(req.body);

      const actualizada = await db.$transaction(async (tx) => {
        const actual = await tx.evaluacion.findUnique({ where: { id }, select: { nota: true } });
        if (!actual) throw errorAcceso(404, "La evaluación no existe.");
        if (actual.nota === nota) throw errorAcceso(400, "La nota nueva es igual a la actual.");

        await tx.cambioNota.create({
          data: { evaluacionId: id, notaAnterior: actual.nota, notaNueva: nota, motivo, autorId: req.usuario.id },
        });
        return tx.evaluacion.update({ where: { id }, data: { nota }, select: DATOS_EVALUACION });
      });

      res.json(actualizada);
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterNotas();

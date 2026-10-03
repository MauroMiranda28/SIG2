import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorAcceso, requiereMateriaAsignada, validarId } from "../services/docentes.js";
import { DATOS_INFO_MATERIA, armarInfoMateria, armarRelacionadas, datosMateriaRelacionada } from "../services/consultaMaterias.js";
import { DATOS_CAMBIO_MATERIA, MAX_CAMBIOS_POR_CONSULTA } from "../services/auditoriaMateria.js";

// Inyección de DB para probar el contrato HTTP sin credenciales reales (igual que planes/carreras).
export function crearRouterDocentes(db = prisma) {
  const router = Router();
  router.use(requiereAuth);

  // Materias que dicta el docente logueado (tabla MateriaDocente), con sus comisiones y horarios.
  // El docente sale siempre del token: no se acepta un id por query ni por body.
  router.get("/mis-materias", requiereRol("DOCENTE"), async (req, res, next) => {
    try {
      const materias = await db.materia.findMany({
        where: { docentes: { some: { docenteId: req.usuario.id } } },
        select: {
          id: true, nombre: true, codigo: true, anio: true, cuatrimestre: true, cargaHoraria: true,
          programaUrl: true,
          programa: { select: { vigente: true } },
          plan: { select: { nombre: true, carrera: { select: { nombre: true, codigo: true } } } },
          comisiones: {
            select: {
              id: true, nombre: true,
              bloques: {
                select: { id: true, dia: true, horaInicio: true, horaFin: true, aula: { select: { id: true, nombre: true } } },
                orderBy: [{ dia: "asc" }, { horaInicio: "asc" }],
              },
            },
            orderBy: { nombre: "asc" },
          },
        },
        orderBy: [{ anio: "asc" }, { nombre: "asc" }],
      });

      // No se expone el nombre del archivo en el servidor: solo si hay PDF o no.
      res.json(materias.map(({ programaUrl, programa, ...materia }) => ({
        ...materia,
        tienePdf: Boolean(programaUrl),
        tieneProgramaTexto: Boolean(programa?.vigente),
      })));
    } catch (e) { next(e); }
  });

  // Aulas disponibles para el formulario de horarios.
  router.get("/aulas", requiereRol("DOCENTE", "ADMIN"), async (req, res, next) => {
    try {
      res.json(await db.aula.findMany({ select: { id: true, nombre: true, edificio: true, capacidad: true }, orderBy: { nombre: "asc" } }));
    } catch (e) { next(e); }
  });

  const materiaDelParametro = (req) => validarId(req.params.id, "identificador de la materia");

  // Información académica de una materia. Es de solo lectura y no exige que el docente la dicte:
  // sirve también para consultar las materias relacionadas con la suya (y es la misma
  // información que ya ve cualquier usuario en GET /api/materias/:id).
  router.get("/materias/:id", requiereRol("DOCENTE", "ADMIN"), async (req, res, next) => {
    try {
      const id = materiaDelParametro(req);
      const materia = await db.materia.findUnique({ where: { id }, select: DATOS_INFO_MATERIA });
      if (!materia) throw errorAcceso(404, "La materia no existe.");
      res.json(armarInfoMateria(materia, req.usuario));
    } catch (e) { next(e); }
  });

  // Materias relacionadas dentro del plan: correlativas previas y posteriores.
  router.get("/materias/:id/relacionadas", requiereRol("DOCENTE", "ADMIN"), async (req, res, next) => {
    try {
      const id = materiaDelParametro(req);
      const datos = datosMateriaRelacionada(req.usuario.id);
      const materia = await db.materia.findUnique({
        where: { id },
        select: {
          id: true, nombre: true, codigo: true,
          requiere: { select: { requiere: { select: datos } } },
          requeridaPor: { select: { materia: { select: datos } } },
        },
      });
      if (!materia) throw errorAcceso(404, "La materia no existe.");
      res.json({ materia: { id: materia.id, nombre: materia.nombre, codigo: materia.codigo }, ...armarRelacionadas(materia) });
    } catch (e) { next(e); }
  });

  // Quién modificó los horarios o el programa de la materia, y cuándo. Solo el docente asignado
  // (o ADMIN): el registro sirve para detectar errores o cambios indebidos en SU materia.
  router.get("/materias/:id/historial", requiereRol("DOCENTE", "ADMIN"), requiereMateriaAsignada(db, materiaDelParametro), async (req, res, next) => {
    try {
      const cambios = await db.cambioMateria.findMany({
        where: { materiaId: req.materia.id },
        select: DATOS_CAMBIO_MATERIA,
        orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
        take: MAX_CAMBIOS_POR_CONSULTA,
      });
      res.json({ materia: req.materia, cambios });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterDocentes();

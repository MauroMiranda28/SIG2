import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorAcceso, requiereMateriaAsignada, validarId } from "../services/docentes.js";
import { filtroAlumnosDeMateria, validarCondicionMateria } from "../services/notas.js";
import { crearNotificaciones, validarAviso } from "../services/notificaciones.js";
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
          esPromocional: true, notaRegularizacion: true, notaPromocion: true, notaAprobacionFinal: true,
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

  // Condición de la materia: si es promocional y con cuánto se regulariza, se promociona
  // y se aprueba el final. Solo el docente asignado o ADMIN (Seg-05).
  // No recalcula las notas ya cargadas: rige para las próximas cargas.
  router.put(
    "/materias/:id/condicion",
    requiereRol("DOCENTE", "ADMIN"),
    requiereMateriaAsignada(db, (req) => validarId(req.params.id, "identificador de la materia")),
    async (req, res, next) => {
      try {
        const datos = validarCondicionMateria(req.body);
        res.json(await db.materia.update({
          where: { id: req.materia.id },
          data: datos,
          select: { id: true, esPromocional: true, notaRegularizacion: true, notaPromocion: true, notaAprobacionFinal: true },
        }));
      } catch (e) { next(e); }
    }
  );

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

  // Aviso del docente a los alumnos de su materia (los que tienen cursada o eligieron una comisión).
  // Llega a cada uno como una notificación AVISO_DOCENTE en su historial. Los destinatarios los
  // arma el servidor: el docente no manda una lista de alumnos, solo el título y el mensaje.
  router.post("/materias/:id/avisos", requiereRol("DOCENTE", "ADMIN"), requiereMateriaAsignada(db, materiaDelParametro), async (req, res, next) => {
    try {
      const { titulo, mensaje } = validarAviso(req.body);
      const alumnos = await db.usuario.findMany({ where: filtroAlumnosDeMateria(req.materia.id), select: { id: true } });
      if (!alumnos.length) throw errorAcceso(409, "La materia todavía no tiene alumnos a quienes avisar.");

      const { creadas } = await crearNotificaciones(db, alumnos.map((a) => a.id), {
        tipo: "AVISO_DOCENTE", titulo, mensaje, materiaId: req.materia.id, autorId: req.usuario.id,
      });
      res.status(201).json({ materia: req.materia, enviadas: creadas });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterDocentes();

import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";

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

  return router;
}

export default crearRouterDocentes();

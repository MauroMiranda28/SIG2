import fs from "node:fs";
import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { errorAcceso, requiereMateriaAsignada, validarId, verificarAccesoMateria } from "../services/docentes.js";
import {
  DATOS_ARCHIVO, TIPOS, borrarArchivos, cabeceraDescarga, extension, nombreVisible, rutaArchivo, subirArchivosTarea,
} from "../services/archivosTarea.js";
import { materiasQueCursa } from "../services/proximasEvaluaciones.js";

// La materia se resuelve siempre desde la base (por la tarea o por el archivo), nunca desde el body.
async function materiaDeLaTarea(req, db) {
  const id = validarId(req.params.id, "identificador de la tarea");
  const tarea = await db.tarea.findUnique({ where: { id }, select: { materiaId: true } });
  if (!tarea) throw errorAcceso(404, "La tarea no existe.");
  return tarea.materiaId;
}

async function materiaDelArchivo(req, db) {
  const id = validarId(req.params.id, "identificador del archivo");
  const archivo = await db.archivoTarea.findUnique({ where: { id }, select: { tarea: { select: { materiaId: true } } } });
  if (!archivo) throw errorAcceso(404, "El archivo no existe.");
  return archivo.tarea.materiaId;
}

// Adjuntos de las tareas. Los sube y los quita el docente de la materia (o ADMIN, Seg-05);
// los descargan él y los alumnos que cursan la materia.
export function crearRouterArchivosTarea(db = prisma) {
  const router = Router();
  router.use(requiereAuth);

  // Sube uno o varios archivos (campo «archivos»). El acceso se verifica ANTES de recibirlos,
  // así nadie sin permiso escribe en disco.
  router.post(
    "/tareas/:id",
    requiereRol("DOCENTE", "ADMIN"),
    requiereMateriaAsignada(db, materiaDeLaTarea),
    subirArchivosTarea,
    async (req, res, next) => {
      const archivos = req.files ?? [];
      try {
        if (!archivos.length) throw errorAcceso(400, "No se subió ningún archivo.");
        const tareaId = validarId(req.params.id, "identificador de la tarea");
        const creados = await db.$transaction(archivos.map((a) => db.archivoTarea.create({
          data: { tareaId, nombre: nombreVisible(a.originalname), archivo: a.filename, tipo: TIPOS[extension(a.originalname)], tamanio: a.size },
          select: DATOS_ARCHIVO,
        })));
        res.status(201).json(creados);
      } catch (e) {
        await borrarArchivos(archivos.map((a) => a.path)); // no dejar archivos huérfanos si algo falló
        next(e);
      }
    },
  );

  // Descarga. Docente de la materia o ADMIN; alumno solo si cursa la materia.
  router.get("/:id", async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador del archivo");
      const archivo = await db.archivoTarea.findUnique({
        where: { id }, select: { nombre: true, archivo: true, tipo: true, tarea: { select: { materiaId: true } } },
      });
      if (!archivo) throw errorAcceso(404, "El archivo no existe.");

      if (req.usuario.rol === "ALUMNO") {
        const materias = await materiasQueCursa(db, req.usuario.id);
        if (!materias.includes(archivo.tarea.materiaId)) throw errorAcceso(403, "Ese archivo es de una materia que no estás cursando.");
      } else {
        await verificarAccesoMateria(db, req.usuario, archivo.tarea.materiaId);
      }

      const ruta = rutaArchivo(archivo.archivo);
      if (!ruta || !fs.existsSync(ruta)) throw errorAcceso(404, "El archivo ya no está disponible.");
      res.setHeader("Content-Type", archivo.tipo);
      res.setHeader("Content-Disposition", cabeceraDescarga(archivo.nombre));
      fs.createReadStream(ruta).on("error", next).pipe(res);
    } catch (e) { next(e); }
  });

  router.delete("/:id", requiereRol("DOCENTE", "ADMIN"), requiereMateriaAsignada(db, materiaDelArchivo), async (req, res, next) => {
    try {
      const id = validarId(req.params.id, "identificador del archivo");
      const borrado = await db.archivoTarea.delete({ where: { id }, select: { archivo: true } });
      await borrarArchivos([rutaArchivo(borrado.archivo)]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
}

export default crearRouterArchivosTarea();

import { Router } from "express";
import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";
import { requiereMateriaAsignada, validarId, errorAcceso } from "../services/docentes.js";
import {
  subirProgramaPdf, esPdf, leerCabecera, rutaPrograma, borrarArchivo, nombreDescarga, escribirProgramaPdf,
} from "../services/programas.js";
import fs from "node:fs";
import { guardarProgramaConRegistro } from "../services/auditoriaMateria.js";

import { resolverPlanAlumno } from "../services/planes.js";
import { bibliografiaDelAlumno } from "../services/bibliografia.js";

const router = Router();

// Mat-01: materias de la carrera del alumno, con el estado de cursada de cada una
// Mat-08: búsqueda por nombre o código con ?q=
router.get("/", requiereAuth, async (req, res, next) => {
  try {
    const planId = await resolverPlanAlumno(prisma, req.usuario.id);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const materias = await prisma.materia.findMany({
      where: {
        planId,
        ...(q ? {
          OR: [
            { nombre: { contains: q, mode: "insensitive" } },
            { codigo: { contains: q, mode: "insensitive" } },
          ],
        } : {}),
      },
      include: {
        cursadas: {
          where: { alumnoId: req.usuario.id },
          select: { estado: true, nota: true },
        },
      },
      orderBy: [{ anio: "asc" }, { nombre: "asc" }],
    });

    const materiasConEstado = materias.map(({ cursadas, ...materia }) => ({
      ...materia,
      estado: cursadas[0]?.estado ?? "PENDIENTE",
      nota: cursadas[0]?.nota ?? null,
    }));

    res.json(materiasConEstado);
  } catch (e) {
    next(e);
  }
});

// Bibliografía recomendada de todas las materias del plan del alumno.
// Va antes de "/:id" para que Express no tome "bibliografia" como un id.
router.get("/bibliografia", requiereAuth, requiereRol("ALUMNO"), async (req, res, next) => {
  try {
    res.json(await bibliografiaDelAlumno(prisma, req.usuario.id));
  } catch (e) {
    next(e);
  }
});

// Mat-03: información de una materia
router.get("/:id", requiereAuth, async (req, res, next) => {
  try {
    const materia = await prisma.materia.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        plan: { include: { carrera: true } },
        programa: true,
        docentes: { include: { docente: { select: { nombre: true, apellido: true } } } },
      },
    });

    if (!materia) return res.status(404).json({ error: "No existe esa materia" });
    res.json(materia);
  } catch (e) {
    next(e);
  }
});

// HU-PRO: programa de una materia (contenidos y bibliografía en texto)
router.get("/:id/programa", requiereAuth, async (req, res, next) => {
  try {
    const materia = await prisma.materia.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        nombre: true,
        codigo: true,
        programa: {
          select: {
            contenidos: true,
            bibliografia: true,
            version: true,
            vigente: true,
            actualizadoEn: true,
          },
        },
      },
    });

    if (!materia) return res.status(404).json({ error: "No existe esa materia" });
    if (!materia.programa || !materia.programa.vigente) {
      return res.status(404).json({ error: "Esta materia todavía no tiene un programa vigente publicado" });
    }

    const { vigente, ...programa } = materia.programa;
    res.json({ materia: { nombre: materia.nombre, codigo: materia.codigo }, programa });
  } catch (e) {
    next(e);
  }
});

// Horarios U-01: comisiones de una materia con su horario
router.get("/:id/comisiones", requiereAuth, async (req, res, next) => {
  try {
    const materiaId = Number(req.params.id);

    const comisiones = await prisma.comision.findMany({
      where: { materiaId },
      include: {
        bloques: { include: { aula: true }, orderBy: [{ dia: "asc" }, { horaInicio: "asc" }] },
        inscripciones: { where: { alumnoId: req.usuario.id }, select: { id: true } },
      },
      orderBy: { nombre: "asc" },
    });

    const conElegida = comisiones.map(({ inscripciones, ...comision }) => ({
      ...comision,
      elegidaPorMi: inscripciones.length > 0,
    }));

    res.json(conElegida);
  } catch (e) {
    next(e);
  }
});

// Cargar el programa de la materia en PDF.
// ADMIN puede en cualquier materia; DOCENTE solo en las que tiene asignadas (Seg-05).
// El acceso se verifica ANTES de recibir el archivo, así nadie sin permiso escribe en disco.
router.post(
  "/:id/programa",
  requiereAuth,
  requiereRol("DOCENTE", "ADMIN"),
  requiereMateriaAsignada(prisma, (req) => validarId(req.params.id, "identificador de la materia")),
  subirProgramaPdf,
  async (req, res, next) => {
    const archivo = req.file;
    try {
      if (!archivo) throw errorAcceso(400, "No se subió ningún archivo PDF.");
      if (!esPdf(await leerCabecera(archivo.path))) throw errorAcceso(400, "El archivo no es un PDF válido.");

      const anterior = await prisma.materia.findUnique({ where: { id: req.materia.id }, select: { programaUrl: true } });
      // Quién subió el programa queda registrado en la misma transacción (CambioMateria).
      const materia = await guardarProgramaConRegistro(prisma, {
        materiaId: req.materia.id,
        archivoGuardado: archivo.filename,
        nombreOriginal: archivo.originalname,
        reemplaza: Boolean(anterior?.programaUrl),
        autorId: req.usuario.id,
      });
      const rutaAnterior = rutaPrograma(anterior?.programaUrl);
      if (rutaAnterior && rutaAnterior !== archivo.path) await borrarArchivo(rutaAnterior);

      res.json({ mensaje: "Programa cargado con éxito", materia: { ...materia, tienePdf: true } });
    } catch (e) {
      await borrarArchivo(archivo?.path); // no dejar archivos huérfanos si algo falló
      next(e);
    }
  }
);

// Descargar el programa en PDF (cualquier usuario logueado).
// Si hay un PDF subido, se entrega ese; si no, se arma uno con el programa en texto.
router.get("/:id/programa/pdf", requiereAuth, async (req, res, next) => {
  try {
    const id = validarId(req.params.id, "identificador de la materia");
    const materia = await prisma.materia.findUnique({
      where: { id },
      select: {
        nombre: true, codigo: true, programaUrl: true,
        programa: { select: { contenidos: true, bibliografia: true, version: true, vigente: true, actualizadoEn: true } },
      },
    });
    if (!materia) throw errorAcceso(404, "No existe esa materia.");

    const nombre = nombreDescarga(materia.codigo);
    const ruta = rutaPrograma(materia.programaUrl);
    if (ruta && fs.existsSync(ruta)) {
      return res.download(ruta, nombre, { headers: { "Content-Type": "application/pdf" } }, (err) => {
        if (err && !res.headersSent) next(err);
      });
    }

    if (materia.programa?.vigente) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
      return escribirProgramaPdf(res, materia);
    }

    throw errorAcceso(404, "Esta materia todavía no tiene un programa para descargar.");
  } catch (e) {
    next(e);
  }
});

export default router;
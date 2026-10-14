import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { errorAcceso } from "./docentes.js";

// Archivos adjuntos de las tareas (consignas, plantillas, datos). Mismo criterio que el programa en PDF:
// se guardan en api/uploads/tareas/ con un nombre generado por el servidor (nunca el del cliente) y en
// la base queda solo ese nombre, más el original para mostrarlo y descargarlo.

export const DIR_TAREAS = fileURLToPath(new URL("../../uploads/tareas/", import.meta.url));
export const TAMANIO_MAXIMO = 10 * 1024 * 1024; // 10 MB por archivo
export const MAX_ARCHIVOS = 5; // por subida
const LARGO_NOMBRE_MAXIMO = 150;

// Extensión → tipo con el que se descarga. Solo se aceptan estas.
export const TIPOS = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export const extension = (nombre) => String(nombre ?? "").split(".").pop().toLowerCase();
export const extensionPermitida = (nombre) => String(nombre ?? "").includes(".") && Object.hasOwn(TIPOS, extension(nombre));

// Nombre para mostrar: sin carpetas ni caracteres de control, y con un largo razonable.
export function nombreVisible(original) {
  const base = String(original ?? "").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"]/g, "").trim() || "archivo";
  if (base.length <= LARGO_NOMBRE_MAXIMO) return base;
  const ext = extension(base);
  return `${base.slice(0, LARGO_NOMBRE_MAXIMO - ext.length - 1)}.${ext}`;
}

const almacenamiento = multer.diskStorage({
  destination(req, file, cb) {
    fs.mkdir(DIR_TAREAS, { recursive: true }, (err) => cb(err, DIR_TAREAS));
  },
  filename(req, file, cb) {
    cb(null, `tarea-${req.params.id}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension(file.originalname)}`);
  },
});

const multerTarea = multer({
  storage: almacenamiento,
  limits: { fileSize: TAMANIO_MAXIMO, files: MAX_ARCHIVOS },
  fileFilter(req, file, cb) {
    if (!extensionPermitida(file.originalname)) {
      return cb(errorAcceso(400, `«${nombreVisible(file.originalname)}» no es un tipo de archivo permitido (PDF, Word, Excel, PowerPoint, imágenes, ZIP o texto).`));
    }
    cb(null, true);
  },
}).array("archivos", MAX_ARCHIVOS);

// Envuelve multer para devolver errores entendibles en lugar de un 500.
export function subirArchivosTarea(req, res, next) {
  multerTarea(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return next(errorAcceso(413, "Cada archivo puede pesar hasta 10 MB."));
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      return next(errorAcceso(400, `Subí hasta ${MAX_ARCHIVOS} archivos por vez, en el campo «archivos».`));
    }
    if (err instanceof multer.MulterError) return next(errorAcceso(400, "No se pudieron recibir los archivos."));
    next(err);
  });
}

// Ruta en disco a partir del nombre guardado: siempre dentro de la carpeta de tareas.
export function rutaArchivo(guardado) {
  if (typeof guardado !== "string" || !guardado.trim()) return null;
  const nombre = guardado.split(/[\\/]/).pop();
  if (!nombre || nombre === "." || nombre === "..") return null;
  return path.join(DIR_TAREAS, nombre);
}

export async function borrarArchivos(rutas) {
  await Promise.all(rutas.filter(Boolean).map((r) => fs.promises.unlink(r).catch(() => {})));
}

// Content-Disposition con el nombre original (ASCII de respaldo + UTF-8 para tildes).
export function cabeceraDescarga(nombre) {
  const ascii = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

export const DATOS_ARCHIVO = { id: true, nombre: true, tipo: true, tamanio: true, creadoEn: true };

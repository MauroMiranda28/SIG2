import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import PDFDocument from "pdfkit";
import { errorAcceso } from "./docentes.js";

// Carpeta fija: api/uploads/programas (no depende de desde dónde se levante la API).
export const DIR_PROGRAMAS = fileURLToPath(new URL("../../uploads/programas/", import.meta.url));
export const TAMANIO_MAXIMO = 10 * 1024 * 1024; // 10 MB

const almacenamiento = multer.diskStorage({
  destination(req, file, cb) {
    fs.mkdir(DIR_PROGRAMAS, { recursive: true }, (err) => cb(err, DIR_PROGRAMAS));
  },
  // Nombre generado por el servidor: nunca se usa el nombre que manda el cliente.
  filename(req, file, cb) {
    cb(null, `materia-${req.params.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pdf`);
  },
});

const multerPrograma = multer({
  storage: almacenamiento,
  limits: { fileSize: TAMANIO_MAXIMO, files: 1 },
  fileFilter(req, file, cb) {
    const pareceNombrePdf = /\.pdf$/i.test(file.originalname ?? "");
    if (file.mimetype !== "application/pdf" && !pareceNombrePdf) return cb(errorAcceso(400, "El programa tiene que ser un archivo PDF."));
    cb(null, true);
  },
}).single("archivo");

// Envuelve multer para devolver errores entendibles en lugar de un 500.
export function subirProgramaPdf(req, res, next) {
  multerPrograma(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return next(errorAcceso(413, "El PDF no puede superar los 10 MB."));
    if (err instanceof multer.MulterError) return next(errorAcceso(400, "Mandá un solo archivo PDF en el campo «archivo»."));
    next(err);
  });
}

// Un PDF real empieza con "%PDF-", sin importar la extensión o el tipo que diga el navegador.
export function esPdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

export async function leerCabecera(ruta, bytes = 5) {
  const archivo = await fs.promises.open(ruta, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    await archivo.read(buffer, 0, bytes, 0);
    return buffer;
  } finally {
    await archivo.close();
  }
}

// En la base se guarda solo el nombre del archivo. Si hay un valor viejo con ruta
// (ej. "uploads/programas/abc" o "uploads\\programas\\abc"), se toma solo el final:
// así nunca se puede apuntar a un archivo fuera de la carpeta de programas.
export function rutaPrograma(programaUrl) {
  if (typeof programaUrl !== "string" || !programaUrl.trim()) return null;
  const nombre = programaUrl.split(/[\\/]/).pop();
  if (!nombre || nombre === "." || nombre === "..") return null;
  return path.join(DIR_PROGRAMAS, nombre);
}

export async function borrarArchivo(ruta) {
  if (!ruta) return;
  await fs.promises.unlink(ruta).catch(() => {});
}

export function nombreDescarga(codigo) {
  const limpio = String(codigo ?? "").replace(/[^A-Za-z0-9_-]/g, "") || "materia";
  return `programa-${limpio}.pdf`;
}

// Si no se subió un PDF, se arma uno con el programa cargado como texto (HU-PRO).
export function escribirProgramaPdf(stream, materia) {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(stream);
  doc.fontSize(18).text(`Programa de ${materia.nombre}`, { align: "center" });
  doc.fontSize(11).text(`Código ${materia.codigo} · Versión ${materia.programa.version}`, { align: "center" });
  doc.moveDown(1.5);
  doc.fontSize(13).text("Contenidos", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).text(materia.programa.contenidos);
  if (materia.programa.bibliografia) {
    doc.moveDown(1);
    doc.fontSize(13).text("Bibliografía", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(materia.programa.bibliografia);
  }
  doc.moveDown(1.5);
  doc.fontSize(9).text(`Actualizado el ${new Date(materia.programa.actualizadoEn).toLocaleDateString("es-AR")}`);
  doc.end();
}

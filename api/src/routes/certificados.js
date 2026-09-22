import { Router } from "express";
import PDFDocument from "pdfkit";

import { prisma } from "../db.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";

const router = Router();

// Mat-09: certificado de notas en PDF, para trámites externos (becas, intercambio, etc.)
router.get("/notas", requiereAuth, requiereRol("ALUMNO"), async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      include: { carrera: true },
    });

    const cursadas = await prisma.cursada.findMany({
      where: { alumnoId: req.usuario.id, estado: "APROBADA" },
      include: { materia: true },
      orderBy: [{ materia: { anio: "asc" } }, { materia: { nombre: "asc" } }],
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="certificado-notas-${usuario.id}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(18).text("Certificado Analítico de Notas", { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(11);
    doc.text(`Alumno: ${usuario.nombre} ${usuario.apellido}`);
    doc.text(`Correo institucional: ${usuario.email}`);
    doc.text(`Carrera: ${usuario.carrera?.nombre ?? "-"}`);
    doc.text(`Emitido: ${new Date().toLocaleDateString("es-AR")}`);
    doc.moveDown(1.5);

    if (cursadas.length === 0) {
      doc.text("Todavía no tenés materias aprobadas registradas.");
    } else {
      doc.fontSize(13).text("Materias aprobadas", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      cursadas.forEach((c) => {
        doc.text(`${c.materia.codigo}  —  ${c.materia.nombre}      Nota: ${c.nota ?? "-"}`);
      });
    }

    doc.end();
  } catch (e) {
    next(e);
  }
});

export default router;

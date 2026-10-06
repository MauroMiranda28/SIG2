import "dotenv/config";
import express from "express";
import cors from "cors";

import authRouter from "./routes/auth.js";
import materiasRouter from "./routes/materias.js";
import horariosRouter from "./routes/horarios.js";
import certificadosRouter from "./routes/certificados.js";

import planesRouter from "./routes/planes.js";
import carrerasRouter from "./routes/carreras.js";
import evaluacionesRouter from "./routes/evaluaciones.js";
import revisionesRouter from "./routes/revisiones.js";
import asistenciasRouter from "./routes/asistencias.js";
import promedioRouter from "./routes/promedio.js";
import docentesRouter from "./routes/docentes.js";
import notasRouter from "./routes/notas.js";
import correlatividadesRouter from "./routes/correlatividades.js";
import notificacionesRouter from "./routes/notificaciones.js";
import examenesRouter from "./routes/examenes.js";
import tareasRouter from "./routes/tareas.js";
import asignacionesRouter from "./routes/asignaciones.js";
import { manejarErrores } from "./middleware/errores.js";

import programasRouter from "./routes/programas.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/materias", materiasRouter);
app.use("/api/horarios", horariosRouter);
app.use("/api/certificados", certificadosRouter);
app.use("/api/planes", planesRouter);
app.use("/api/carreras", carrerasRouter);
app.use("/api/evaluaciones", evaluacionesRouter);
app.use("/api/revisiones", revisionesRouter);
app.use("/api/asistencias", asistenciasRouter);
app.use("/api/promedio", promedioRouter);
app.use("/api/docentes", docentesRouter);
app.use("/api/programas", programasRouter);
app.use("/api/notas", notasRouter);
app.use("/api/correlatividades", correlatividadesRouter);
app.use("/api/notificaciones", notificacionesRouter);
app.use("/api/examenes", examenesRouter);
app.use("/api/tareas", tareasRouter);
app.use("/api/asignaciones", asignacionesRouter);

// Cada módulo agrega su router acá. Un archivo por módulo en src/routes/.

// No expone detalles internos al cliente (ver middleware/errores.js).
app.use(manejarErrores);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}`));

import "dotenv/config";
import express from "express";
import cors from "cors";

import authRouter from "./routes/auth.js";
import materiasRouter from "./routes/materias.js";
import horariosRouter from "./routes/horarios.js";
import certificadosRouter from "./routes/certificados.js";

import planesRouter from "./routes/planes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/materias", materiasRouter);
app.use("/api/horarios", horariosRouter);
app.use("/api/certificados", certificadosRouter);
app.use("/api/planes", planesRouter);

// Cada módulo agrega su router acá. Un archivo por módulo en src/routes/.

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Error interno" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}`));

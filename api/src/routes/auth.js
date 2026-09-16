import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { requiereAuth } from "../middleware/auth.js";

const router = Router();

// Seg-04: el rol se deduce del dominio del correo, no lo elige quien se
// registra (si no, cualquiera podría mandar rol: "ADMIN" en el body).
// @alumnos.ucse.edu.ar -> ALUMNO, @ucse.edu.ar -> DOCENTE. En ese orden,
// porque "alumnos.ucse.edu.ar" también termina en "ucse.edu.ar".
function rolPorDominio(email) {
  if (email.endsWith("@alumnos.ucse.edu.ar")) return "ALUMNO";
  if (email.endsWith("@ucse.edu.ar")) return "DOCENTE";
  return null;
}

// Seg-04 / U-01: registro con correo institucional
router.post("/registro", async (req, res, next) => {
  try {
    const { email, password, nombre, apellido } = req.body;
    const emailNormalizado = email?.trim().toLowerCase();
    const rol = emailNormalizado && rolPorDominio(emailNormalizado);

    if (!rol) {
      return res.status(400).json({ error: "Usá tu correo institucional" });
    }
    if (await prisma.usuario.findUnique({ where: { email: emailNormalizado } })) {
      return res.status(409).json({ error: "Ese correo ya está registrado" });
    }

    const usuario = await prisma.usuario.create({
      data: {
        email: emailNormalizado,
        nombre,
        apellido,
        rol,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });

    res.status(201).json({ id: usuario.id, email: usuario.email });
  } catch (e) {
    next(e);
  }
});

// Seg-01: login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const emailNormalizado = email?.trim().toLowerCase();

    const usuario = await prisma.usuario.findUnique({ where: { email: emailNormalizado } });

    if (!usuario || !(await bcrypt.compare(password, usuario.passwordHash))) {
      return res.status(401).json({ error: "Correo o contraseña incorrectos" });
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } });
  } catch (e) {
    next(e);
  }
});

// U-02: ver y editar los datos propios
router.get("/perfil", requiereAuth, async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: { id: true, email: true, nombre: true, apellido: true, rol: true, carreraId: true },
    });
    res.json(usuario);
  } catch (e) {
    next(e);
  }
});

router.patch("/perfil", requiereAuth, async (req, res, next) => {
  try {
    const { nombre, apellido } = req.body;
    const usuario = await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: { nombre, apellido },
      select: { id: true, nombre: true, apellido: true },
    });
    res.json(usuario);
  } catch (e) {
    next(e);
  }
});

export default router;

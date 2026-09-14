import jwt from "jsonwebtoken";

// Seg-01: valida el token y deja el usuario en req.usuario
export function requiereAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Falta el token" });
  }
  try {
    req.usuario = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o vencido" });
  }
}

// Seg-05: restringe por rol. Uso: requiereRol("DOCENTE", "ADMIN")
export function requiereRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      return res.status(403).json({ error: "No tenés permiso para esto" });
    }
    next();
  };
}

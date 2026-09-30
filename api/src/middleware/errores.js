// Manejador de errores global.
// Los errores 4xx (validaciones, permisos, no encontrado) muestran su mensaje, que está
// escrito para el usuario. Los errores internos (Prisma, bugs) NO: su mensaje puede traer
// datos de la base, como el hash de una contraseña o datos de otro usuario.
// El detalle completo queda solo en la consola del servidor.
export function manejarErrores(err, req, res, next) {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  if (res.headersSent) return next(err);
  res.status(status).json({
    error: status === 500 ? "Ocurrió un error interno. Intentá de nuevo más tarde." : err.message,
  });
}

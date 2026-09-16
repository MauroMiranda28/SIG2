export function errorPlan(status, message) {
  return Object.assign(new Error(message), { status });
}

// Nunca elegir arbitrariamente la versión más nueva ni mezclar planes.
export async function resolverPlanAlumno(db, alumnoId) {
  const alumno = await db.usuario.findUnique({
    where: { id: alumnoId },
    select: { carreraId: true, planEstudioId: true },
  });
  if (!alumno) throw errorPlan(401, "El usuario ya no existe");
  if (!alumno.carreraId) throw errorPlan(404, "Todavía no tenés una carrera asignada. Consultá a administración.");
  if (alumno.planEstudioId) {
    const plan = await db.planEstudio.findUnique({ where: { id: alumno.planEstudioId } });
    if (!plan || plan.carreraId !== alumno.carreraId) {
      throw errorPlan(409, "El plan asignado no corresponde a tu carrera. Consultá a administración.");
    }
    // Un alumno puede seguir cursando una versión que ya no admite nuevos ingresos.
    return plan.id;
  }
  const planes = await db.planEstudio.findMany({
    where: { carreraId: alumno.carreraId, vigente: true }, select: { id: true }, take: 2,
  });
  if (!planes.length) throw errorPlan(404, "Tu carrera todavía no tiene un plan vigente cargado.");
  if (planes.length > 1) throw errorPlan(409, "Hay varios planes para tu carrera. Administración debe asignarte el que te corresponde.");
  return planes[0].id;
}

export function validarPlan(body) {
  const { nombre, anio, carreraId, vigente = true, materias = [] } = body ?? {};
  const texto = (v, max) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
  const entero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  if (!texto(nombre, 120)) throw errorPlan(400, "El nombre del plan es obligatorio (máximo 120 caracteres).");
  if (!entero(anio, 1900, 2100)) throw errorPlan(400, "El año del plan debe estar entre 1900 y 2100.");
  if (!entero(carreraId, 1, 2147483647)) throw errorPlan(400, "Seleccioná una carrera válida.");
  if (typeof vigente !== "boolean") throw errorPlan(400, "La vigencia debe ser verdadera o falsa.");
  if (!Array.isArray(materias) || materias.length > 200) throw errorPlan(400, "El plan admite hasta 200 materias.");
  const codigos = new Set();
  const normalizadas = materias.map((m, i) => {
    if (!m || !texto(m.nombre, 160) || !texto(m.codigo, 40)) throw errorPlan(400, `Completá nombre y código de la materia ${i + 1}.`);
    if (!entero(m.anio, 1, 20)) throw errorPlan(400, `El año de cursado de la materia ${i + 1} debe estar entre 1 y 20.`);
    if (m.cuatrimestre != null && ![1, 2].includes(m.cuatrimestre)) throw errorPlan(400, "El cuatrimestre debe ser 1, 2 o sin especificar.");
    if (m.cargaHoraria != null && !entero(m.cargaHoraria, 1, 10000)) throw errorPlan(400, "La carga horaria debe ser un entero positivo de hasta 10000 horas.");
    const codigo = m.codigo.trim().toUpperCase();
    if (codigos.has(codigo)) throw errorPlan(400, `El código ${codigo} está repetido en el formulario.`);
    codigos.add(codigo);
    return { nombre: m.nombre.trim(), codigo, anio: m.anio, cuatrimestre: m.cuatrimestre ?? null, cargaHoraria: m.cargaHoraria ?? null };
  });
  return { nombre: nombre.trim(), anio, carreraId, vigente, materias: normalizadas };
}

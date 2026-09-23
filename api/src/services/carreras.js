// Carreras: registrar y modificar (ADMIN).
// La validación vive acá, separada de la ruta, para poder probarla sin DB.

export function errorCarrera(status, message) {
  return Object.assign(new Error(message), { status });
}

const LARGO_NOMBRE = 160;
const LARGO_DESCRIPCION = 1000;
// Letras, números, guion y guion bajo. Se guarda en mayúsculas: "lsi" y "LSI" son el mismo código.
const FORMATO_CODIGO = /^[A-Z0-9][A-Z0-9_-]{0,19}$/;

// Solo estos campos se pueden cargar o cambiar desde estas historias.
// La vigencia (dar de baja / reactivar) queda para su propia historia.
const CAMPOS_EDITABLES = ["nombre", "codigo", "descripcion"];

function validarNombre(nombre) {
  if (typeof nombre !== "string" || !nombre.trim()) throw errorCarrera(400, "El nombre de la carrera es obligatorio.");
  const limpio = nombre.trim().replace(/\s+/g, " ");
  if (limpio.length > LARGO_NOMBRE) throw errorCarrera(400, `El nombre puede tener hasta ${LARGO_NOMBRE} caracteres.`);
  return limpio;
}

function validarCodigo(codigo) {
  if (typeof codigo !== "string" || !codigo.trim()) throw errorCarrera(400, "El código de la carrera es obligatorio.");
  const limpio = codigo.trim().toUpperCase();
  if (!FORMATO_CODIGO.test(limpio)) {
    throw errorCarrera(400, "El código debe tener hasta 20 caracteres: letras, números, guion o guion bajo, sin espacios.");
  }
  return limpio;
}

function validarDescripcion(descripcion) {
  if (descripcion == null) return null;
  if (typeof descripcion !== "string") throw errorCarrera(400, "La descripción debe ser texto.");
  const limpia = descripcion.trim();
  if (limpia.length > LARGO_DESCRIPCION) throw errorCarrera(400, `La descripción puede tener hasta ${LARGO_DESCRIPCION} caracteres.`);
  return limpia || null; // vacía = sin descripción
}

function rechazarCamposAjenos(body) {
  const ajenos = Object.keys(body).filter((c) => !CAMPOS_EDITABLES.includes(c));
  if (ajenos.length) throw errorCarrera(400, `No se puede cargar ni modificar: ${ajenos.join(", ")}.`);
}

function esObjeto(body) {
  return body != null && typeof body === "object" && !Array.isArray(body);
}

// Registrar: nombre y código obligatorios, descripción opcional.
export function validarCarrera(body) {
  if (!esObjeto(body)) throw errorCarrera(400, "Faltan los datos de la carrera.");
  rechazarCamposAjenos(body);
  return {
    nombre: validarNombre(body.nombre),
    codigo: validarCodigo(body.codigo),
    descripcion: validarDescripcion(body.descripcion),
  };
}

// Modificar: se valida solo lo que viene; lo que no viene queda como está.
export function validarCambiosCarrera(body) {
  if (!esObjeto(body)) throw errorCarrera(400, "Faltan los datos a modificar.");
  rechazarCamposAjenos(body);
  const cambios = {};
  if ("nombre" in body) cambios.nombre = validarNombre(body.nombre);
  if ("codigo" in body) cambios.codigo = validarCodigo(body.codigo);
  if ("descripcion" in body) cambios.descripcion = validarDescripcion(body.descripcion);
  if (!Object.keys(cambios).length) throw errorCarrera(400, "No enviaste ningún cambio.");
  return cambios;
}

export function validarIdCarrera(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw errorCarrera(400, "El identificador de la carrera no es válido.");
  return id;
}

// Busca otra carrera con el mismo código o el mismo nombre (sin distinguir mayúsculas).
// excluirId: al modificar, la propia carrera no cuenta como duplicado.
export async function buscarDuplicado(db, { nombre, codigo }, excluirId = null) {
  const condiciones = [];
  if (codigo) condiciones.push({ codigo });
  if (nombre) condiciones.push({ nombre: { equals: nombre, mode: "insensitive" } });
  if (!condiciones.length) return;
  const otra = await db.carrera.findFirst({
    where: { OR: condiciones, ...(excluirId ? { NOT: { id: excluirId } } : {}) },
    select: { nombre: true, codigo: true },
  });
  if (!otra) return;
  if (codigo && otra.codigo === codigo) throw errorCarrera(409, `Ya existe una carrera con el código ${codigo}.`);
  throw errorCarrera(409, `Ya existe una carrera llamada «${otra.nombre}».`);
}

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterAsignaciones } from "../src/routes/asignaciones.js";
import { crearRouterDocentes } from "../src/routes/docentes.js";
import { manejarErrores } from "../src/middleware/errores.js";
import { aplanarDocente, aplanarMateria, validarAsignacion } from "../src/services/asignaciones.js";

// ---------- Validación y armado (sin DB) ----------

test("validarAsignacion: acepta ids válidos y rechaza el resto", () => {
  assert.deepEqual(validarAsignacion({ materiaId: "5", docenteId: 7 }), { materiaId: 5, docenteId: 7 });
  for (const body of [null, [], {}, { materiaId: 5 }, { docenteId: 7 }, { materiaId: 0, docenteId: 7 }, { materiaId: 5, docenteId: "x" }, { materiaId: 1.5, docenteId: 7 }]) {
    assert.throws(() => validarAsignacion(body), (e) => e.status === 400, JSON.stringify(body));
  }
});

test("aplanarMateria y aplanarDocente: listas planas y ordenadas", () => {
  const materia = aplanarMateria({ id: 5, nombre: "Prog I", docentes: [
    { docente: { id: 2, nombre: "Zoe", apellido: "Pérez" } }, { docente: { id: 1, nombre: "Ana", apellido: "Álvarez" } }] });
  assert.deepEqual(materia.docentes.map((d) => d.id), [1, 2]);
  assert.equal("materiasQueDicta" in aplanarDocente({ id: 1, materiasQueDicta: [] }), false);
  const docente = aplanarDocente({ id: 1, materiasQueDicta: [{ materia: { nombre: "Redes" } }, { materia: { nombre: "Álgebra" } }] });
  assert.deepEqual(docente.materias.map((m) => m.nombre), ["Álgebra", "Redes"]);
});

// ---------- Contrato HTTP (DB en memoria) ----------

// Materias 5 y 6; docentes 7 (DOCENTE) y 8 (DOCENTE); el usuario 21 es ALUMNO. Empieza sin asignaciones.
function dbAsignaciones() {
  const asignaciones = [];
  const MATERIAS = { 5: { id: 5, nombre: "Programación I", codigo: "PROG1" }, 6: { id: 6, nombre: "Base de Datos", codigo: "BD1" } };
  const USUARIOS = {
    7: { id: 7, nombre: "Laura", apellido: "Gómez", email: "laura@ucse.edu.ar", rol: "DOCENTE" },
    8: { id: 8, nombre: "Beto", apellido: "Díaz", email: "beto@ucse.edu.ar", rol: "DOCENTE" },
    21: { id: 21, nombre: "Ana", apellido: "Pérez", email: "ana@alumnos.ucse.edu.ar", rol: "ALUMNO" },
  };
  const clave = (w) => w.materiaId_docenteId;
  const proyectar = (u, select) => Object.fromEntries(Object.keys(select).filter((k) => k in u).map((k) => [k, u[k]]));
  return {
    asignaciones,
    materia: {
      findMany: async () => Object.values(MATERIAS).map((m) => ({ ...m, anio: 1, plan: { id: 1, nombre: "Plan 2023", carrera: { nombre: "LSI", codigo: "LSI" } },
        docentes: asignaciones.filter((a) => a.materiaId === m.id).map((a) => ({ docente: proyectar(USUARIOS[a.docenteId], { id: 1, nombre: 1, apellido: 1, email: 1 }) })) })),
      findUnique: async ({ where }) => MATERIAS[where.id] ?? null,
    },
    usuario: {
      findMany: async ({ where }) => Object.values(USUARIOS).filter((u) => u.rol === where.rol).map((u) => ({ ...proyectar(u, { id: 1, nombre: 1, apellido: 1, email: 1 }),
        materiasQueDicta: asignaciones.filter((a) => a.docenteId === u.id).map((a) => ({ materia: MATERIAS[a.materiaId] })) })),
      findUnique: async ({ where, select }) => (USUARIOS[where.id] ? proyectar(USUARIOS[where.id], select) : null),
    },
    materiaDocente: {
      findUnique: async ({ where }) => asignaciones.find((a) => a.materiaId === clave(where).materiaId && a.docenteId === clave(where).docenteId) ?? null,
      create: async ({ data }) => { asignaciones.push({ ...data }); return data; },
      delete: async ({ where }) => { const i = asignaciones.findIndex((a) => a.materiaId === clave(where).materiaId && a.docenteId === clave(where).docenteId); asignaciones.splice(i, 1); return {}; },
    },
  };
}

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/asignaciones", crearRouterAsignaciones(db)); app.use("/api/docentes", crearRouterDocentes(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol, body, id = 1) => fetch(`http://127.0.0.1:${server.address().port}/api${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP: solo el ADMIN; docentes y alumnos no pueden ver ni modificar asignaciones", async () => {
  const db = dbAsignaciones();
  await conAPI(db, async (request) => {
    for (const [metodo, ruta, body] of [["GET", "/asignaciones/materias"], ["GET", "/asignaciones/docentes"], ["POST", "/asignaciones", { materiaId: 5, docenteId: 7 }], ["DELETE", "/asignaciones/materias/5/docentes/7"]]) {
      assert.equal((await request(metodo, ruta, null, body)).status, 401, `${metodo} ${ruta} sin login`);
      assert.equal((await request(metodo, ruta, "DOCENTE", body, 7)).status, 403, `${metodo} ${ruta} docente`);
      assert.equal((await request(metodo, ruta, "ALUMNO", body, 21)).status, 403, `${metodo} ${ruta} alumno`);
    }
  });
  assert.equal(db.asignaciones.length, 0, "un docente no puede asignarse a sí mismo");
});

test("HTTP: el ADMIN asigna un docente y aparece en las listas de materias y de docentes", async () => {
  const db = dbAsignaciones();
  await conAPI(db, async (request) => {
    const r = await request("POST", "/asignaciones", "ADMIN", { materiaId: 5, docenteId: 7 });
    assert.equal(r.status, 201);
    assert.deepEqual(await r.json(), {
      materia: { id: 5, nombre: "Programación I", codigo: "PROG1" },
      docente: { id: 7, nombre: "Laura", apellido: "Gómez", email: "laura@ucse.edu.ar" },
    });
    assert.deepEqual(db.asignaciones, [{ materiaId: 5, docenteId: 7 }]);

    const materias = await (await request("GET", "/asignaciones/materias", "ADMIN")).json();
    assert.deepEqual(materias.find((m) => m.id === 5).docentes.map((d) => d.id), [7]);
    assert.deepEqual(materias.find((m) => m.id === 6).docentes, []);

    const docentes = await (await request("GET", "/asignaciones/docentes", "ADMIN")).json();
    assert.deepEqual(docentes.map((d) => d.id), [7, 8], "solo usuarios con rol docente");
    assert.deepEqual(docentes.find((d) => d.id === 7).materias.map((m) => m.codigo), ["PROG1"]);
    assert.ok(!JSON.stringify(docentes).includes("rol"), "no expone datos de más");
  });
});

test("HTTP: no asigna dos veces, ni usuarios que no son docentes, ni ids que no existen", async () => {
  const db = dbAsignaciones();
  await conAPI(db, async (request) => {
    assert.equal((await request("POST", "/asignaciones", "ADMIN", { materiaId: 5, docenteId: 7 })).status, 201);
    assert.equal((await request("POST", "/asignaciones", "ADMIN", { materiaId: 5, docenteId: 7 })).status, 409, "repetida");
    assert.equal((await request("POST", "/asignaciones", "ADMIN", { materiaId: 5, docenteId: 21 })).status, 400, "un alumno no puede dictar");
    assert.equal((await request("POST", "/asignaciones", "ADMIN", { materiaId: 99, docenteId: 7 })).status, 404);
    assert.equal((await request("POST", "/asignaciones", "ADMIN", { materiaId: 5, docenteId: 99 })).status, 404);
    assert.equal((await request("POST", "/asignaciones", "ADMIN", { materiaId: "x", docenteId: 7 })).status, 400);
    assert.equal((await request("POST", "/asignaciones", "ADMIN", {})).status, 400);
  });
  assert.equal(db.asignaciones.length, 1);
});

test("HTTP: quitar la asignación; una que no existe da 404", async () => {
  const db = dbAsignaciones();
  await conAPI(db, async (request) => {
    await request("POST", "/asignaciones", "ADMIN", { materiaId: 5, docenteId: 7 });
    await request("POST", "/asignaciones", "ADMIN", { materiaId: 5, docenteId: 8 });
    assert.equal((await request("DELETE", "/asignaciones/materias/5/docentes/7", "ADMIN")).status, 200);
    assert.deepEqual(db.asignaciones, [{ materiaId: 5, docenteId: 8 }], "solo se quita esa asignación");
    assert.equal((await request("DELETE", "/asignaciones/materias/5/docentes/7", "ADMIN")).status, 404);
    assert.equal((await request("DELETE", "/asignaciones/materias/x/docentes/7", "ADMIN")).status, 400);
  });
});

test("HTTP: la asignación habilita (y quitarla deshabilita) al docente sobre la materia (Seg-05)", async () => {
  const db = dbAsignaciones();
  await conAPI(db, async (request) => {
    const aviso = { titulo: "Aviso", mensaje: "Hola" };
    const intentar = () => request("POST", "/docentes/materias/5/avisos", "DOCENTE", aviso, 7);
    db.usuario.findMany = async () => []; // sin alumnos: alcanza para distinguir 403 (sin permiso) de 409 (con permiso)

    assert.equal((await intentar()).status, 403, "sin asignación");
    await request("POST", "/asignaciones", "ADMIN", { materiaId: 5, docenteId: 7 });
    assert.equal((await intentar()).status, 409, "asignado: pasa el control de acceso");
    await request("DELETE", "/asignaciones/materias/5/docentes/7", "ADMIN");
    assert.equal((await intentar()).status, 403, "desasignado: pierde el acceso");
  });
});

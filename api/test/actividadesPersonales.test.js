import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterActividadesPersonales } from "../src/routes/actividadesPersonales.js";
import {
  validarCambioActividadPersonal,
  validarFechaAgenda,
  validarFiltroEtiqueta,
  validarNuevaActividadPersonal,
} from "../src/services/actividadesPersonales.js";
import { manejarErrores } from "../src/middleware/errores.js";

const datos = () => ({
  titulo: "Lectura",
  duracion: 45,
  categoria: "ESTUDIO",
  etiquetas: ["Estudio"],
  programacion: "PUNTUAL",
  dia: null,
  fecha: "2026-10-07",
  horaInicio: "09:00",
});

test("validación: actividad obligatoria, duración positiva y etiquetas únicas", () => {
  assert.deepEqual(validarNuevaActividadPersonal({ ...datos(), titulo: "  Lectura   diaria ", etiquetas: ["Estudio", " estudio ", "Trabajo"] }), {
    ...datos(),
    titulo: "Lectura diaria",
    etiquetas: ["Estudio", "Trabajo"],
    fecha: new Date("2026-10-07T00:00:00.000Z"),
  });
  for (const invalida of [
    null,
    { ...datos(), titulo: " " },
    { ...datos(), categoria: "Estudio independiente" },
    { ...datos(), categoria: "DEPORTE" },
    { ...datos(), duracion: 0 },
    { ...datos(), duracion: 1.5 },
    { ...datos(), etiquetas: "Trabajo" },
    { ...datos(), etiquetas: Array(11).fill("Etiqueta") },
  ]) {
    assert.throws(() => validarNuevaActividadPersonal(invalida), (error) => error.status === 400);
  }
});

test("validación: edición parcial, campos vacíos y filtros de etiqueta", () => {
  assert.deepEqual(validarCambioActividadPersonal({ etiquetas: [] }), { etiquetas: [] });
  assert.throws(() => validarCambioActividadPersonal({}), (error) => error.status === 400);
  assert.throws(() => validarCambioActividadPersonal({ duracion: -1 }), (error) => error.status === 400);
  assert.equal(validarFiltroEtiqueta(undefined), null);
  assert.equal(validarFiltroEtiqueta(" Deporte "), "Deporte");
  assert.throws(() => validarFiltroEtiqueta(" "), (error) => error.status === 400);
  assert.deepEqual(validarNuevaActividadPersonal({ ...datos(), programacion: "RECURRENTE", dia: "DOMINGO", fecha: null }).dia, "DOMINGO");
  assert.throws(() => validarNuevaActividadPersonal({ ...datos(), programacion: "RECURRENTE", dia: "NINGUNO", fecha: null }), (error) => error.status === 400);
  assert.throws(() => validarNuevaActividadPersonal({ ...datos(), fecha: "2026-02-30" }), (error) => error.status === 400);
  assert.throws(() => validarNuevaActividadPersonal({ ...datos(), horaInicio: "23:30", duracion: 60 }), (error) => error.status === 400);
  assert.equal(validarFechaAgenda("2026-10-07").toISOString(), "2026-10-07T00:00:00.000Z");
  assert.throws(() => validarFechaAgenda("2026-02-30"), (error) => error.status === 400);
});

function crearDB(filas = [], inscripciones = []) {
  let siguienteId = Math.max(0, ...filas.map((fila) => fila.id)) + 1;
  const cumple = (fila, where) => fila.id === where.id && fila.usuarioId === where.usuarioId;
  const seleccionar = (fila, select) => Object.fromEntries(Object.keys(select).map((campo) => [campo, fila[campo]]));
  return {
    filas,
    actividadPersonal: {
      findMany: async ({ where, select }) => filas
        .filter((fila) => fila.usuarioId === where.usuarioId &&
          (!where.id?.not || fila.id !== where.id.not) &&
          (!where.etiquetas || fila.etiquetas.includes(where.etiquetas.has)))
        .sort((a, b) => b.creadoEn - a.creadoEn || b.id - a.id)
        .map((fila) => seleccionar(fila, select)),
      create: async ({ data, select }) => {
        const fila = { id: siguienteId++, creadoEn: new Date(), ...data };
        filas.push(fila);
        return seleccionar(fila, select);
      },
      updateMany: async ({ where, data }) => {
        const fila = filas.find((actual) => cumple(actual, where));
        if (!fila) return { count: 0 };
        Object.assign(fila, data);
        return { count: 1 };
      },
      findFirst: async ({ where, select }) => {
        const fila = filas.find((actual) => cumple(actual, where));
        return fila ? seleccionar(fila, select) : null;
      },
      deleteMany: async ({ where }) => {
        const indice = filas.findIndex((fila) => cumple(fila, where));
        if (indice === -1) return { count: 0 };
        filas.splice(indice, 1);
        return { count: 1 };
      },
    },
    inscripcionComision: { findMany: async () => inscripciones },
  };
}

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express();
  app.use(express.json());
  app.use("/api/actividades-personales", crearRouterActividadesPersonales(db));
  app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, { token = true, rol = "ALUMNO", id = 7, body } = {}) => fetch(
    `http://127.0.0.1:${server.address().port}/api/actividades-personales${ruta}`,
    {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${jwt.sign({ id, rol }, process.env.JWT_SECRET)}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  try {
    await fn(request);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const fila = (id, usuarioId, extra = {}) => ({
  id,
  usuarioId,
  titulo: `Actividad ${id}`,
  duracion: 30,
  categoria: "OTRA",
  etiquetas: ["Trabajo"],
  creadoEn: new Date(id * 1000),
  ...extra,
});

test("HTTP: requiere sesión de alumno y lista solamente sus actividades con filtro por etiqueta", async () => {
  const db = crearDB([fila(1, 7), fila(2, 8), fila(3, 7, { etiquetas: ["Deporte"] })]);
  await conAPI(db, async (request) => {
    assert.equal((await request("GET", "/", { token: false })).status, 401);
    assert.equal((await request("GET", "/", { rol: "DOCENTE" })).status, 403);
    const todas = await request("GET", "/");
    assert.deepEqual((await todas.json()).actividades.map((actividad) => actividad.id), [3, 1]);
    const filtradas = await request("GET", "/?etiqueta=Trabajo");
    assert.deepEqual((await filtradas.json()).actividades.map((actividad) => actividad.id), [1]);
  });
});

test("HTTP: crea, edita y borra actividades solo de su propietario", async () => {
  const db = crearDB([fila(1, 99)]);
  await conAPI(db, async (request) => {
    const creada = await request("POST", "/", { body: datos() });
    assert.equal(creada.status, 201);
    const actividad = await creada.json();
    assert.equal(actividad.titulo, "Lectura");
    const { conflictos: _conflictos, ...datosGuardados } = actividad;
    assert.deepEqual(db.filas[1], {
      ...datosGuardados,
      fecha: new Date(datosGuardados.fecha),
      creadoEn: new Date(actividad.creadoEn),
      usuarioId: 7,
    });

    const editada = await request("PATCH", `/${actividad.id}`, { body: { titulo: "Lectura nocturna", etiquetas: ["Descanso"] } });
    assert.equal(editada.status, 200);
    assert.equal((await editada.json()).titulo, "Lectura nocturna");
    assert.deepEqual(db.filas[1].etiquetas, ["Descanso"]);

    assert.equal((await request("PATCH", "/1", { body: { titulo: "No es mío" } })).status, 404);
    assert.equal((await request("DELETE", "/1")).status, 404);
    assert.equal((await request("DELETE", `/${actividad.id}`)).status, 200);
    assert.equal((await request("DELETE", `/${actividad.id}`)).status, 404);
    assert.deepEqual(db.filas.map((filaActual) => filaActual.id), [1]);
  });
});

test("HTTP: detecta superposiciones con clases y actividades pero conserva el alta", async () => {
  const clases = [{
    comision: {
      nombre: "Comisión A",
      materia: { nombre: "Programación" },
      bloques: [{ dia: "MIERCOLES", horaInicio: "18:00", horaFin: "20:00" }],
    },
  }];
  const db = crearDB([{
    ...fila(1, 7, { titulo: "Gimnasio", duracion: 30, programacion: "RECURRENTE", dia: "MIERCOLES", fecha: null, horaInicio: "19:15" }),
  }], clases);
  await conAPI(db, async (request) => {
    const respuesta = await request("POST", "/", { body: { ...datos(), horaInicio: "19:30", duracion: 60 } });
    assert.equal(respuesta.status, 201);
    const actividad = await respuesta.json();
    assert.equal(actividad.conflictos.length, 2);
    assert.deepEqual(actividad.conflictos.map((conflicto) => conflicto.tipo).sort(), ["ACTIVIDAD", "CLASE"]);
    assert.equal(db.filas.length, 2, "el aviso de superposición no impide guardar");
  });
});

test("HTTP: agenda semanal ordena clases y actividades puntuales y recurrentes", async () => {
  const db = crearDB([
    fila(1, 7, { titulo: "Lectura", programacion: "RECURRENTE", dia: "MIERCOLES", fecha: null, horaInicio: "09:00" }),
    fila(2, 7, { titulo: "Dentista", programacion: "PUNTUAL", dia: null, fecha: new Date("2026-10-07T00:00:00.000Z"), horaInicio: "13:00" }),
    fila(3, 7, { titulo: "Otra semana", programacion: "PUNTUAL", dia: null, fecha: new Date("2026-10-15T00:00:00.000Z"), horaInicio: "12:00" }),
  ], [{
    comision: {
      nombre: "Comisión A",
      materia: { nombre: "Programación" },
      bloques: [{ dia: "MIERCOLES", horaInicio: "18:00", horaFin: "20:00" }],
    },
  }]);
  await conAPI(db, async (request) => {
    const respuesta = await request("GET", "/agenda?fecha=2026-10-07");
    assert.equal(respuesta.status, 200);
    const agenda = await respuesta.json();
    const miercoles = agenda.dias.find((dia) => dia.dia === "MIERCOLES");
    assert.deepEqual(miercoles.eventos.map((evento) => evento.titulo), ["Lectura", "Dentista", "Programación (Comisión A)"]);
    assert.ok(agenda.eventos.every((evento) => evento.titulo !== "Otra semana"));
    assert.equal(agenda.dias.length, 7);
  });
});

test("HTTP: informa entradas inválidas sin guardar", async () => {
  const db = crearDB();
  await conAPI(db, async (request) => {
    assert.equal((await request("POST", "/", { body: { ...datos(), duracion: 0 } })).status, 400);
    assert.equal((await request("PATCH", "/1", { body: {} })).status, 404);
    assert.equal((await request("GET", "/?etiqueta=%20")).status, 400);
    assert.deepEqual(db.filas, []);
  });
});

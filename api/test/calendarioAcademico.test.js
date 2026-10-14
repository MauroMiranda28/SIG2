import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterCalendarioAcademico } from "../src/routes/calendarioAcademico.js";
import { manejarErrores } from "../src/middleware/errores.js";
import {
  claseOcurreEnFecha,
  marcasCalendarioParaFecha,
  validarFechaEnPeriodoFinal,
  validarPeriodoAcademico,
} from "../src/services/calendarioAcademico.js";

const periodo = (tipo, desde, hasta, extras = {}) => ({
  anio: Number(desde.slice(0, 4)),
  tipo,
  nombre: tipo,
  fechaInicio: new Date(`${desde}T00:00:00.000Z`),
  fechaFin: new Date(`${hasta}T00:00:00.000Z`),
  ...extras,
});

test("valida rangos de períodos y feriados de un día", () => {
  assert.equal(validarPeriodoAcademico({
    tipo: "CLASES_ANUALES", nombre: "Ciclo lectivo", fechaInicio: "2026-03-01", fechaFin: "2026-12-20",
  }).anio, 2026);
  for (const body of [
    { tipo: "DESCONOCIDO", nombre: "X", fechaInicio: "2026-01-01", fechaFin: "2026-01-02" },
    { tipo: "FERIADO", nombre: "Feriado", fechaInicio: "2026-05-01", fechaFin: "2026-05-02" },
    { tipo: "VACACIONES", nombre: "Receso", fechaInicio: "2026-08-01", fechaFin: "2026-07-01" },
    { tipo: "EXAMENES_FINALES", nombre: "Finales", fechaInicio: "2026-12-20", fechaFin: "2027-02-01" },
    { tipo: "CLASES_ANUALES", nombre: "Ciclo", fechaInicio: "2026-12-20", fechaFin: "2027-02-01" },
    { tipo: "VACACIONES", nombre: " ", fechaInicio: "2026-01-01", fechaFin: "2026-01-02" },
  ]) assert.throws(() => validarPeriodoAcademico(body), (error) => error.status === 400);
});

test("la agenda lectiva respeta duración, feriados y vacaciones; finales respetan períodos inclusivos", async () => {
  const periodos = [
    periodo("CLASES_CUATRIMESTRE_1", "2026-03-01", "2026-07-10"),
    periodo("FERIADO", "2026-05-01", "2026-05-01"),
    periodo("VACACIONES", "2026-07-01", "2026-07-10"),
    periodo("EXAMENES_FINALES", "2026-07-11", "2026-07-31"),
  ];
  const materia = { cuatrimestre: 1 };
  assert.equal(claseOcurreEnFecha(materia, "2026-04-30", periodos), true);
  assert.equal(claseOcurreEnFecha(materia, "2026-05-03", [periodo("CLASES_CUATRIMESTRE_1", "2026-05-01", "2026-05-10")]), false,
    "no hay clases los domingos aunque estén dentro del período lectivo");
  assert.equal(claseOcurreEnFecha(materia, "2026-05-01", periodos), false);
  assert.equal(claseOcurreEnFecha(materia, "2026-07-05", periodos), false);
  assert.equal(claseOcurreEnFecha(materia, "2026-08-01", periodos), false);
  const periodosAnuales = [
    periodo("CLASES_CUATRIMESTRE_1", "2026-03-01", "2026-06-30"),
    periodo("CLASES_CUATRIMESTRE_2", "2026-08-01", "2026-11-30"),
  ];
  assert.equal(claseOcurreEnFecha({ cuatrimestre: null }, "2026-05-15", periodosAnuales), true);
  assert.equal(claseOcurreEnFecha({ cuatrimestre: null }, "2026-07-15", periodosAnuales), false);
  assert.equal(claseOcurreEnFecha({ cuatrimestre: null }, "2026-09-15", periodosAnuales), true);
  assert.equal(claseOcurreEnFecha(
    materia,
    "2027-01-05",
    [periodo("CLASES_CUATRIMESTRE_1", "2027-01-01", "2027-02-01"), periodo("VACACIONES", "2026-12-20", "2027-01-10")],
  ), false);
  const db = { periodoAcademico: { findFirst: async ({ where }) => where.tipo === "EXAMENES_FINALES" ? periodos[3] : null } };
  assert.equal(await validarFechaEnPeriodoFinal(db, new Date("2026-07-11T00:00:00Z")), periodos[3]);
  await assert.rejects(validarFechaEnPeriodoFinal({ periodoAcademico: { findFirst: async () => null } }, new Date("2026-08-01T00:00:00Z")),
    (error) => error.status === 400);
  await assert.rejects(validarFechaEnPeriodoFinal({
    periodoAcademico: { findFirst: async ({ where }) => where.tipo === "FERIADO" ? { nombre: "Feriado" } : periodos[3] },
  }, new Date("2026-07-11T00:00:00Z")), (error) => error.status === 400 && /feriado/i.test(error.message));
});

test("las marcas del calendario distinguen feriados, vacaciones, finales e inicio y fin de cuatrimestre", () => {
  const periodos = [
    periodo("CLASES_CUATRIMESTRE_1", "2026-03-02", "2026-07-10", { nombre: "Cursada primer cuatrimestre" }),
    periodo("EXAMENES_FINALES", "2026-07-10", "2026-07-20", { nombre: "Llamado de julio" }),
    periodo("FERIADO", "2026-03-02", "2026-03-02", { nombre: "Feriado" }),
    periodo("FERIADO", "2026-07-10", "2026-07-10", { nombre: "Feriado en mesas" }),
    periodo("VACACIONES", "2026-07-01", "2026-07-09", { nombre: "Vacaciones de invierno" }),
  ];
  const inicio = marcasCalendarioParaFecha("2026-03-02", periodos);
  assert.deepEqual(inicio.marcas.map(({ tipo }) => tipo), ["FERIADO", "INICIO_CUATRIMESTRE"]);
  assert.equal(inicio.esHabil, false);
  const fin = marcasCalendarioParaFecha("2026-07-10", periodos);
  assert.deepEqual(fin.marcas.map(({ tipo }) => tipo), ["FERIADO", "FIN_CUATRIMESTRE"]);
  assert.equal(fin.esHabil, false);
  const vacaciones = marcasCalendarioParaFecha("2026-07-06", periodos);
  assert.ok(vacaciones.marcas.some(({ tipo }) => tipo === "VACACIONES"));
  assert.equal(vacaciones.esHabil, false);
  const domingoEnPeriodos = marcasCalendarioParaFecha("2026-07-12", [
    periodo("EXAMENES_FINALES", "2026-07-10", "2026-07-20", { nombre: "Mesas de julio" }),
    periodo("VACACIONES", "2026-07-11", "2026-07-15", { nombre: "Receso de invierno" }),
  ]);
  assert.deepEqual(domingoEnPeriodos.marcas, []);
});

function dbCalendario() {
  const periodos = [];
  const finales = [];
  const publicaciones = [];
  let siguienteId = 1;
  const db = {
    periodos,
    finales,
    publicaciones,
    publicacionCalendario: {
      findMany: async ({ where }) => publicaciones.filter((p) =>
        where.anio.in.includes(p.anio) && (!where.publicado || p.publicado === where.publicado)),
      findUnique: async ({ where }) => publicaciones.find((p) => p.anio === where.anio) ?? null,
      upsert: async ({ where, create, update }) => {
        const existente = publicaciones.find((p) => p.anio === where.anio);
        if (existente) Object.assign(existente, update);
        else publicaciones.push({ ...create, actualizadoEn: new Date() });
        return existente ?? publicaciones.at(-1);
      },
      updateMany: async ({ where, data }) => {
        const filas = publicaciones.filter((p) =>
          (!where.anio || (where.anio.in ?? [where.anio]).includes(p.anio)) &&
          (!where.publicado || p.publicado === where.publicado));
        filas.forEach((p) => Object.assign(p, data));
        return { count: filas.length };
      },
    },
    periodoAcademico: {
      findMany: async ({ where }) => periodos.filter((p) =>
        (!where.anio || p.anio === where.anio) &&
        (!where.tipo || p.tipo === where.tipo) &&
        (!where.id?.not || p.id !== where.id.not) &&
        (!where.fechaInicio?.lte || p.fechaInicio <= where.fechaInicio.lte) &&
        (!where.fechaFin?.gte || p.fechaFin >= where.fechaFin.gte) &&
        (!where.OR || p.anio === where.OR[0].anio ||
          p.tipo === "VACACIONES" && p.fechaInicio <= where.OR[1].fechaInicio.lte && p.fechaFin >= where.OR[1].fechaFin.gte))
        .sort((a, b) => a.fechaInicio - b.fechaInicio),
      findUnique: async ({ where }) => periodos.find((p) => p.id === where.id) ?? null,
      create: async ({ data }) => { const creado = { id: siguienteId++, ...data }; periodos.push(creado); return creado; },
      update: async ({ where, data }) => {
        const actual = periodos.find((p) => p.id === where.id);
        Object.assign(actual, data);
        return actual;
      },
      delete: async ({ where }) => {
        const indice = periodos.findIndex((p) => p.id === where.id);
        periodos.splice(indice, 1);
        return {};
      },
    },
    fechaExamen: {
      findMany: async ({ where }) => finales.filter((e) =>
        e.tipo === where.tipo && (!where.fecha || e.fecha >= where.fecha.gte && e.fecha <= where.fecha.lte)),
    },
  };
  return db;
}

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express();
  app.use(express.json());
  app.use("/api/calendario-academico", crearRouterCalendarioAcademico(db));
  app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = (metodo, ruta, rol = "ADMIN", body) => fetch(
    `http://127.0.0.1:${server.address().port}/api/calendario-academico${ruta}`,
    {
      method: metodo,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({ id: 1, rol }, process.env.JWT_SECRET)}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  try { await fn(request); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP: ADMIN gestiona períodos, permite múltiples llamados y rechaza solapamientos", async () => {
  const db = dbCalendario();
  await conAPI(db, async (request) => {
    const lectura = await request("GET", "/?anio=2026", "ALUMNO");
    assert.equal(lectura.status, 200);
    assert.equal((await request("POST", "/", "ALUMNO", {
      tipo: "CLASES_ANUALES", nombre: "Ciclo", fechaInicio: "2026-03-01", fechaFin: "2026-12-01",
    })).status, 403);

    const crear = async (tipo, nombre, fechaInicio, fechaFin) => request("POST", "/", "ADMIN", { tipo, nombre, fechaInicio, fechaFin });
    assert.equal((await crear("CLASES_ANUALES", "Ciclo", "2026-03-01", "2026-12-01")).status, 201);
    assert.equal((await crear("CLASES_ANUALES", "Otro ciclo", "2026-01-01", "2026-12-31")).status, 409);
    assert.equal((await crear("EXAMENES_FINALES", "Llamado julio", "2026-07-01", "2026-07-10")).status, 201);
    assert.equal((await crear("EXAMENES_FINALES", "Segundo llamado", "2026-07-11", "2026-07-20")).status, 201);
    assert.equal((await crear("EXAMENES_FINALES", "Solapado", "2026-07-10", "2026-07-21")).status, 409);

    const lista = await (await request("GET", "/?anio=2026", "ADMIN")).json();
    assert.equal(lista.length, 3);
    assert.equal((await request("PUT", `/${lista[1].id}`, "ADMIN", {
      tipo: "EXAMENES_FINALES", nombre: "Llamado movido", fechaInicio: "2026-07-05", fechaFin: "2026-07-15",
    })).status, 409);
  });
});

test("HTTP: el calendario queda en borrador hasta que ADMIN lo confirma y los cambios retiran la publicación", async () => {
  const db = dbCalendario();
  await conAPI(db, async (request) => {
    const crear = async (tipo, nombre, desde, hasta) => request("POST", "/", "ADMIN", {
      tipo, nombre, fechaInicio: desde, fechaFin: hasta,
    });
    await crear("CLASES_CUATRIMESTRE_1", "Primer cuatrimestre", "2026-03-01", "2026-06-30");
    await crear("FERIADO", "Feriado", "2026-05-01", "2026-05-01");

    assert.deepEqual(await (await request("GET", "/?anio=2026", "ALUMNO")).json(), []);
    assert.equal((await request("PUT", "/publicacion/2026", "ADMIN", { publicado: true })).status, 400,
      "la confirmación exige ambos períodos cuatrimestrales");
    await crear("CLASES_CUATRIMESTRE_2", "Segundo cuatrimestre", "2026-08-01", "2026-11-30");
    assert.equal((await request("PUT", "/publicacion/2026", "DOCENTE", { publicado: true })).status, 403);
    assert.equal((await request("PUT", "/publicacion/2026", "ADMIN", { publicado: true })).status, 200);
    assert.equal((await (await request("GET", "/estado?anio=2026", "ALUMNO")).json()).publicado, true);
    assert.equal((await (await request("GET", "/?anio=2026", "ALUMNO")).json()).length, 3);

    await crear("FERIADO", "Otro feriado", "2026-05-25", "2026-05-25");
    assert.equal((await (await request("GET", "/estado?anio=2026", "ADMIN")).json()).publicado, false);
    assert.deepEqual(await (await request("GET", "/?anio=2026", "ALUMNO")).json(), []);
  });
});

test("HTTP: no permite eliminar un período de finales que contiene una mesa ya programada", async () => {
  const db = dbCalendario();
  const creado = await (async () => {
    let id;
    await conAPI(db, async (request) => {
      const respuesta = await request("POST", "/", "ADMIN", {
        tipo: "EXAMENES_FINALES", nombre: "Llamado", fechaInicio: "2026-12-01", fechaFin: "2026-12-20",
      });
      id = (await respuesta.json()).id;
    });
    return id;
  })();
  db.finales.push({ tipo: "FINAL", fecha: new Date("2026-12-10T00:00:00Z") });
  await conAPI(db, async (request) => {
    assert.equal((await request("PUT", `/${creado}`, "ADMIN", {
      tipo: "EXAMENES_FINALES", nombre: "Llamado movido", fechaInicio: "2026-12-21", fechaFin: "2026-12-30",
    })).status, 409);
    assert.equal((await request("DELETE", `/${creado}`)).status, 409);
  });
});

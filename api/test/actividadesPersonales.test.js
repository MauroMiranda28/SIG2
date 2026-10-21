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
  actividadOcurreEnFecha,
} from "../src/services/actividadesPersonales.js";
import { manejarErrores } from "../src/middleware/errores.js";

const datos = () => ({
  titulo: "Lectura",
  notas: null,
  estado: "PENDIENTE",
  duracion: 45,
  categoria: "ESTUDIO",
  etiquetas: ["Estudio"],
  programacion: "PUNTUAL",
  frecuencia: "SEMANA",
  intervalo: 1,
  dia: null,
  fecha: "2026-10-07",
  repetirHasta: null,
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
  assert.deepEqual(validarCambioActividadPersonal({ estado: "EN_CURSO", notas: " Repasar unidad 2 " }), {
    estado: "EN_CURSO",
    notas: "Repasar unidad 2",
  });
  assert.throws(() => validarCambioActividadPersonal({}), (error) => error.status === 400);
  assert.throws(() => validarCambioActividadPersonal({ duracion: -1 }), (error) => error.status === 400);
  assert.throws(() => validarCambioActividadPersonal({ estado: "INICIADA" }), (error) => error.status === 400);
  assert.throws(() => validarNuevaActividadPersonal({ ...datos(), notas: "x".repeat(2001) }), (error) => error.status === 400);
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

test("recurrencia: respeta frecuencia, intervalo y fecha final inclusiva", () => {
  const actividad = {
    programacion: "RECURRENTE",
    frecuencia: "SEMANA",
    intervalo: 2,
    dia: "MIERCOLES",
    fecha: new Date("2026-10-07T00:00:00.000Z"),
    repetirHasta: new Date("2026-11-04T00:00:00.000Z"),
  };
  assert.equal(actividadOcurreEnFecha(actividad, new Date("2026-10-07T00:00:00.000Z")), true);
  assert.equal(actividadOcurreEnFecha(actividad, new Date("2026-10-14T00:00:00.000Z")), false);
  assert.equal(actividadOcurreEnFecha(actividad, new Date("2026-10-21T00:00:00.000Z")), true);
  assert.equal(actividadOcurreEnFecha(actividad, new Date("2026-11-04T00:00:00.000Z")), true);
  assert.equal(actividadOcurreEnFecha(actividad, new Date("2026-11-11T00:00:00.000Z")), false);
  assert.equal(actividadOcurreEnFecha({
    ...actividad,
    frecuencia: "DIA",
    intervalo: 3,
    repetirHasta: null,
  }, new Date("2026-10-10T00:00:00.000Z")), true);
  assert.equal(actividadOcurreEnFecha({
    ...actividad,
    frecuencia: "MES",
    intervalo: 2,
    repetirHasta: null,
  }, new Date("2026-12-07T00:00:00.000Z")), true);
  assert.equal(actividadOcurreEnFecha({
    ...actividad,
    frecuencia: "MES",
    intervalo: 2,
    repetirHasta: null,
  }, new Date("2027-01-07T00:00:00.000Z")), false);
  assert.throws(() => validarNuevaActividadPersonal({
    ...datos(),
    programacion: "RECURRENTE",
    fecha: "2026-10-07",
    frecuencia: "MES",
    intervalo: 0,
  }), (error) => error.status === 400);
  assert.throws(() => validarNuevaActividadPersonal({
    ...datos(),
    programacion: "RECURRENTE",
    fecha: "2026-10-07",
    repetirHasta: "2026-10-06",
  }), (error) => error.status === 400);
});

function crearDB(filas = [], inscripciones = [], cursadas = [], examenes = [], materiasDocente = [], periodos = [{
  anio: 2026, tipo: "CLASES_ANUALES", nombre: "Ciclo lectivo", fechaInicio: new Date("2026-01-01T00:00:00Z"), fechaFin: new Date("2026-12-31T00:00:00Z"),
}], aniosPublicados = [2026]) {
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
    cursada: { findMany: async () => cursadas },
    fechaExamen: {
      findMany: async ({ where }) => examenes.filter((examen) =>
        where.materiaId.in.includes(examen.materiaId) &&
        examen.fecha >= where.fecha.gte &&
        examen.fecha < where.fecha.lt),
    },
    materia: {
      findMany: async ({ where }) => materiasDocente
        .filter((materia) => materia.docenteId === where.docentes.some.docenteId),
    },
    publicacionCalendario: {
      findMany: async ({ where }) => (where.anio.in ?? [])
        .filter((anio) => aniosPublicados.includes(anio))
        .map((anio) => ({ anio })),
    },
    periodoAcademico: {
      findMany: async ({ where }) => periodos.filter((periodo) =>
        (!where.anio?.in || where.anio.in.includes(periodo.anio)) &&
        periodo.fechaInicio <= where.fechaInicio.lte && periodo.fechaFin >= where.fechaFin.gte),
    },
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
  notas: null,
  estado: "PENDIENTE",
  programacion: "PUNTUAL",
  frecuencia: "SEMANA",
  intervalo: 1,
  dia: null,
  fecha: null,
  repetirHasta: null,
  ...extra,
});

test("HTTP: requiere sesión de alumno y lista solamente sus actividades con filtro por etiqueta", async () => {
  const db = crearDB([fila(1, 7), fila(2, 8), fila(3, 7, { etiquetas: ["Deporte"] })]);
  await conAPI(db, async (request) => {
    assert.equal((await request("GET", "/", { token: false })).status, 401);
    assert.equal((await request("GET", "/", { rol: "ADMIN" })).status, 403);
    const todas = await request("GET", "/");
    assert.deepEqual((await todas.json()).actividades.map((actividad) => actividad.id), [3, 1]);
    const filtradas = await request("GET", "/?etiqueta=Trabajo");
    assert.deepEqual((await filtradas.json()).actividades.map((actividad) => actividad.id), [1]);
  });
});

test("HTTP: crea, edita y borra actividades solo de su propietario", async () => {
  const db = crearDB([fila(1, 99)]);
  await conAPI(db, async (request) => {
    const creada = await request("POST", "/", { body: { ...datos(), notas: "Objetivo: repasar la unidad." } });
    assert.equal(creada.status, 201);
    const actividad = await creada.json();
    assert.equal(actividad.titulo, "Lectura");
    assert.equal(actividad.notas, "Objetivo: repasar la unidad.");
    assert.equal(actividad.estado, "PENDIENTE");
    const { conflictos: _conflictos, ...datosGuardados } = actividad;
    assert.deepEqual(db.filas[1], {
      ...datosGuardados,
      fecha: new Date(datosGuardados.fecha),
      creadoEn: new Date(actividad.creadoEn),
      usuarioId: 7,
    });

    const editada = await request("PATCH", `/${actividad.id}`, {
      body: { titulo: "Lectura nocturna", etiquetas: ["Descanso"], notas: "Repasar apuntes", estado: "EN_CURSO" },
    });
    assert.equal(editada.status, 200);
    const actividadEditada = await editada.json();
    assert.equal(actividadEditada.titulo, "Lectura nocturna");
    assert.equal(actividadEditada.notas, "Repasar apuntes");
    assert.equal(actividadEditada.estado, "EN_CURSO");
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
      bloques: [{
        dia: "MIERCOLES",
        horaInicio: "18:00",
        horaFin: "20:00",
        aula: { nombre: "Aula 1" },
      }],
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
      bloques: [{
        dia: "MIERCOLES",
        horaInicio: "18:00",
        horaFin: "20:00",
        aula: { nombre: "Aula 1" },
      }],
    },
  }], [{
    materiaId: 1,
  }], [{
    id: 4,
    materiaId: 1,
    tipo: "PARCIAL",
    fecha: new Date("2026-10-07T00:00:00.000Z"),
    hora: "16:00",
    materia: { nombre: "Programación" },
    aula: { nombre: "Aula 2" },
  }]);
  await conAPI(db, async (request) => {
    const respuesta = await request("GET", "/agenda?fecha=2026-10-07");
    assert.equal(respuesta.status, 200);
    const agenda = await respuesta.json();
    const miercoles = agenda.dias.find((dia) => dia.dia === "MIERCOLES");
    assert.deepEqual(miercoles.eventos.map((evento) => evento.titulo), [
      "Lectura",
      "Dentista",
      "Programación",
      "Programación",
    ]);
    assert.equal(miercoles.eventos[2].tipoEvento, "EXAMEN");
    assert.equal(miercoles.eventos[2].tipoExamen, "PARCIAL");
    assert.equal(miercoles.eventos[2].aula, "Aula 2");
    assert.equal(miercoles.eventos[3].comision, "Comisión A");
    assert.equal(miercoles.eventos[3].aula, "Aula 1");
    assert.ok(agenda.eventos.every((evento) => evento.titulo !== "Otra semana"));
    assert.equal(agenda.dias.length, 7);
  });
});

test("HTTP: la agenda expande intervalos semanales y respeta la fecha final", async () => {
  const db = crearDB([fila(1, 7, {
    titulo: "Planificar unidad",
    programacion: "RECURRENTE",
    frecuencia: "SEMANA",
    intervalo: 2,
    dia: "MIERCOLES",
    fecha: new Date("2026-10-07T00:00:00.000Z"),
    repetirHasta: new Date("2026-11-04T00:00:00.000Z"),
    horaInicio: "09:00",
  })]);
  await conAPI(db, async (request) => {
    for (const [fecha, esperada] of [
      ["2026-10-21", true],
      ["2026-10-28", false],
      ["2026-11-04", true],
      ["2026-11-11", false],
    ]) {
      const respuesta = await request("GET", `/agenda?fecha=${fecha}`);
      const agenda = await respuesta.json();
      assert.equal(
        agenda.eventos.some((evento) => evento.tipoEvento === "ACTIVIDAD" && evento.id === 1),
        esperada,
        `ocurrencia de ${fecha}`,
      );
    }
  });
});

test("HTTP: limita clases al cuatrimestre configurado y omite feriados y vacaciones", async () => {
  const periodos = [
    { anio: 2026, tipo: "CLASES_CUATRIMESTRE_1", nombre: "Cursada", fechaInicio: new Date("2026-10-07T00:00:00Z"), fechaFin: new Date("2026-10-09T00:00:00Z") },
    { anio: 2026, tipo: "FERIADO", nombre: "Feriado", fechaInicio: new Date("2026-10-07T00:00:00Z"), fechaFin: new Date("2026-10-07T00:00:00Z") },
    { anio: 2026, tipo: "VACACIONES", nombre: "Receso", fechaInicio: new Date("2026-10-09T00:00:00Z"), fechaFin: new Date("2026-10-09T00:00:00Z") },
  ];
  const db = crearDB([], [{
    comision: {
      nombre: "Comisión A",
      materia: { nombre: "Programación", cuatrimestre: 1, cursadas: [] },
      bloques: ["MIERCOLES", "JUEVES", "VIERNES"].map((dia) => ({
        dia, horaInicio: "18:00", horaFin: "20:00", aula: null,
      })),
    },
  }], [], [], [], periodos);
  await conAPI(db, async (request) => {
    const respuesta = await request("GET", "/agenda?fecha=2026-10-07");
    const agenda = await respuesta.json();
    assert.deepEqual(agenda.eventos.filter((evento) => evento.tipoEvento === "CLASE").map((evento) => evento.dia), ["JUEVES"]);
    assert.equal(agenda.dias.find((dia) => dia.dia === "MIERCOLES").calendario.esHabil, false);
    assert.ok(agenda.dias.find((dia) => dia.dia === "MIERCOLES").calendario.marcas.some((marca) => marca.tipo === "FERIADO" && marca.nombre === "Feriado"));
    assert.equal(agenda.dias.find((dia) => dia.dia === "JUEVES").calendario.esHabil, true);
    assert.ok(agenda.dias.find((dia) => dia.dia === "VIERNES").calendario.marcas.some((marca) => marca.tipo === "VACACIONES" && marca.nombre === "Receso"));
  });
});

test("HTTP: la agenda no expone clases ni marcas del calendario mientras el año no esté publicado", async () => {
  const db = crearDB([], [{
    comision: {
      nombre: "Comisión A",
      materia: { nombre: "Programación", cuatrimestre: 1, cursadas: [] },
      bloques: [{ dia: "MIERCOLES", horaInicio: "18:00", horaFin: "20:00", aula: null }],
    },
  }], [], [], [], [{
    anio: 2026,
    tipo: "CLASES_CUATRIMESTRE_1",
    nombre: "Cursada",
    fechaInicio: new Date("2026-10-07T00:00:00Z"),
    fechaFin: new Date("2026-10-09T00:00:00Z"),
  }], []);
  await conAPI(db, async (request) => {
    const respuesta = await request("GET", "/agenda?fecha=2026-10-07");
    const agenda = await respuesta.json();
    assert.equal(agenda.eventos.some((evento) => evento.tipoEvento === "CLASE"), false);
    assert.deepEqual(agenda.dias.find((dia) => dia.dia === "MIERCOLES").calendario.marcas, []);
  });
});

test("HTTP: docente registra bloques propios de gestión y planificación en su agenda", async () => {
  const db = crearDB([
    fila(1, 42, {
      titulo: "Preparar clase",
      categoria: "ESTUDIO",
      etiquetas: ["Unidad 2"],
      programacion: "RECURRENTE",
      dia: "MARTES",
      fecha: null,
      horaInicio: "10:00",
    }),
    fila(2, 7, {
      titulo: "Bloque de otro usuario",
      programacion: "RECURRENTE",
      dia: "MARTES",
      fecha: null,
      horaInicio: "11:00",
    }),
  ], [], [], [], [{
    docenteId: 42,
    nombre: "Programación",
    comisiones: [{
      nombre: "Comisión B",
      bloques: [{
        dia: "MARTES",
        horaInicio: "18:00",
        horaFin: "20:00",
        aula: { nombre: "Aula 3" },
      }],
    }],
  }]);
  await conAPI(db, async (request) => {
    assert.equal((await request("GET", "/", { rol: "DOCENTE", id: 42 })).status, 200);
    const creada = await request("POST", "/", {
      rol: "DOCENTE",
      id: 42,
      body: {
        ...datos(),
        titulo: "Gestión de correos",
        categoria: "TRABAJO",
        programacion: "RECURRENTE",
        dia: "MARTES",
        fecha: null,
      },
    });
    assert.equal(creada.status, 201);
    assert.equal((await creada.json()).conflictos.length, 0);
    for (const [categoria, titulo] of [
      ["PREPARACION_CLASE", "Preparar clase"],
      ["PREPARACION_EXAMEN", "Preparar parcial"],
      ["CORRECCION_EXAMENES", "Corregir parciales"],
    ]) {
      const actividad = await request("POST", "/", {
        rol: "DOCENTE",
        id: 42,
        body: { ...datos(), titulo, categoria },
      });
      assert.equal(actividad.status, 201);
    }
    assert.equal((await request("POST", "/", {
      rol: "DOCENTE",
      id: 42,
      body: { ...datos(), categoria: "SALUD" },
    })).status, 400);

    const agendaRespuesta = await request("GET", "/agenda?fecha=2026-10-07", { rol: "DOCENTE", id: 42 });
    assert.equal(agendaRespuesta.status, 200);
    const agenda = await agendaRespuesta.json();
    const martes = agenda.dias.find((dia) => dia.dia === "MARTES");
    assert.deepEqual(martes.eventos.map((evento) => evento.titulo), [
      "Gestión de correos",
      "Preparar clase",
      "Programación",
    ]);
    assert.equal(martes.eventos[2].tipoEvento, "CLASE");
    assert.equal(martes.eventos[2].comision, "Comisión B");
    assert.equal(martes.eventos[2].aula, "Aula 3");
    assert.deepEqual(
      agenda.eventos.filter((evento) => evento.tipoEvento === "ACTIVIDAD" &&
        ["PREPARACION_CLASE", "PREPARACION_EXAMEN", "CORRECCION_EXAMENES"].includes(evento.categoria))
        .map((evento) => evento.categoria).sort(),
      ["CORRECCION_EXAMENES", "PREPARACION_CLASE", "PREPARACION_EXAMEN"],
    );
    assert.ok(agenda.eventos.every((evento) => evento.titulo !== "Bloque de otro usuario"));

    assert.equal((await request("PATCH", "/1", {
      rol: "DOCENTE",
      id: 42,
      body: { titulo: "Planificación" },
    })).status, 200);
    assert.equal((await request("DELETE", "/1", { rol: "DOCENTE", id: 42 })).status, 200);
    assert.equal((await request("DELETE", "/2", { rol: "DOCENTE", id: 42 })).status, 404);
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

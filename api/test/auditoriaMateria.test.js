import test from "node:test";
import assert from "node:assert/strict";
import {
  crearBloqueConRegistro, describirBloque, describirPrograma, guardarProgramaConRegistro,
  limpiarNombreArchivo, quitarBloqueConRegistro,
} from "../src/services/auditoriaMateria.js";

// DB falsa: $transaction ejecuta la función con un "tx" que anota cada operación y,
// si algo falla a mitad, descarta todo lo anotado (como un rollback).
// `alumnos`: ids de los alumnos inscriptos en la comisión (reciben el aviso de cambio de horario).
function dbFalsa({ fallaEn = null, alumnos = [] } = {}) {
  const confirmadas = [];
  const db = {
    confirmadas,
    $transaction: async (fn) => {
      const pendientes = [];
      const anotar = (operacion, resultado) => async (args) => {
        if (fallaEn === operacion) throw new Error(`falla ${operacion}`);
        pendientes.push({ operacion, args });
        return resultado ?? { id: 1, ...(args?.data ?? {}) };
      };
      const tx = {
        bloqueHorario: { create: anotar("bloque.create"), delete: anotar("bloque.delete", {}) },
        materia: { update: anotar("materia.update", { id: 5, nombre: "Programación I", codigo: "PROG1" }) },
        cambioMateria: { create: anotar("cambio.create") },
        inscripcionComision: { findMany: async (args) => { tx.consultaInscriptos = args; return alumnos.map((alumnoId) => ({ alumnoId })); } },
        notificacion: { createMany: async (args) => {
          if (fallaEn === "notificacion.createMany") throw new Error("falla notificacion.createMany");
          pendientes.push({ operacion: "notificacion.createMany", args });
          return { count: args.data.length };
        } },
      };
      db.ultimaTx = tx;
      const resultado = await fn(tx);
      confirmadas.push(...pendientes);
      return resultado;
    },
  };
  return db;
}

test("describirBloque: día en castellano y «sin aula» cuando no hay", () => {
  assert.equal(describirBloque({ comisionNombre: "Comisión A", dia: "MIERCOLES", horaInicio: "18:00", horaFin: "20:00", aulaNombre: "Aula 1" }),
    "Comisión A: Miércoles 18:00–20:00 · Aula 1");
  assert.match(describirBloque({ comisionNombre: "B", dia: "LUNES", horaInicio: "08:00", horaFin: "10:00" }), /· sin aula$/);
});

test("limpiarNombreArchivo: saca caracteres de control, acota el largo y tolera vacíos", () => {
  assert.equal(limpiarNombreArchivo("programa\n2026\u0000.pdf"), "programa2026.pdf");
  assert.equal(limpiarNombreArchivo("   "), "sin nombre");
  assert.equal(limpiarNombreArchivo(undefined), "sin nombre");
  const largo = limpiarNombreArchivo(`${"a".repeat(200)}.pdf`);
  assert.equal(largo.length, 80); assert.ok(largo.endsWith("…"));
});

test("describirPrograma: distingue subir de reemplazar", () => {
  assert.match(describirPrograma({ nombreArchivo: "p.pdf", reemplaza: false }), /^Se subió el programa/);
  assert.match(describirPrograma({ nombreArchivo: "p.pdf", reemplaza: true }), /^Se reemplazó el programa/);
});

test("agregar un horario guarda el bloque y deja el registro con el autor, en la misma transacción", async () => {
  const db = dbFalsa();
  const bloque = { comisionId: 3, dia: "VIERNES", horaInicio: "10:00", horaFin: "12:00", aulaId: 2 };
  await crearBloqueConRegistro(db, { bloque, comisionNombre: "Comisión A", aulaNombre: "Aula 2", materiaId: 5, autorId: 7 });
  assert.deepEqual(db.confirmadas.map((o) => o.operacion), ["bloque.create", "cambio.create"]);
  assert.deepEqual(db.confirmadas[1].args.data, {
    materiaId: 5, autorId: 7, accion: "HORARIO_AGREGADO", detalle: "Comisión A: Viernes 10:00–12:00 · Aula 2",
  });
});

test("quitar un horario deja el registro con los datos que tenía el bloque", async () => {
  const db = dbFalsa();
  const bloque = { id: 4, dia: "LUNES", horaInicio: "18:00", horaFin: "20:00", aula: { nombre: "Aula 1" }, comision: { nombre: "Comisión A" } };
  await quitarBloqueConRegistro(db, { bloque, materiaId: 5, autorId: 1 });
  assert.deepEqual(db.confirmadas.map((o) => o.operacion), ["bloque.delete", "cambio.create"]);
  assert.deepEqual(db.confirmadas[0].args, { where: { id: 4 } });
  assert.equal(db.confirmadas[1].args.data.accion, "HORARIO_QUITADO");
  assert.equal(db.confirmadas[1].args.data.detalle, "Comisión A: Lunes 18:00–20:00 · Aula 1");
  assert.equal(db.confirmadas[1].args.data.autorId, 1);
});

test("agregar un horario avisa a los alumnos inscriptos en esa comisión, en la misma transacción", async () => {
  const db = dbFalsa({ alumnos: [21, 22] });
  const bloque = { comisionId: 3, dia: "VIERNES", horaInicio: "10:00", horaFin: "12:00", aulaId: 2 };
  await crearBloqueConRegistro(db, { bloque, comisionNombre: "Comisión A", aulaNombre: "Aula 2", materiaId: 5, materiaNombre: "Programación I", autorId: 7 });
  assert.deepEqual(db.confirmadas.map((o) => o.operacion), ["bloque.create", "cambio.create", "notificacion.createMany"]);
  assert.deepEqual(db.ultimaTx.consultaInscriptos.where, { comisionId: 3 }, "solo los de ESA comisión");
  const avisos = db.confirmadas[2].args.data;
  assert.deepEqual(avisos.map((a) => a.usuarioId), [21, 22]);
  assert.equal(avisos[0].tipo, "HORARIO_MODIFICADO");
  assert.equal(avisos[0].titulo, "Cambió el horario de Programación I");
  assert.equal(avisos[0].mensaje, "Se agregó este horario: Comisión A: Viernes 10:00–12:00 · Aula 2");
  assert.equal(avisos[0].materiaId, 5);
  assert.equal(avisos[0].autorId, 7);
});

test("quitar un horario también avisa, con los datos del bloque que ya no existe", async () => {
  const db = dbFalsa({ alumnos: [21] });
  const bloque = { id: 4, comisionId: 3, dia: "LUNES", horaInicio: "18:00", horaFin: "20:00", aula: { nombre: "Aula 1" }, comision: { nombre: "Comisión A" } };
  await quitarBloqueConRegistro(db, { bloque, materiaId: 5, materiaNombre: "Programación I", autorId: 1 });
  assert.deepEqual(db.confirmadas.map((o) => o.operacion), ["bloque.delete", "cambio.create", "notificacion.createMany"]);
  assert.equal(db.confirmadas[2].args.data[0].mensaje, "Se quitó este horario: Comisión A: Lunes 18:00–20:00 · Aula 1");
  assert.equal(db.ultimaTx.consultaInscriptos.where.comisionId, 3);
});

test("sin alumnos inscriptos no se crea ninguna notificación, y un nombre de materia larguísimo no rompe el cambio", async () => {
  const db = dbFalsa();
  const bloque = { comisionId: 3, dia: "LUNES", horaInicio: "10:00", horaFin: "12:00", aulaId: null };
  await crearBloqueConRegistro(db, { bloque, comisionNombre: "A", materiaId: 5, materiaNombre: "X".repeat(500), autorId: 7 });
  assert.ok(!db.confirmadas.some((o) => o.operacion === "notificacion.createMany"));

  const conAlumnos = dbFalsa({ alumnos: [21] });
  await crearBloqueConRegistro(conAlumnos, { bloque, comisionNombre: "A", materiaId: 5, materiaNombre: "X".repeat(500), autorId: 7 });
  const titulo = conAlumnos.confirmadas.at(-1).args.data[0].titulo;
  assert.equal(titulo.length, 120);
  assert.ok(titulo.endsWith("…"));
});

test("si falla el aviso no queda el cambio de horario ni su registro (todo o nada)", async () => {
  const db = dbFalsa({ alumnos: [21], fallaEn: "notificacion.createMany" });
  const bloque = { comisionId: 3, dia: "LUNES", horaInicio: "10:00", horaFin: "12:00", aulaId: null };
  await assert.rejects(crearBloqueConRegistro(db, { bloque, comisionNombre: "A", materiaId: 5, materiaNombre: "Programación I", autorId: 7 }), /falla notificacion\.createMany/);
  assert.equal(db.confirmadas.length, 0);
});

test("subir el programa guarda solo el nombre del archivo y deja el registro", async () => {
  const db = dbFalsa();
  const materia = await guardarProgramaConRegistro(db, {
    materiaId: 5, archivoGuardado: "materia-5-123.pdf", nombreOriginal: "programa 2026.pdf", reemplaza: true, autorId: 7,
  });
  assert.equal(materia.codigo, "PROG1");
  assert.deepEqual(db.confirmadas[0].args.data, { programaUrl: "materia-5-123.pdf" });
  assert.equal(db.confirmadas[1].args.data.accion, "PROGRAMA_SUBIDO");
  assert.match(db.confirmadas[1].args.data.detalle, /^Se reemplazó el programa en PDF por «programa 2026\.pdf»/);
});

test("si falla el registro no queda el cambio, y si falla el cambio no queda el registro", async () => {
  const bloque = { comisionId: 3, dia: "LUNES", horaInicio: "10:00", horaFin: "12:00", aulaId: null };
  const sinRegistro = dbFalsa({ fallaEn: "cambio.create" });
  await assert.rejects(crearBloqueConRegistro(sinRegistro, { bloque, comisionNombre: "A", materiaId: 5, autorId: 7 }), /falla cambio\.create/);
  assert.equal(sinRegistro.confirmadas.length, 0, "el bloque no se confirma sin su registro");

  const sinCambio = dbFalsa({ fallaEn: "bloque.delete" });
  const bloqueExistente = { id: 4, dia: "LUNES", horaInicio: "18:00", horaFin: "20:00", aula: null, comision: { nombre: "A" } };
  await assert.rejects(quitarBloqueConRegistro(sinCambio, { bloque: bloqueExistente, materiaId: 5, autorId: 7 }), /falla bloque\.delete/);
  assert.equal(sinCambio.confirmadas.length, 0, "no queda un registro de un cambio que no se hizo");
});

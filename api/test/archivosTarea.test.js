import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterArchivosTarea } from "../src/routes/archivosTarea.js";
import { extensionPermitida, nombreVisible, rutaArchivo, cabeceraDescarga, DIR_TAREAS } from "../src/services/archivosTarea.js";
import { manejarErrores } from "../src/middleware/errores.js";

// ---------- Reglas (sin DB) ----------

test("extensionPermitida: documentos, planillas, presentaciones, imágenes, ZIP y texto; nada ejecutable", () => {
  for (const n of ["consigna.pdf", "TP.DOCX", "datos.xlsx", "clase.pptx", "foto.JPG", "codigo.zip", "notas.txt"]) assert.equal(extensionPermitida(n), true, n);
  for (const n of ["virus.exe", "script.js", "pagina.html", "sin-extension", "", null]) assert.equal(extensionPermitida(n), false, String(n));
});

test("nombreVisible: sin carpetas ni caracteres raros, y con largo razonable", () => {
  assert.equal(nombreVisible("C:\\Users\\profe\\Consigna TP 1.pdf"), "Consigna TP 1.pdf");
  assert.equal(nombreVisible('../../a"b.pdf'), "ab.pdf");
  const largo = nombreVisible(`${"a".repeat(300)}.pdf`);
  assert.equal(largo.length, 150);
  assert.ok(largo.endsWith(".pdf"));
});

test("rutaArchivo: siempre dentro de la carpeta de tareas", () => {
  for (const v of ["tarea-1.pdf", "../../../etc/passwd", "..\\..\\api\\.env"]) assert.equal(path.dirname(rutaArchivo(v)), path.resolve(DIR_TAREAS), v);
  for (const v of [null, "", "..", "uploads/"]) assert.equal(rutaArchivo(v), null, String(v));
});

test("cabeceraDescarga: nombre ASCII de respaldo y UTF-8 con tildes", () => {
  assert.equal(cabeceraDescarga("Guía práctica.pdf"), `attachment; filename="Guia practica.pdf"; filename*=UTF-8''Gu%C3%ADa%20pr%C3%A1ctica.pdf`);
});

// ---------- HTTP (DB simulada, disco real) ----------

// Tarea 3 de la materia 5, que dicta el docente 7. El alumno 2 cursa la materia 5; el alumno 4, no.
function dbFalsa() {
  const archivos = [];
  const db = {
    archivos,
    tarea: { findUnique: async ({ where }) => (where.id === 3 ? { materiaId: 5 } : null) },
    materia: { findUnique: async () => ({ id: 5, nombre: "Programación I", codigo: "PROG1" }) },
    materiaDocente: { findUnique: async ({ where }) => (where.materiaId_docenteId.docenteId === 7 ? { materiaId: 5 } : null) },
    cursada: { findMany: async ({ where }) => (where.alumnoId === 2 ? [{ materiaId: 5, estado: "EN_CURSO" }] : []) },
    inscripcionComision: { findMany: async () => [] },
    archivoTarea: {
      create: ({ data }) => { const a = { id: archivos.length + 1, ...data }; archivos.push(a); return a; },
      findUnique: async ({ where }) => {
        const a = archivos.find((x) => x.id === where.id);
        return a ? { ...a, tarea: { materiaId: 5 } } : null;
      },
      delete: async ({ where }) => { const i = archivos.findIndex((x) => x.id === where.id); return archivos.splice(i, 1)[0]; },
    },
  };
  db.$transaction = async (ops) => Promise.all(ops);
  return db;
}

async function conAPI(db, fn) {
  process.env.JWT_SECRET = "solo-pruebas-locales";
  const app = express(); app.use(express.json()); app.use("/api/archivos-tarea", crearRouterArchivosTarea(db)); app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/archivos-tarea`;
  const auth = (rol, id) => ({ Authorization: `Bearer ${jwt.sign({ id, rol }, process.env.JWT_SECRET)}` });
  const subir = (rol, id, archivos) => {
    const datos = new FormData();
    for (const [nombre, contenido] of archivos) datos.append("archivos", new Blob([contenido]), nombre);
    return fetch(`${base}/tareas/3`, { method: "POST", headers: auth(rol, id), body: datos });
  };
  const pedir = (metodo, ruta, rol, id) => fetch(`${base}${ruta}`, { method: metodo, headers: auth(rol, id) });
  try { await fn({ subir, pedir }); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP: el docente sube, el alumno que cursa descarga, y al quitarlo se borra del disco", async () => {
  const db = dbFalsa();
  await conAPI(db, async ({ subir, pedir }) => {
    const r = await subir("DOCENTE", 7, [["Consigna TP 1.pdf", "%PDF-1.7 hola"], ["datos.csv", "a,b\n1,2"]]);
    assert.equal(r.status, 201);
    const creados = await r.json();
    assert.deepEqual(creados.map((a) => a.nombre), ["Consigna TP 1.pdf", "datos.csv"]);
    const ruta = rutaArchivo(db.archivos[0].archivo);
    assert.ok(fs.existsSync(ruta), "se guardó en disco con nombre del servidor");
    assert.notEqual(path.basename(ruta), "Consigna TP 1.pdf");

    const descarga = await pedir("GET", "/1", "ALUMNO", 2);
    assert.equal(descarga.status, 200);
    assert.equal(descarga.headers.get("content-type"), "application/pdf");
    assert.match(descarga.headers.get("content-disposition"), /Consigna TP 1\.pdf/);
    assert.equal(await descarga.text(), "%PDF-1.7 hola");

    assert.equal((await pedir("GET", "/1", "ALUMNO", 4)).status, 403, "un alumno que no cursa la materia no descarga");
    assert.equal((await pedir("DELETE", "/1", "ALUMNO", 2)).status, 403);

    for (const id of [1, 2]) assert.equal((await pedir("DELETE", `/${id}`, "DOCENTE", 7)).status, 200);
    assert.equal(fs.existsSync(ruta), false, "se borró del disco");
  });
});

test("HTTP: un docente no asignado o un archivo no permitido no escriben nada en disco", async () => {
  const antes = fs.existsSync(DIR_TAREAS) ? fs.readdirSync(DIR_TAREAS).length : 0;
  const db = dbFalsa();
  await conAPI(db, async ({ subir }) => {
    assert.equal((await subir("DOCENTE", 8, [["consigna.pdf", "x"]])).status, 403);
    assert.equal((await subir("ALUMNO", 2, [["consigna.pdf", "x"]])).status, 403);
    const r = await subir("DOCENTE", 7, [["virus.exe", "MZ"]]);
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /no es un tipo de archivo permitido/);
  });
  assert.equal(db.archivos.length, 0);
  assert.equal(fs.existsSync(DIR_TAREAS) ? fs.readdirSync(DIR_TAREAS).length : 0, antes);
});

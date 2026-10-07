import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { crearRouterProgramas } from "../src/routes/programas.js";
import { validarActualizacion, actualizarPrograma } from "../src/services/actualizarProgramas.js";
import { manejarErrores } from "../src/middleware/errores.js";
import materiasRouter from "../src/routes/materias.js";
import { prisma } from "../src/db.js";

const entrada = () => ({ contenidos: "Unidad nueva\nTemas nuevos", bibliografia: "Referencia nueva", version: 2 });
function base({ pdf = null, vigente = true } = {}) {
  let estado = { programa: { id: 7, materiaId: 4, contenidos: "Anterior", bibliografia: "Referencia", version: 2, vigente, actualizadoEn: new Date() }, pdf, cambios: [] };
  const leer = async args => args.include ? { ...estado.programa, materia: { id: 4, nombre: "Programación", codigo: "P1", programaUrl: estado.pdf } } : { ...estado.programa };
  const db = {
    programa: { findUnique: leer },
    $transaction: async (fn, opciones) => {
      assert.equal(opciones.isolationLevel, "Serializable");
      const previo = structuredClone(estado);
      try {
        return await fn({
          programa: { findUnique: leer, updateMany: async ({ where, data }) => {
            assert.deepEqual(where, { id: 7, version: 2 });
            if (estado.programa.version !== where.version) return { count: 0 };
            estado.programa = { ...estado.programa, ...data, version: estado.programa.version + data.version.increment, actualizadoEn: new Date() };
            return { count: 1 };
          } },
          materia: { update: async ({ where, data }) => { assert.deepEqual(where, { id: 4 }); assert.deepEqual(data, { programaUrl: null }); estado.pdf = null; } },
          cambioMateria: { create: async ({ data }) => { estado.cambios.push(data); return data; } },
        });
      } catch (e) { estado = previo; throw e; }
    },
  };
  return { db, estado: () => estado };
}
async function conAPI(db, fn, lectura = false) {
  process.env.JWT_SECRET = "actualizar-programas-tests";
  const app = express(); app.use(express.json()); app.use("/api/programas", crearRouterProgramas(db));
  if (lectura) app.use("/api/materias", materiasRouter);
  app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r));
  const request = (rol, body, ruta = "/programas/7") => fetch(`http://127.0.0.1:${server.address().port}/api${ruta}`, {
    method: body === undefined ? "GET" : "PATCH",
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${jwt.sign({ id: 9, rol }, process.env.JWT_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(request); } finally { await new Promise(r => server.close(r)); }
}
test("validación de actualización rechaza vacíos, tipos incorrectos, versión faltante y campos ajenos", () => {
  for (const cambio of [{ contenidos: " " }, { contenidos: "a".repeat(20001) }, { bibliografia: {} }, { bibliografia: "a".repeat(10001) }, { version: undefined }, { version: 0 }, { version: 2.5 }, { reemplazarPdf: "true" }, { materiaId: 99 }, { vigente: false }]) {
    assert.throws(() => validarActualizacion({ ...entrada(), ...cambio }), e => e.status === 400);
  }
  assert.equal(validarActualizacion({ ...entrada(), bibliografia: " " }).bibliografia, null);
});
test("solo ADMIN puede leer el formulario y actualizar", async () => {
  await conAPI({}, async request => {
    for (const [rol, status] of [[null, 401], ["ALUMNO", 403], ["DOCENTE", 403]]) {
      assert.equal((await request(rol)).status, status);
      assert.equal((await request(rol, entrada())).status, status);
    }
  });
});
test("GET permite abrir un programa no vigente para republicarlo", async () => {
  await conAPI(base({ vigente: false }).db, async request => {
    const r = await request("ADMIN"); assert.equal(r.status, 200); assert.equal((await r.json()).vigente, false);
  });
});
test("actualiza, incrementa versión y registra autor del token; el alumno lee el contenido nuevo", async () => {
  const b = base(); const original = prisma.materia.findUnique;
  prisma.materia.findUnique = async () => ({ nombre: "Programación", codigo: "P1", programa: b.estado().programa });
  try {
    await conAPI(b.db, async request => {
      const r = await request("ADMIN", entrada()); assert.equal(r.status, 200);
      const p = await r.json(); assert.equal(p.version, 3); assert.equal(p.vigente, true); assert.equal(p.materiaId, 4);
      assert.equal(b.estado().cambios[0].autorId, 9); assert.match(b.estado().cambios[0].detalle, /versión 2 a 3/);
      const lectura = await request("ALUMNO", undefined, "/materias/4/programa"); assert.equal(lectura.status, 200);
      assert.equal((await lectura.json()).programa.contenidos, entrada().contenidos);
    }, true);
  } finally { prisma.materia.findUnique = original; }
});
test("rechaza formularios desactualizados sin sobrescribir ni registrar cambios", async () => {
  const b = base(); await conAPI(b.db, async request => {
    assert.equal((await request("ADMIN", { ...entrada(), version: 1 })).status, 409);
    assert.equal(b.estado().programa.version, 2); assert.equal(b.estado().cambios.length, 0);
  });
});
test("PDF anterior requiere confirmación y pasa a generarse desde texto vigente", async () => {
  const b = base({ pdf: "anterior.pdf" }); await conAPI(b.db, async request => {
    assert.equal((await request("ADMIN", { ...entrada(), pdfEsperado: "anterior.pdf" })).status, 409);
    assert.equal(b.estado().pdf, "anterior.pdf"); assert.equal(b.estado().programa.version, 2);
    assert.equal((await request("ADMIN", { ...entrada(), pdfEsperado: "anterior.pdf", reemplazarPdf: true })).status, 200);
    assert.equal(b.estado().pdf, null); assert.equal(b.estado().programa.version, 3);
  });
});
test("no retira un PDF que cambió después de abrir el formulario", async () => {
  const b = base({ pdf: "mas-reciente.pdf" }); await conAPI(b.db, async request => {
    assert.equal((await request("ADMIN", { ...entrada(), pdfEsperado: "anterior.pdf", reemplazarPdf: true })).status, 409);
    assert.equal(b.estado().pdf, "mas-reciente.pdf"); assert.equal(b.estado().programa.version, 2);
  });
});
test("permite limpiar bibliografía y republicar programas no vigentes", async () => {
  const b = base({ vigente: false });
  const p = await actualizarPrograma(b.db, { id: 7, autorId: 9, datos: validarActualizacion({ ...entrada(), bibliografia: "" }) });
  assert.equal(p.bibliografia, null); assert.equal(p.vigente, true); assert.equal(p.version, 3);
});
test("guardar sin cambios no genera una versión artificial", async () => {
  const b = base(); await conAPI(b.db, async request => {
    assert.equal((await request("ADMIN", { ...entrada(), contenidos: "Anterior", bibliografia: "Referencia" })).status, 400);
    assert.equal(b.estado().programa.version, 2);
  });
});
test("IDs inválidos, programa inexistente y conflictos de transacción tienen respuesta clara", async () => {
  await conAPI({}, async request => assert.equal((await request("ADMIN", entrada(), "/programas/abc")).status, 400));
  const db = { programa: { findUnique: async () => null }, $transaction: fn => fn({ programa: { findUnique: async () => null } }) };
  await conAPI(db, async request => {
    assert.equal((await request("ADMIN")).status, 404); assert.equal((await request("ADMIN", entrada())).status, 404);
  });
  await conAPI({ $transaction: async () => { throw { code: "P2034" }; } }, async request => assert.equal((await request("ADMIN", entrada())).status, 409));
});

// Datos de prueba mínimos para poder probar las historias de materias y
// horarios sin tener que cargar todo a mano. Correr con: node prisma/seed.js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const carrera = await prisma.carrera.upsert({
    where: { codigo: "LSI" },
    update: {},
    create: { nombre: "Licenciatura en Sistemas de Información", codigo: "LSI" },
  });

  const plan = await prisma.planEstudio.upsert({
    where: { id: 1 },
    update: {},
    create: { nombre: "Plan 2023", anio: 2023, carreraId: carrera.id },
  });

  const aulaA = await prisma.aula.upsert({
    where: { nombre: "Aula 1" },
    update: {},
    create: { nombre: "Aula 1", edificio: "Central", capacidad: 40 },
  });
  const aulaB = await prisma.aula.upsert({
    where: { nombre: "Aula 2" },
    update: {},
    create: { nombre: "Aula 2", edificio: "Central", capacidad: 30 },
  });

  const programacion = await prisma.materia.upsert({
    where: { codigo: "PROG1" },
    update: {},
    create: {
      nombre: "Programación I",
      codigo: "PROG1",
      anio: 1,
      cuatrimestre: 1,
      cargaHoraria: 96,
      descripcion: "Introducción a la programación estructurada.",
      planId: plan.id,
    },
  });

  const basesDeDatos = await prisma.materia.upsert({
    where: { codigo: "BD1" },
    update: {},
    create: {
      nombre: "Bases de Datos",
      codigo: "BD1",
      anio: 2,
      cuatrimestre: 1,
      cargaHoraria: 80,
      descripcion: "Modelado relacional y SQL.",
      planId: plan.id,
    },
  });

  // Dos comisiones de Programación I con horarios que se pisan entre sí,
  // para poder probar que el alumno elige una u otra, no ambas.
  const comisionA = await prisma.comision.upsert({
    where: { id: 1 },
    update: {},
    create: {
      nombre: "Comisión A",
      materiaId: programacion.id,
      bloques: {
        create: [{ dia: "LUNES", horaInicio: "18:00", horaFin: "20:00", aulaId: aulaA.id }],
      },
    },
  });
  const comisionB = await prisma.comision.upsert({
    where: { id: 2 },
    update: {},
    create: {
      nombre: "Comisión B",
      materiaId: programacion.id,
      bloques: {
        create: [{ dia: "MIERCOLES", horaInicio: "18:00", horaFin: "20:00", aulaId: aulaA.id }],
      },
    },
  });

  // Comisión de Bases de Datos que se pisa con la Comisión A de Programación I
  // (mismo día y horario), para poder probar el rechazo por superposición.
  await prisma.comision.upsert({
    where: { id: 3 },
    update: {},
    create: {
      nombre: "Comisión A",
      materiaId: basesDeDatos.id,
      bloques: {
        create: [{ dia: "LUNES", horaInicio: "19:00", horaFin: "21:00", aulaId: aulaB.id }],
      },
    },
  });

  console.log("Seed listo:", { carrera: carrera.nombre, materias: [programacion.codigo, basesDeDatos.codigo] });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

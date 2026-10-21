// Datos de prueba mínimos para poder probar las historias de materias y
// horarios sin tener que cargar todo a mano. Correr con: node prisma/seed.js
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const carrera = await prisma.carrera.upsert({
    where: { codigo: "IEI" },
    update: {},
    create: { nombre: "Ingeniería en Informática", codigo: "IEI" },
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
    update: { cuatrimestre: 2 },
    create: {
      nombre: "Programación I",
      codigo: "PROG1",
      anio: 1,
      cuatrimestre: 2,
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

  const anioActual = new Date().getFullYear();
  const passwordHash = await bcrypt.hash("Demo1234!", 10);
  const alumno = await prisma.usuario.upsert({
    where: { email: "alumna.demo@alumnos.ucse.edu.ar" },
    update: {
      nombre: "Ana",
      apellido: "Demo",
      rol: "ALUMNO",
      passwordHash,
      carreraId: carrera.id,
      planEstudioId: plan.id,
    },
    create: {
      email: "alumna.demo@alumnos.ucse.edu.ar",
      nombre: "Ana",
      apellido: "Demo",
      rol: "ALUMNO",
      passwordHash,
      carreraId: carrera.id,
      planEstudioId: plan.id,
    },
  });
  const docente = await prisma.usuario.upsert({
    where: { email: "docente.demo@ucse.edu.ar" },
    update: {
      nombre: "María",
      apellido: "Docente",
      rol: "DOCENTE",
      passwordHash,
    },
    create: {
      email: "docente.demo@ucse.edu.ar",
      nombre: "María",
      apellido: "Docente",
      rol: "DOCENTE",
      passwordHash,
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

  await prisma.materiaDocente.upsert({
    where: { materiaId_docenteId: { materiaId: programacion.id, docenteId: docente.id } },
    update: {},
    create: { materiaId: programacion.id, docenteId: docente.id },
  });
  await prisma.bloqueHorario.updateMany({
    where: { comisionId: comisionB.id },
    data: { docenteId: docente.id },
  });
  await prisma.inscripcionComision.upsert({
    where: { alumnoId_comisionId: { alumnoId: alumno.id, comisionId: comisionB.id } },
    update: {},
    create: { alumnoId: alumno.id, comisionId: comisionB.id },
  });
  const cursada = await prisma.cursada.upsert({
    where: { alumnoId_materiaId: { alumnoId: alumno.id, materiaId: programacion.id } },
    update: { estado: "EN_CURSO" },
    create: { alumnoId: alumno.id, materiaId: programacion.id, estado: "EN_CURSO" },
  });

  const inicioClases = new Date(Date.UTC(anioActual, 7, 1));
  const finClases = new Date(Date.UTC(anioActual, 11, 20));
  const periodoClasesExistente = await prisma.periodoAcademico.findFirst({
    where: { anio: anioActual, tipo: "CLASES_CUATRIMESTRE_2" },
  });
  if (periodoClasesExistente) {
    await prisma.periodoAcademico.update({
      where: { id: periodoClasesExistente.id },
      data: { nombre: "Segundo cuatrimestre", fechaInicio: inicioClases, fechaFin: finClases },
    });
  } else {
    await prisma.periodoAcademico.create({
      data: {
        anio: anioActual,
        tipo: "CLASES_CUATRIMESTRE_2",
        nombre: "Segundo cuatrimestre",
        fechaInicio: inicioClases,
        fechaFin: finClases,
      },
    });
  }
  const inicioFinales = new Date(Date.UTC(anioActual, 11, 7));
  const finFinales = new Date(Date.UTC(anioActual, 11, 23));
  const periodoFinalesExistente = await prisma.periodoAcademico.findFirst({
    where: { anio: anioActual, tipo: "EXAMENES_FINALES" },
  });
  if (periodoFinalesExistente) {
    await prisma.periodoAcademico.update({
      where: { id: periodoFinalesExistente.id },
      data: { nombre: "Turno de diciembre", fechaInicio: inicioFinales, fechaFin: finFinales },
    });
  } else {
    await prisma.periodoAcademico.create({
      data: {
        anio: anioActual,
        tipo: "EXAMENES_FINALES",
        nombre: "Turno de diciembre",
        fechaInicio: inicioFinales,
        fechaFin: finFinales,
      },
    });
  }
  await prisma.publicacionCalendario.upsert({
    where: { anio: anioActual },
    update: { publicado: true },
    create: { anio: anioActual, publicado: true },
  });

  const fechaExamen = new Date(Date.UTC(anioActual, 10, 12));
  const examenExistente = await prisma.fechaExamen.findFirst({
    where: { materiaId: programacion.id, tipo: "PARCIAL", fecha: fechaExamen },
  });
  if (!examenExistente) {
    await prisma.fechaExamen.create({
      data: {
        materiaId: programacion.id,
        tipo: "PARCIAL",
        fecha: fechaExamen,
        hora: "18:00",
        aulaId: aulaB.id,
        creadoPorId: docente.id,
      },
    });
  }

  for (const [usuarioId, actividad] of [
    [alumno.id, {
      titulo: "Repasar programación",
      notas: "Resolver ejercicios de funciones y arreglos.",
      estado: "EN_CURSO",
      categoria: "ESTUDIO",
      dia: "JUEVES",
    }],
    [docente.id, {
      titulo: "Preparar clase",
      notas: "Organizar ejemplos prácticos para la próxima unidad.",
      estado: "PENDIENTE",
      categoria: "PREPARACION_CLASE",
      dia: "MARTES",
    }],
  ]) {
    const existente = await prisma.actividadPersonal.findFirst({
      where: { usuarioId, titulo: actividad.titulo },
    });
    if (!existente) {
      await prisma.actividadPersonal.create({
        data: {
          ...actividad,
          usuarioId,
          programacion: "RECURRENTE",
          duracion: 60,
          horaInicio: usuarioId === alumno.id ? "16:00" : "10:00",
          etiquetas: ["Demo"],
        },
      });
    }
  }

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

  // Correlatividad: para cursar Bases de Datos hay que tener Programación I.
  // Sirve para ver las materias relacionadas desde el panel del docente.
  await prisma.correlatividad.upsert({
    where: { materiaId_requiereId: { materiaId: basesDeDatos.id, requiereId: programacion.id } },
    update: {},
    create: { materiaId: basesDeDatos.id, requiereId: programacion.id },
  });

  // Programa con bibliografía (una obra por renglón) para la pestaña «Bibliografía».
  await prisma.programa.upsert({
    where: { materiaId: programacion.id },
    update: {},
    create: {
      materiaId: programacion.id,
      contenidos: "Algoritmos, estructuras de control, funciones, arreglos y punteros.",
      bibliografia: [
        "- Deitel, P. y Deitel, H. Cómo programar en C. Pearson.",
        "- Kernighan, B. y Ritchie, D. El lenguaje de programación C. Prentice Hall.",
        "- Joyanes Aguilar, L. Fundamentos de programación. McGraw-Hill.",
      ].join("\n"),
    },
  });

  console.log("Seed listo:", {
    carrera: carrera.nombre,
    materias: [programacion.codigo, basesDeDatos.codigo],
    cuentas: [
      { rol: "ALUMNO", email: alumno.email, password: "Demo1234!" },
      { rol: "DOCENTE", email: docente.email, password: "Demo1234!" },
    ],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

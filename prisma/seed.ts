// ============================================================================
// Inkademy — seed de datos demo
//
// Se ejecuta con `pnpm prisma:seed` (== `tsx prisma/seed.ts`) desde la raíz.
//
// Nota de resolución de módulos: se importa `@inkademy/db` con una ruta
// relativa (`../packages/db/src`) en vez del specifier de workspace
// (`@inkademy/db`). Al correr este script vía `tsx` desde la raíz del repo
// (que NO es un paquete del workspace), un import "bare" como `@inkademy/db`
// solo resuelve si el root `package.json` lo declara como dependencia — y no
// lo declara. El import relativo, en cambio, siempre funciona porque `tsx`
// solo necesita ubicar el archivo en disco; el archivo importado
// (`packages/db/src/index.ts`) sigue resolviendo su propio `../generated`
// de forma relativa a sí mismo, así que el cliente Prisma generado se
// encuentra igual. Ver IMPLEMENTATION-NOTES.md para más detalle.
// ============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

// `tsx prisma/seed.ts` se ejecuta como script standalone (no pasa por el CLI
// de Prisma, que sí carga `.env` automáticamente) — sin esto, `DATABASE_URL`
// nunca llega a `process.env` y el script falla incluso con un `.env`
// presente en la raíz del repo.
dotenv.config({ path: join(__dirname, "../.env") });
if (!existsSync(join(__dirname, "../.env"))) {
  // eslint-disable-next-line no-console
  console.warn("Aviso: no se encontró .env en la raíz del repo; usando solo variables de entorno del proceso.");
}

import argon2 from "argon2";
import { prisma } from "../packages/db/src";

const DEMO_PASSWORD = "Demo1234!";

function loc(es: string, en?: string): Record<string, string> {
  return en ? { es, en } : { es };
}

function daysFromNow(days: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

async function main() {
  const alreadySeeded = await prisma.area.count();
  if (alreadySeeded > 0) {
    console.log(`Ya existen ${alreadySeeded} Area(s) — el seed parece aplicado. No se hace nada (evita duplicados).`);
    return;
  }

  console.log("Sembrando datos demo de Inkademy...");
  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  // ---------------------------------------------------------------------
  // 1. Áreas y subáreas
  // ---------------------------------------------------------------------
  const areaGestion = await prisma.area.create({
    data: {
      slug: "gestion",
      name: loc("Gestión", "Management"),
      icon: "briefcase",
      order: 1,
      subareas: {
        create: [
          { slug: "liderazgo", name: loc("Liderazgo", "Leadership") },
          { slug: "gestion-de-proyectos", name: loc("Gestión de Proyectos", "Project Management") },
        ],
      },
    },
    include: { subareas: true },
  });

  const areaFinanzas = await prisma.area.create({
    data: {
      slug: "finanzas",
      name: loc("Finanzas", "Finance"),
      icon: "banknote",
      order: 2,
      subareas: {
        create: [
          { slug: "finanzas-para-no-financieros", name: loc("Finanzas para no financieros") },
          { slug: "finanzas-corporativas", name: loc("Finanzas Corporativas", "Corporate Finance") },
        ],
      },
    },
    include: { subareas: true },
  });

  const areaTecnologia = await prisma.area.create({
    data: {
      slug: "tecnologia",
      name: loc("Tecnología", "Technology"),
      icon: "cpu",
      order: 3,
      subareas: {
        create: [
          { slug: "datos-y-analitica", name: loc("Datos y Analítica", "Data & Analytics") },
          { slug: "ciberseguridad", name: loc("Ciberseguridad", "Cybersecurity") },
        ],
      },
    },
    include: { subareas: true },
  });

  const areaRRHH = await prisma.area.create({
    data: {
      slug: "recursos-humanos",
      name: loc("Recursos Humanos", "Human Resources"),
      icon: "users",
      order: 4,
      subareas: {
        create: [{ slug: "reclutamiento-y-seleccion", name: loc("Reclutamiento y Selección") }],
      },
    },
    include: { subareas: true },
  });

  const areaSeguridad = await prisma.area.create({
    data: {
      slug: "seguridad",
      name: loc("Seguridad", "Safety"),
      icon: "shield",
      order: 5,
      subareas: {
        create: [{ slug: "seguridad-y-salud-en-el-trabajo", name: loc("Seguridad y Salud en el Trabajo") }],
      },
    },
    include: { subareas: true },
  });

  const areaBlandas = await prisma.area.create({
    data: {
      slug: "habilidades-blandas",
      name: loc("Habilidades Blandas", "Soft Skills"),
      icon: "message-circle",
      order: 6,
      subareas: {
        create: [{ slug: "comunicacion", name: loc("Comunicación", "Communication") }],
      },
    },
    include: { subareas: true },
  });

  // ---------------------------------------------------------------------
  // 2. Cursos (grabados y en vivo, distintos niveles/tipos)
  // ---------------------------------------------------------------------
  function threeModulesWithLessons(prefix: string) {
    return {
      create: [1, 2, 3].map((m) => ({
        order: m,
        title: loc(`Módulo ${m}: ${prefix} — parte ${m}`),
        lessons: {
          create: [1, 2, 3].map((l) => ({
            order: l,
            title: loc(`Lección ${m}.${l}`),
            contentType: "VIDEO" as const,
            durationMinutes: 12 + l,
            isFreePreview: m === 1 && l === 1,
          })),
        },
      })),
    };
  }

  const courseGestionProyectos = await prisma.course.create({
    data: {
      slug: "fundamentos-gestion-de-proyectos",
      title: loc("Fundamentos de Gestión de Proyectos", "Project Management Fundamentals"),
      subtitle: loc("Aprende a planificar y ejecutar proyectos con metodologías ágiles y tradicionales"),
      description: loc("Curso introductorio a la gestión de proyectos: ciclo de vida, cronogramas, riesgos y metodologías ágiles."),
      areaId: areaGestion.id,
      subareaId: areaGestion.subareas.find((s) => s.slug === "gestion-de-proyectos")!.id,
      modality: "RECORDED",
      type: "COURSE",
      level: "INITIAL",
      durationHours: 20,
      priceAmount: 280,
      priceCurrency: "PEN",
      certificationIncluded: true,
      accessDurationPolicy: "MONTHS_6",
      status: "PUBLISHED",
      b2bAvailable: true,
      b2bPriceAmount: 240,
      modules: threeModulesWithLessons("Gestión de Proyectos"),
    },
    include: { modules: { include: { lessons: true } } },
  });

  await prisma.approvalRule.create({
    data: { courseId: courseGestionProyectos.id, minProgressPct: 100, minScore: 70 },
  });

  const assessmentGP = await prisma.assessment.create({
    data: {
      courseId: courseGestionProyectos.id,
      title: loc("Examen final: Fundamentos de Gestión de Proyectos"),
      type: "exam",
      minScore: 70,
      maxAttempts: 3,
      timeLimitMinutes: 45,
      questionOrder: "FIXED",
      questions: {
        create: [
          {
            type: "SINGLE_CHOICE",
            text: loc("¿Cuál de las siguientes es una fase típica del ciclo de vida de un proyecto?"),
            options: [
              { id: "a", text: "Inicio" },
              { id: "b", text: "Auditoría fiscal" },
              { id: "c", text: "Liquidación societaria" },
            ],
            correctAnswer: "a",
            points: 1,
            tags: ["ciclo-de-vida"],
          },
          {
            type: "MULTI_CHOICE",
            text: loc("¿Cuáles de las siguientes son restricciones clásicas de un proyecto (triángulo de hierro)?"),
            options: [
              { id: "a", text: "Alcance" },
              { id: "b", text: "Tiempo" },
              { id: "c", text: "Costo" },
              { id: "d", text: "Clima organizacional" },
            ],
            correctAnswer: ["a", "b", "c"],
            points: 2,
            tags: ["restricciones"],
          },
          {
            type: "TRUE_FALSE",
            text: loc("Un sprint en Scrum tiene una duración fija (time-boxed)."),
            options: [
              { id: "true", text: "Verdadero" },
              { id: "false", text: "Falso" },
            ],
            correctAnswer: "true",
            points: 1,
            tags: ["agil"],
          },
          {
            type: "SHORT_ANSWER",
            text: loc("¿Qué significa la sigla EDT (o WBS en inglés)?"),
            correctAnswer: "Estructura de Descomposición del Trabajo",
            points: 1,
            tags: ["planificacion"],
          },
          {
            type: "OPEN",
            text: loc("Describe brevemente un riesgo que hayas identificado (o imaginado) en un proyecto y cómo lo mitigarías."),
            correctAnswer: null,
            points: 2,
            tags: ["gestion-de-riesgos"],
          },
        ],
      },
    },
    include: { questions: true },
  });

  const courseLiderazgo = await prisma.course.create({
    data: {
      slug: "liderazgo-de-equipos-remotos",
      title: loc("Liderazgo de Equipos Remotos", "Leading Remote Teams"),
      subtitle: loc("Aprende a liderar equipos remotos e híbridos con alto desempeño"),
      description: loc("Taller práctico y en vivo sobre liderazgo, comunicación asíncrona y gestión del desempeño en equipos distribuidos."),
      areaId: areaGestion.id,
      subareaId: areaGestion.subareas.find((s) => s.slug === "liderazgo")!.id,
      modality: "LIVE",
      type: "COURSE",
      level: "INTERMEDIATE",
      durationHours: 12,
      priceAmount: 350,
      priceCurrency: "PEN",
      certificationIncluded: true,
      accessDurationPolicy: "DAYS_30",
      status: "PUBLISHED",
      b2bAvailable: true,
      modules: {
        create: [
          {
            order: 1,
            title: loc("Módulo 1: Fundamentos del liderazgo remoto"),
            lessons: {
              create: [
                { order: 1, title: loc("Lección 1.1: Retos del liderazgo a distancia"), contentType: "VIDEO", durationMinutes: 15, isFreePreview: true },
                { order: 2, title: loc("Lección 1.2: Herramientas de comunicación asíncrona"), contentType: "PDF", durationMinutes: 10 },
              ],
            },
          },
        ],
      },
    },
    include: { modules: { include: { lessons: true } } },
  });

  await prisma.approvalRule.create({
    data: { courseId: courseLiderazgo.id, minProgressPct: 80, minAttendancePct: 70, minScore: 0 },
  });

  const courseFinanzasNoFinancieros = await prisma.course.create({
    data: {
      slug: "finanzas-para-no-financieros",
      title: loc("Finanzas para no Financieros", "Finance for Non-Financial Managers"),
      subtitle: loc("Entiende los estados financieros y toma mejores decisiones de negocio"),
      areaId: areaFinanzas.id,
      subareaId: areaFinanzas.subareas.find((s) => s.slug === "finanzas-para-no-financieros")!.id,
      modality: "RECORDED",
      type: "COURSE",
      level: "INITIAL",
      durationHours: 16,
      priceAmount: 250,
      priceCurrency: "PEN",
      certificationIncluded: true,
      accessDurationPolicy: "PERMANENT",
      status: "PUBLISHED",
      nextRecommendedCourseIds: [],
      modules: threeModulesWithLessons("Finanzas para no financieros"),
    },
    include: { modules: true },
  });

  await prisma.approvalRule.create({
    data: { courseId: courseFinanzasNoFinancieros.id, minProgressPct: 100, minScore: 0 },
  });

  const courseAnalisisFinanciero = await prisma.course.create({
    data: {
      slug: "analisis-financiero-avanzado",
      title: loc("Análisis Financiero Avanzado", "Advanced Financial Analysis"),
      subtitle: loc("Valorización, ratios avanzados y modelos financieros"),
      areaId: areaFinanzas.id,
      subareaId: areaFinanzas.subareas.find((s) => s.slug === "finanzas-corporativas")!.id,
      modality: "RECORDED",
      type: "WORKSHOP",
      level: "ADVANCED",
      durationHours: 18,
      priceAmount: 400,
      priceCurrency: "PEN",
      certificationIncluded: true,
      accessDurationPolicy: "MONTHS_6",
      status: "PUBLISHED",
      prerequisiteCourseIds: [courseFinanzasNoFinancieros.id],
      modules: threeModulesWithLessons("Análisis Financiero Avanzado"),
    },
  });
  // Curso intencionalmente sin CourseStaff / sin ApprovalRule todavía —
  // sirve de ejemplo real para el "trabajo por excepción" del admin
  // (AdminExceptionDTO: COURSE_WITHOUT_TEACHER, ver docs/API-CONTRACT.md).

  const courseDataAnalytics = await prisma.course.create({
    data: {
      slug: "introduccion-data-analytics-python",
      title: loc("Introducción a Data Analytics con Python", "Intro to Data Analytics with Python"),
      subtitle: loc("Tu primer paso para analizar datos con pandas y visualización"),
      areaId: areaTecnologia.id,
      subareaId: areaTecnologia.subareas.find((s) => s.slug === "datos-y-analitica")!.id,
      modality: "RECORDED",
      type: "COURSE",
      level: "INITIAL",
      durationHours: 24,
      priceAmount: 320,
      priceCurrency: "PEN",
      certificationIncluded: true,
      accessDurationPolicy: "MONTHS_6",
      status: "PUBLISHED",
      modules: threeModulesWithLessons("Data Analytics con Python"),
    },
  });

  await prisma.approvalRule.create({
    data: { courseId: courseDataAnalytics.id, minProgressPct: 100, minScore: 70 },
  });

  const courseCiberseguridad = await prisma.course.create({
    data: {
      slug: "ciberseguridad-para-empresas",
      title: loc("Ciberseguridad para Empresas", "Cybersecurity for Businesses"),
      subtitle: loc("Riesgos, buenas prácticas y cultura de seguridad de la información"),
      areaId: areaTecnologia.id,
      subareaId: areaTecnologia.subareas.find((s) => s.slug === "ciberseguridad")!.id,
      modality: "LIVE",
      type: "SEMINAR",
      level: "INTERMEDIATE",
      durationHours: 4,
      priceAmount: 180,
      priceCurrency: "PEN",
      certificationIncluded: true,
      accessDurationPolicy: "DAYS_30",
      status: "PUBLISHED",
      modules: {
        create: [
          {
            order: 1,
            title: loc("Material previo"),
            lessons: { create: [{ order: 1, title: loc("Lectura: glosario de ciberseguridad"), contentType: "PDF", isFreePreview: true }] },
          },
        ],
      },
    },
  });

  await prisma.approvalRule.create({
    data: { courseId: courseCiberseguridad.id, minProgressPct: 50, minAttendancePct: 80, minScore: 0 },
  });

  const courseReclutamiento = await prisma.course.create({
    data: {
      slug: "reclutamiento-y-seleccion-por-competencias",
      title: loc("Reclutamiento y Selección por Competencias", "Competency-Based Recruitment"),
      subtitle: loc("Diseña procesos de selección más objetivos y efectivos"),
      areaId: areaRRHH.id,
      subareaId: areaRRHH.subareas.find((s) => s.slug === "reclutamiento-y-seleccion")!.id,
      modality: "RECORDED",
      type: "WORKSHOP",
      level: "INTERMEDIATE",
      durationHours: 10,
      priceAmount: 260,
      priceCurrency: "PEN",
      certificationIncluded: true,
      accessDurationPolicy: "MONTHS_6",
      status: "PUBLISHED",
      modules: threeModulesWithLessons("Reclutamiento por Competencias"),
    },
  });

  await prisma.approvalRule.create({
    data: { courseId: courseReclutamiento.id, minProgressPct: 100, minScore: 0 },
  });

  const courseComunicacion = await prisma.course.create({
    data: {
      slug: "comunicacion-efectiva-y-feedback",
      title: loc("Comunicación Efectiva y Feedback", "Effective Communication & Feedback"),
      subtitle: loc("Masterclass práctica sobre comunicación asertiva en el trabajo"),
      areaId: areaBlandas.id,
      subareaId: areaBlandas.subareas.find((s) => s.slug === "comunicacion")!.id,
      modality: "LIVE",
      type: "MASTERCLASS",
      level: "INITIAL",
      durationHours: 2,
      priceAmount: 150,
      priceCurrency: "PEN",
      certificationIncluded: false,
      accessDurationPolicy: "DAYS_30",
      status: "PUBLISHED",
    },
  });

  const courseSST = await prisma.course.create({
    data: {
      slug: "seguridad-y-salud-en-el-trabajo-fundamentos",
      title: loc("Seguridad y Salud en el Trabajo: Fundamentos", "Occupational Health & Safety Fundamentals"),
      subtitle: loc("Marco normativo, identificación de peligros y cultura de prevención"),
      areaId: areaSeguridad.id,
      subareaId: areaSeguridad.subareas.find((s) => s.slug === "seguridad-y-salud-en-el-trabajo")!.id,
      modality: "RECORDED",
      type: "COURSE",
      level: "INITIAL",
      durationHours: 14,
      priceAmount: 220,
      priceCurrency: "PEN",
      certificationIncluded: true,
      accessDurationPolicy: "PERMANENT",
      status: "PUBLISHED",
      modules: threeModulesWithLessons("Seguridad y Salud en el Trabajo"),
    },
  });

  await prisma.approvalRule.create({
    data: { courseId: courseSST.id, minProgressPct: 100, minScore: 0 },
  });

  // ---------------------------------------------------------------------
  // 3. Programa / Diplomado (agrupa 3 cursos con precio con descuento)
  // ---------------------------------------------------------------------
  const separatePriceTotal = 280 + 250 + 400; // = 930
  const diploma = await prisma.program.create({
    data: {
      slug: "diplomado-en-gestion-financiera-y-de-proyectos",
      title: loc("Diplomado en Gestión Financiera y de Proyectos", "Diploma in Financial & Project Management"),
      description: loc("Ruta formativa que combina gestión de proyectos y finanzas para mandos medios."),
      type: "DIPLOMA",
      priceAmount: 790, // ~15% de descuento vs. 930 comprando los cursos sueltos
      priceCurrency: "PEN",
      certificationIncluded: true,
      status: "PUBLISHED",
      courses: {
        create: [
          { courseId: courseGestionProyectos.id, order: 1, isRequired: true },
          { courseId: courseFinanzasNoFinancieros.id, order: 2, isRequired: true },
          { courseId: courseAnalisisFinanciero.id, order: 3, isRequired: true },
        ],
      },
    },
  });
  console.log(`Diplomado creado con precio ${diploma.priceAmount} (ahorro vs. ${separatePriceTotal} comprando suelto).`);

  // ---------------------------------------------------------------------
  // 4. Sesiones en vivo futuras
  // ---------------------------------------------------------------------
  await prisma.liveSession.create({
    data: {
      courseId: courseComunicacion.id,
      title: loc("Masterclass: Comunicación Efectiva y Feedback"),
      startsAt: daysFromNow(8, 18, 0),
      endsAt: daysFromNow(8, 20, 0),
      timezone: "America/Lima",
      capacity: 60,
      status: "SCHEDULED",
      provider: "TEAMS",
      organizerUpn: process.env.MS_TEAMS_ORGANIZER_UPN || "docente@demo.inkademy.com",
    },
  });

  const liveSessionLiderazgo1 = await prisma.liveSession.create({
    data: {
      courseId: courseLiderazgo.id,
      title: loc("Sesión 1: Fundamentos del liderazgo remoto"),
      startsAt: daysFromNow(15, 10, 0),
      endsAt: daysFromNow(15, 12, 0),
      timezone: "America/Lima",
      capacity: 30,
      status: "SCHEDULED",
      provider: "TEAMS",
      organizerUpn: process.env.MS_TEAMS_ORGANIZER_UPN || "docente@demo.inkademy.com",
    },
  });

  await prisma.liveSession.create({
    data: {
      courseId: courseCiberseguridad.id,
      title: loc("Seminario en vivo: Ciberseguridad para Empresas"),
      startsAt: daysFromNow(20, 15, 0),
      endsAt: daysFromNow(20, 19, 0),
      timezone: "America/Lima",
      capacity: 100,
      status: "SCHEDULED",
      provider: "TEAMS",
      organizerUpn: process.env.MS_TEAMS_ORGANIZER_UPN || "docente@demo.inkademy.com",
    },
  });

  // ---------------------------------------------------------------------
  // 5. Plantilla de certificado por defecto
  // ---------------------------------------------------------------------
  const certificateTemplate = await prisma.certificateTemplate.create({
    data: {
      name: "Plantilla estándar Inkademy",
      locale: "es",
      version: 1,
      active: true,
      htmlTemplate: `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Georgia, serif; margin: 0; padding: 60px; text-align: center; color: #1f2937; }
      .frame { border: 6px double #4338ca; padding: 48px; }
      h1 { font-size: 14px; letter-spacing: 4px; text-transform: uppercase; color: #4338ca; }
      h2 { font-size: 32px; margin: 24px 0 8px; }
      .course { font-size: 22px; color: #4338ca; margin: 16px 0; }
      .meta { font-size: 13px; color: #52525b; margin-top: 32px; }
      .qr { margin-top: 24px; }
      .qr img { width: 110px; height: 110px; }
      .code { font-size: 11px; color: #a1a1aa; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div class="frame">
      <h1>Inkademy — Certificado de Finalización</h1>
      <h2>{{studentName}}</h2>
      <p>ha completado satisfactoriamente el curso</p>
      <p class="course">{{courseName}}</p>
      <p class="meta">Emitido el {{issuedDate}} · Calificación final: {{finalScore}}</p>
      <div class="qr"><img src="{{qrDataUrl}}" alt="Código QR de verificación" /></div>
      <p class="code">Código de verificación: {{code}}</p>
    </div>
  </body>
</html>`,
    },
  });

  // ---------------------------------------------------------------------
  // 6. Usuarios demo
  // ---------------------------------------------------------------------
  const alumno = await prisma.user.create({
    data: {
      email: "alumno@demo.inkademy.com",
      passwordHash,
      firstName: "Camila",
      lastName: "Ramírez",
      displayName: "Camila Ramírez",
      globalRole: "STUDENT",
      emailVerifiedAt: new Date(),
      country: "PE",
      city: "Lima",
      phone: "+51999111222",
      jobTitle: "Analista de Operaciones",
      sector: "Retail",
      interests: ["gestion", "finanzas"],
      experienceLevel: "MID",
      profileCompletedAt: new Date(),
    },
  });

  const docente = await prisma.user.create({
    data: {
      email: "docente@demo.inkademy.com",
      passwordHash,
      firstName: "Jorge",
      lastName: "Salazar",
      displayName: "Jorge Salazar",
      globalRole: "TEACHER",
      emailVerifiedAt: new Date(),
      country: "PE",
      city: "Lima",
      profileCompletedAt: new Date(),
    },
  });

  const empresaAdmin = await prisma.user.create({
    data: {
      email: "empresa@demo.inkademy.com",
      passwordHash,
      firstName: "Rosa",
      lastName: "Del Campo",
      displayName: "Rosa Del Campo",
      globalRole: "STUDENT", // el rol de "company_admin" vive en CompanyMembership.role, no en GlobalRole
      emailVerifiedAt: new Date(),
      country: "PE",
      city: "Lima",
      jobTitle: "Gerente de Capacitación",
      profileCompletedAt: new Date(),
    },
  });

  const soporte = await prisma.user.create({
    data: {
      email: "soporte@demo.inkademy.com",
      passwordHash,
      firstName: "Diego",
      lastName: "Huamán",
      displayName: "Diego Huamán",
      globalRole: "SUPPORT",
      emailVerifiedAt: new Date(),
      country: "PE",
      city: "Lima",
      profileCompletedAt: new Date(),
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: "admin@demo.inkademy.com",
      passwordHash,
      firstName: "Valeria",
      lastName: "Chang",
      displayName: "Valeria Chang",
      globalRole: "ADMIN",
      emailVerifiedAt: new Date(),
      country: "PE",
      city: "Lima",
      profileCompletedAt: new Date(),
    },
  });

  const colaborador1 = await prisma.user.create({
    data: {
      email: "ana.torres@corpandina.pe",
      passwordHash,
      firstName: "Ana",
      lastName: "Torres",
      globalRole: "STUDENT",
      emailVerifiedAt: new Date(),
      country: "PE",
    },
  });

  const colaborador2 = await prisma.user.create({
    data: {
      email: "luis.mendoza@corpandina.pe",
      passwordHash,
      firstName: "Luis",
      lastName: "Mendoza",
      globalRole: "STUDENT",
      emailVerifiedAt: new Date(),
      country: "PE",
    },
  });

  // Docente asignado como profesor titular en la mayoría de los cursos.
  // "analisis-financiero-avanzado" queda deliberadamente sin CourseStaff.
  for (const courseId of [
    courseGestionProyectos.id,
    courseLiderazgo.id,
    courseFinanzasNoFinancieros.id,
    courseDataAnalytics.id,
    courseCiberseguridad.id,
    courseReclutamiento.id,
    courseComunicacion.id,
    courseSST.id,
  ]) {
    await prisma.courseStaff.create({ data: { courseId, userId: docente.id, role: "TEACHER" } });
  }

  // ---------------------------------------------------------------------
  // 7. Empresa demo + cupos + membresías
  // ---------------------------------------------------------------------
  const company = await prisma.company.create({
    data: {
      legalName: "Corporación Andina S.A.C.",
      taxIdType: "RUC",
      taxId: "20601234567",
      country: "PE",
      billingAddress: "Av. Javier Prado Este 1234, San Isidro, Lima",
      sector: "Manufactura",
      size: "MEDIUM",
      interests: ["gestion", "seguridad"],
      status: "active",
    },
  });

  await prisma.companyMembership.createMany({
    data: [
      { companyId: company.id, userId: empresaAdmin.id, role: "COMPANY_ADMIN", status: "ACTIVE", joinedAt: daysAgo(60), team: "Capacitación" },
      { companyId: company.id, userId: colaborador1.id, role: "PARTICIPANT", status: "ACTIVE", joinedAt: daysAgo(45), team: "Operaciones" },
      { companyId: company.id, userId: colaborador2.id, role: "PARTICIPANT", status: "ACTIVE", joinedAt: daysAgo(45), team: "Operaciones" },
    ],
  });

  const seatPool = await prisma.companySeatPool.create({
    data: {
      companyId: company.id,
      offeringKind: "COURSE",
      courseId: courseLiderazgo.id,
      seatsPurchased: 10,
      seatsUsed: 1,
      expiresAt: daysFromNow(180),
    },
  });

  // ---------------------------------------------------------------------
  // 8. Matrículas, progreso, intento de evaluación y certificado emitido
  // ---------------------------------------------------------------------

  // 8.1 Curso completado + certificado emitido (para que el dashboard no se vea vacío)
  const enrollmentCompletada = await prisma.enrollment.create({
    data: {
      userId: alumno.id,
      offeringKind: "COURSE",
      courseId: courseGestionProyectos.id,
      source: "B2C_PURCHASE",
      status: "COMPLETED",
      progressPct: 100,
      enrolledAt: daysAgo(40),
      completedAt: daysAgo(5),
    },
  });

  for (const module of courseGestionProyectos.modules) {
    for (const lesson of module.lessons) {
      await prisma.lessonProgress.create({
        data: {
          enrollmentId: enrollmentCompletada.id,
          lessonId: lesson.id,
          userId: alumno.id,
          completed: true,
          lastPositionSeconds: (lesson.durationMinutes ?? 12) * 60,
        },
      });
    }
  }

  const attempt = await prisma.assessmentAttempt.create({
    data: {
      assessmentId: assessmentGP.id,
      enrollmentId: enrollmentCompletada.id,
      userId: alumno.id,
      attemptNumber: 1,
      startedAt: daysAgo(6),
      submittedAt: daysAgo(6),
      score: 85,
      status: "PASSED",
    },
  });

  const [qSingle, qMulti, qTrueFalse, qShort, qOpen] = assessmentGP.questions;
  await prisma.answer.createMany({
    data: [
      { attemptId: attempt.id, questionId: qSingle.id, response: "a", isCorrect: true, score: 1 },
      { attemptId: attempt.id, questionId: qMulti.id, response: ["a", "b", "c"], isCorrect: true, score: 2 },
      { attemptId: attempt.id, questionId: qTrueFalse.id, response: "true", isCorrect: true, score: 1 },
      { attemptId: attempt.id, questionId: qShort.id, response: "Estructura de Descomposición del Trabajo", isCorrect: true, score: 1 },
    ],
  });
  await prisma.answer.create({
    data: {
      attemptId: attempt.id,
      questionId: qOpen.id,
      response: "Riesgo: rotación del equipo clave. Mitigación: documentar conocimiento crítico y mantener un plan de sucesión.",
      isCorrect: null,
      score: 2,
      gradedById: docente.id,
      gradedAt: daysAgo(5),
    },
  });

  const certificate = await prisma.certificate.create({
    data: {
      userId: alumno.id,
      courseId: courseGestionProyectos.id,
      enrollmentId: enrollmentCompletada.id,
      templateId: certificateTemplate.id,
      templateVersion: certificateTemplate.version,
      finalScore: 85,
      issuedAt: daysAgo(5),
      criteriaSnapshot: { minProgressPct: 100, actualProgressPct: 100, minScore: 70, actualScore: 85 },
      // pdfAssetId/qrUrl quedan null: los completa apps/worker (certificate.processor)
      // la primera vez que se encole el job "issue" para este enrollment.
    },
  });
  await prisma.certificate.update({
    where: { id: certificate.id },
    data: { qrUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/verificar/${certificate.code}` },
  });

  // Orden + pago asociado a esa compra, para que "/me/orders" no esté vacío.
  const order = await prisma.order.create({
    data: {
      userId: alumno.id,
      subtotal: 280,
      discount: 0,
      tax: 0,
      total: 280,
      currency: "PEN",
      status: "PAID",
      createdAt: daysAgo(40),
      items: { create: [{ offeringKind: "COURSE", courseId: courseGestionProyectos.id, unitPrice: 280, quantity: 1 }] },
      payments: {
        create: [{ provider: "CULQI", providerRef: "chr_demo_0001", status: "SUCCEEDED", amount: 280, currency: "PEN", receiptUrl: null, paidAt: daysAgo(40) }],
      },
    },
  });
  console.log(`Orden demo creada: ${order.id}`);

  // 8.2 Curso en vivo en progreso
  const enrollmentLiderazgo = await prisma.enrollment.create({
    data: {
      userId: alumno.id,
      offeringKind: "COURSE",
      courseId: courseLiderazgo.id,
      source: "B2C_PURCHASE",
      status: "ACTIVE",
      progressPct: 40,
      enrolledAt: daysAgo(10),
    },
  });
  const primerModuloLiderazgo = courseLiderazgo.modules[0];
  await prisma.lessonProgress.create({
    data: {
      enrollmentId: enrollmentLiderazgo.id,
      lessonId: primerModuloLiderazgo.lessons[0].id,
      userId: alumno.id,
      completed: true,
      lastPositionSeconds: 900,
    },
  });

  await prisma.calendarEvent.create({
    data: {
      userId: alumno.id,
      type: "LIVE_CLASS",
      title: "Clase en vivo: Liderazgo de Equipos Remotos",
      startsAt: liveSessionLiderazgo1.startsAt,
      endsAt: liveSessionLiderazgo1.endsAt,
      liveSessionId: liveSessionLiderazgo1.id,
    },
  });

  // 8.3 Diplomado recién comprado (progreso 0, para variedad en el dashboard)
  await prisma.enrollment.create({
    data: {
      userId: alumno.id,
      offeringKind: "PROGRAM",
      programId: diploma.id,
      source: "B2C_PURCHASE",
      status: "ACTIVE",
      progressPct: 0,
      enrolledAt: daysAgo(2),
    },
  });

  // 8.4 Colaborador de empresa matriculado vía cupo B2B
  await prisma.enrollment.create({
    data: {
      userId: colaborador1.id,
      offeringKind: "COURSE",
      courseId: courseLiderazgo.id,
      companyId: company.id,
      source: "B2B_SEAT",
      status: "ACTIVE",
      progressPct: 20,
      enrolledAt: daysAgo(9),
    },
  });
  console.log(`Cupo usado: ${seatPool.seatsUsed}/${seatPool.seatsPurchased} para "${courseLiderazgo.slug}"`);

  // ---------------------------------------------------------------------
  // 9. Notificación y recomendaciones de ejemplo
  // ---------------------------------------------------------------------
  await prisma.notification.create({
    data: {
      userId: alumno.id,
      channel: "EMAIL",
      template: "welcome",
      payload: { firstName: alumno.firstName },
      status: "SENT",
      sentAt: daysAgo(41),
    },
  });

  await prisma.recommendation.create({
    data: {
      userId: alumno.id,
      courseId: courseAnalisisFinanciero.id,
      reason: "completed_related",
      score: 0.85,
    },
  });
  await prisma.recommendation.create({
    data: {
      userId: alumno.id,
      courseId: courseDataAnalytics.id,
      reason: "interest_match",
      score: 0.6,
    },
  });

  // ---------------------------------------------------------------------
  // 10. Configuración de país (Perú)
  // ---------------------------------------------------------------------
  await prisma.countryConfig.create({
    data: {
      country: "PE",
      documentTypes: [
        { code: "DNI", label: { es: "DNI", en: "National ID" }, length: 8 },
        { code: "CE", label: { es: "Carné de Extranjería", en: "Foreigner ID card" }, length: 9 },
        { code: "PASSPORT", label: { es: "Pasaporte", en: "Passport" }, length: null },
      ],
      currency: "PEN",
      phonePrefix: "+51",
      taxIdLabel: "RUC",
    },
  });

  console.log("Seed completado.");
  console.log("Usuarios demo (password para todos: Demo1234!):");
  console.log("  - alumno@demo.inkademy.com     (STUDENT)");
  console.log("  - docente@demo.inkademy.com    (TEACHER)");
  console.log("  - empresa@demo.inkademy.com    (STUDENT, COMPANY_ADMIN de Corporación Andina S.A.C.)");
  console.log("  - soporte@demo.inkademy.com    (SUPPORT)");
  console.log("  - admin@demo.inkademy.com      (ADMIN)");
}

main()
  .catch((err) => {
    console.error("Fallo el seed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

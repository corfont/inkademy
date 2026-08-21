/**
 * Mock manual y mínimo de PrismaClient para tests unitarios/e2e ligeros que
 * NO requieren una base de datos real. Cada test sobreescribe los métodos
 * que necesita con `jest.fn().mockResolvedValue(...)`.
 *
 * Para e2e contra una BD real, exportar DATABASE_URL_TEST y reemplazar este
 * mock por el cliente real (ver README.md de apps/api).
 */
export function createMockPrisma() {
  const model = () => ({
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _sum: {}, _count: 0 }),
  });

  return {
    user: model(),
    oAuthAccount: model(),
    company: model(),
    companyMembership: model(),
    area: model(),
    subarea: model(),
    course: model(),
    courseStaff: model(),
    courseModule: model(),
    lesson: model(),
    material: model(),
    liveSession: model(),
    program: model(),
    programCourse: model(),
    enrollment: model(),
    lessonProgress: model(),
    attendance: model(),
    questionBank: model(),
    question: model(),
    assessment: model(),
    assessmentAttempt: model(),
    answer: model(),
    approvalRule: model(),
    certificateTemplate: model(),
    certificate: model(),
    order: model(),
    orderItem: model(),
    payment: model(),
    companySeatPool: model(),
    quote: model(),
    calendarEvent: model(),
    notification: model(),
    supportTicket: model(),
    supportMessage: model(),
    recommendation: model(),
    auditLog: model(),
    countryConfig: model(),
    $disconnect: jest.fn(),
    $connect: jest.fn(),
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;

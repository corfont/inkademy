process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import request from "supertest";
import { AuthModule } from "../src/modules/auth/auth.module";
import { AssessmentModule } from "../src/modules/assessment/assessment.module";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { PrismaModule, PRISMA } from "../src/common/prisma/prisma.module";
import { QueuesModule } from "../src/common/queues/queues.module";
import { createMockPrisma, type MockPrisma } from "./utils/mock-prisma";
import { allMockQueueOverrides } from "./utils/mock-queue";

const FAKE_USER = {
  id: "u1",
  email: "student@inkademy.com",
  firstName: "Ana",
  lastName: "Pérez",
  globalRole: "STUDENT",
  status: "active",
};

const QUESTION = {
  id: "22222222-2222-4222-8222-222222222222",
  type: "SINGLE_CHOICE",
  text: { es: "¿2 + 2?" },
  options: [
    { id: "a", text: "3" },
    { id: "b", text: "4" },
  ],
  correctAnswer: "b",
  points: 1,
};

const ASSESSMENT = {
  id: "a1",
  courseId: "course1",
  title: { es: "Quiz módulo 1" },
  type: "quiz",
  minScore: 70,
  maxAttempts: 3,
  timeLimitMinutes: null,
  questionOrder: "FIXED",
  randomizeOptions: false,
  questionsPerAttempt: null,
  availableFrom: null,
  availableUntil: null,
  questions: [QUESTION],
};

describe("Assessment (e2e)", () => {
  let app: INestApplication;
  let prisma: MockPrisma;
  let accessToken: string;

  beforeAll(async () => {
    prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(FAKE_USER as never);
    prisma.user.findUniqueOrThrow.mockResolvedValue(FAKE_USER as never);

    const builder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET }),
        PrismaModule,
        QueuesModule,
        AuthModule,
        AssessmentModule,
      ],
      providers: [JwtAuthGuard],
    }).overrideProvider(PRISMA).useValue(prisma);

    for (const [token, mockQueue] of allMockQueueOverrides()) {
      builder.overrideProvider(token).useValue(mockQueue);
    }

    const moduleRef = await builder.compile();

    app = moduleRef.createNestApplication();
    app.useGlobalGuards(app.get(JwtAuthGuard));
    await app.init();

    const jwtService = moduleRef.get(JwtService);
    accessToken = jwtService.sign(
      { sub: FAKE_USER.id, email: FAKE_USER.email, globalRole: FAKE_USER.globalRole, typ: "access" },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /assessments/:id sin token responde 401", async () => {
    await request(app.getHttpServer()).get("/assessments/a1").expect(401);
  });

  it("GET /assessments/:id no expone correctAnswer", async () => {
    prisma.assessment.findUnique.mockResolvedValueOnce(ASSESSMENT as never);

    const res = await request(app.getHttpServer())
      .get("/assessments/a1")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0].correctAnswer).toBeUndefined();
    expect(res.body.questions[0].options).toEqual(QUESTION.options);
  });

  it("POST /assessments/:id/attempts crea un intento si hay matrícula y cupo", async () => {
    prisma.assessment.findUnique.mockResolvedValueOnce(ASSESSMENT as never);
    prisma.enrollment.findFirst.mockResolvedValueOnce({ id: "enr1", userId: "u1", courseId: "course1" } as never);
    prisma.assessmentAttempt.count.mockResolvedValueOnce(0);
    prisma.assessmentAttempt.create.mockResolvedValueOnce({
      id: "att1",
      assessmentId: "a1",
      enrollmentId: "enr1",
      userId: "u1",
      attemptNumber: 1,
      status: "IN_PROGRESS",
    } as never);

    const res = await request(app.getHttpServer())
      .post("/assessments/a1/attempts")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(201);

    expect(res.body.id).toBe("att1");
    expect(res.body.status).toBe("IN_PROGRESS");
  });

  it("POST /attempts/:id/submit autocorrige una pregunta objetiva y aprueba", async () => {
    prisma.assessmentAttempt.findUnique.mockResolvedValueOnce({
      id: "att1",
      userId: "u1",
      status: "IN_PROGRESS",
      enrollmentId: "enr1",
      assessment: ASSESSMENT,
    } as never);
    prisma.question.findMany.mockResolvedValueOnce([QUESTION] as never);
    prisma.answer.upsert.mockResolvedValueOnce({} as never);
    prisma.answer.findMany.mockResolvedValueOnce([{ id: "ans1", isCorrect: true, score: 1 }] as never);
    prisma.assessmentAttempt.update.mockResolvedValueOnce({
      id: "att1",
      score: 100,
      status: "PASSED",
    } as never);
    // checkAndIssueIfEligible internals:
    prisma.enrollment.findUnique.mockResolvedValueOnce(null as never);

    const res = await request(app.getHttpServer())
      .post("/attempts/att1/submit")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ answers: [{ questionId: "22222222-2222-4222-8222-222222222222", response: "b" }] })
      .expect(201);

    expect(res.body.status).toBe("PASSED");
    expect(res.body.score).toBe(100);
    expect(res.body.pendingReviewCount).toBe(0);
  });
});

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "30d";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { getQueueToken } from "@nestjs/bullmq";
import * as cookieParser from "cookie-parser";
import * as request from "supertest";
import { AuthModule } from "../src/modules/auth/auth.module";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { PRISMA } from "../src/common/prisma/prisma.module";
import { QUEUE_NAMES } from "../src/common/queues/queue.constants";
import { createMockPrisma, type MockPrisma } from "./utils/mock-prisma";
import { createMockQueue } from "./utils/mock-queue";

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: MockPrisma;

  beforeAll(async () => {
    prisma = createMockPrisma();

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
      providers: [JwtAuthGuard],
    })
      .overrideProvider(PRISMA)
      .useValue(prisma)
      .overrideProvider(getQueueToken(QUEUE_NAMES.EMAIL))
      .useValue(createMockQueue())
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalGuards(app.get(JwtAuthGuard));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /auth/register crea un usuario y devuelve accessToken", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null); // no existe aún
    prisma.user.create.mockResolvedValueOnce({
      id: "u1",
      email: "nuevo@inkademy.com",
      firstName: "Ana",
      lastName: "Pérez",
      displayName: null,
      globalRole: "STUDENT",
      locale: "es",
      timezone: "America/Lima",
      profileCompletedAt: null,
      status: "active",
    });
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: "u1",
      email: "nuevo@inkademy.com",
    });

    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email: "nuevo@inkademy.com", password: "password123", firstName: "Ana", lastName: "Pérez" })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe("nuevo@inkademy.com");
  });

  it("POST /auth/register rechaza un email ya registrado", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", email: "existe@inkademy.com" });

    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email: "existe@inkademy.com", password: "password123", firstName: "Ana", lastName: "Pérez" })
      .expect(409);
  });

  it("GET /auth/me sin token responde 401", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);
  });
});

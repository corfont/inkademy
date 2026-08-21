process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { getQueueToken } from "@nestjs/bullmq";
import * as request from "supertest";
import { AuthModule } from "../src/modules/auth/auth.module";
import { CommerceModule } from "../src/modules/commerce/commerce.module";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { PRISMA } from "../src/common/prisma/prisma.module";
import { QUEUE_NAMES } from "../src/common/queues/queue.constants";
import { createMockPrisma, type MockPrisma } from "./utils/mock-prisma";
import { createMockQueue } from "./utils/mock-queue";

const FAKE_USER = {
  id: "u1",
  email: "student@inkademy.com",
  firstName: "Ana",
  lastName: "Pérez",
  globalRole: "STUDENT",
  status: "active",
};

const FAKE_COURSE = {
  id: "course1",
  slug: "liderazgo-remoto",
  title: { es: "Liderazgo remoto" },
  status: "PUBLISHED",
  priceAmount: 100,
  priceCurrency: "PEN",
  b2bAvailable: false,
  b2bPriceAmount: null,
  accessDurationPolicy: "PERMANENT",
  certificationIncluded: true,
};

describe("Checkout (e2e)", () => {
  let app: INestApplication;
  let prisma: MockPrisma;
  let accessToken: string;

  beforeAll(async () => {
    prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(FAKE_USER as never);
    prisma.user.findUniqueOrThrow.mockResolvedValue(FAKE_USER as never);
    prisma.course.findUnique.mockResolvedValue(FAKE_COURSE as never);
    prisma.liveSession.findMany.mockResolvedValue([]);
    prisma.calendarEvent.create.mockResolvedValue({} as never);
    prisma.notification.create.mockResolvedValue({} as never);
    prisma.order.create.mockResolvedValue({ id: "order1", items: [] } as never);
    prisma.payment.create.mockResolvedValue({ id: "pay1" } as never);
    prisma.order.update.mockResolvedValue({} as never);
    prisma.enrollment.create.mockResolvedValue({ id: "enr1" } as never);
    prisma.enrollment.update.mockResolvedValue({} as never);
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: "order1",
      status: "PENDING",
      companyId: null,
      userId: "u1",
      createdAt: new Date(),
      total: 100,
      currency: "PEN",
      items: [
        { id: "oi1", offeringKind: "COURSE", courseId: "course1", programId: null, seatPoolQty: null, unitPrice: 100, quantity: 1 },
      ],
      payments: [{ status: "SUCCEEDED", receiptUrl: null }],
      user: FAKE_USER,
    } as never);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET }),
        AuthModule,
        CommerceModule,
      ],
      providers: [JwtAuthGuard],
    })
      .overrideProvider(PRISMA)
      .useValue(prisma)
      .overrideProvider(getQueueToken(QUEUE_NAMES.EMAIL))
      .useValue(createMockQueue())
      .compile();

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

  it("POST /checkout sin Bearer token responde 401", async () => {
    await request(app.getHttpServer()).post("/checkout").send({}).expect(401);
  });

  it("POST /checkout con body inválido responde 400", async () => {
    await request(app.getHttpServer())
      .post("/checkout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ items: [] })
      .expect(400);
  });

  it("POST /checkout compra un curso y matricula al alumno (Culqi simulado en dev)", async () => {
    const res = await request(app.getHttpServer())
      .post("/checkout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        items: [{ offeringKind: "COURSE", courseId: FAKE_COURSE.id }],
        currency: "PEN",
        paymentProvider: "CULQI",
        paymentMethodToken: "tkn_test_123",
      })
      .expect(201);

    expect(res.body.status).toBe("PAID");
    expect(res.body.enrollmentIds).toEqual(["enr1"]);
    expect(prisma.enrollment.create).toHaveBeenCalled();
  });
});

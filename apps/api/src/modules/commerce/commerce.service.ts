import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { AccessDurationPolicy, PrismaClient } from "@inkademy/db";
import type { CheckoutInput, CheckoutResult } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { decimalToString } from "../../common/utils/money";
import { NotificationService } from "../notification/notification.service";
import { CalendarService } from "../calendar/calendar.service";
import { CulqiProvider } from "./providers/culqi.provider";
import { StripeProvider } from "./providers/stripe.provider";
import type { PaymentProvider } from "./providers/payment-provider.interface";

function computeAccessExpiresAt(policy: AccessDurationPolicy, from: Date): Date | null {
  const date = new Date(from);
  if (policy === "DAYS_30") {
    date.setDate(date.getDate() + 30);
    return date;
  }
  if (policy === "MONTHS_6") {
    date.setMonth(date.getMonth() + 6);
    return date;
  }
  return null; // PERMANENT
}

@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly calendarService: CalendarService,
    private readonly culqiProvider: CulqiProvider,
    private readonly stripeProvider: StripeProvider,
  ) {}

  private resolveProvider(type: CheckoutInput["paymentProvider"]): PaymentProvider {
    if (type === "CULQI") return this.culqiProvider;
    if (type === "STRIPE") return this.stripeProvider;
    throw new BadRequestException("Proveedor de pago no soportado: " + type);
  }

  async checkout(userId: string, input: CheckoutInput): Promise<CheckoutResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (input.companyId) {
      const membership = await this.prisma.companyMembership.findUnique({
        where: { companyId_userId: { companyId: input.companyId, userId } },
      });
      if (!membership || membership.status !== "ACTIVE" || membership.role !== "COMPANY_ADMIN") {
        throw new ForbiddenException("Solo un COMPANY_ADMIN puede comprar a nombre de la empresa");
      }
    }

    type ResolvedItem = {
      offeringKind: "COURSE" | "PROGRAM";
      courseId?: string;
      programId?: string;
      seatPoolQty?: number;
      unitPrice: number;
      quantity: number;
      accessDurationPolicy?: AccessDurationPolicy;
      title: unknown;
    };
    const resolved: ResolvedItem[] = [];

    for (const item of input.items) {
      if (item.offeringKind === "COURSE") {
        if (!item.courseId) throw new BadRequestException("courseId requerido para items de tipo COURSE");
        const course = await this.prisma.course.findUnique({ where: { id: item.courseId } });
        if (!course || course.status !== "PUBLISHED") {
          throw new NotFoundException(`Curso ${item.courseId} no disponible`);
        }
        const usesB2bPrice = Boolean(input.companyId) && course.b2bAvailable && course.b2bPriceAmount;
        resolved.push({
          offeringKind: "COURSE",
          courseId: course.id,
          seatPoolQty: item.seatPoolQty,
          unitPrice: Number(usesB2bPrice ? course.b2bPriceAmount : course.priceAmount),
          quantity: item.seatPoolQty ?? 1,
          accessDurationPolicy: course.accessDurationPolicy,
          title: course.title,
        });
      } else {
        if (!item.programId) throw new BadRequestException("programId requerido para items de tipo PROGRAM");
        const program = await this.prisma.program.findUnique({ where: { id: item.programId } });
        if (!program || program.status !== "PUBLISHED") {
          throw new NotFoundException(`Programa ${item.programId} no disponible`);
        }
        resolved.push({
          offeringKind: "PROGRAM",
          programId: program.id,
          seatPoolQty: item.seatPoolQty,
          unitPrice: Number(program.priceAmount),
          quantity: item.seatPoolQty ?? 1,
          title: program.title,
        });
      }
    }

    const subtotal = resolved.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const total = subtotal; // sin descuentos/impuestos por ahora (ver IMPLEMENTATION-NOTES.md)

    const order = await this.prisma.order.create({
      data: {
        userId,
        companyId: input.companyId,
        subtotal,
        discount: 0,
        tax: 0,
        total,
        currency: input.currency,
        status: "PENDING",
        items: {
          create: resolved.map((i) => ({
            offeringKind: i.offeringKind,
            courseId: i.courseId,
            programId: i.programId,
            seatPoolQty: i.seatPoolQty,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
          })),
        },
      },
      include: { items: true },
    });

    const provider = this.resolveProvider(input.paymentProvider);
    const chargeResult = await provider.charge({
      amountInMinorUnits: Math.round(total * 100),
      currency: input.currency,
      token: input.paymentMethodToken,
      description: `Inkademy — Orden ${order.id}`,
      email: user.email,
    });

    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: input.paymentProvider,
        providerRef: chargeResult.providerRef,
        status: chargeResult.success ? "SUCCEEDED" : "FAILED",
        amount: total,
        currency: input.currency,
        receiptUrl: chargeResult.receiptUrl,
        paidAt: chargeResult.success ? new Date() : null,
      },
    });

    if (!chargeResult.success) {
      await this.prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
      return { orderId: order.id, status: "FAILED", enrollmentIds: [], receiptUrl: null };
    }

    const { enrollmentIds, receiptUrl } = await this.finalizeOrderPaid(order.id);
    return { orderId: order.id, status: "PAID", enrollmentIds, receiptUrl: receiptUrl ?? null };
  }

  /**
   * Idempotente: marca la orden como PAID (si no lo estaba), crea las
   * matrículas o incrementa los seat pools B2B correspondientes, encola el
   * comprobante por correo y recalcula la agenda del alumno.
   */
  private async finalizeOrderPaid(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, payments: true, user: true },
    });

    if (order.status === "PAID") {
      // ya procesada (idempotencia ante reintentos de webhook)
      const existingEnrollments = await this.prisma.enrollment.findMany({
        where: { userId: order.userId, enrolledAt: { gte: order.createdAt } },
      });
      return {
        enrollmentIds: existingEnrollments.map((e) => e.id),
        receiptUrl: order.payments[0]?.receiptUrl,
      };
    }

    await this.prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });

    const enrollmentIds: string[] = [];
    for (const item of order.items) {
      if (item.seatPoolQty && item.seatPoolQty > 0) {
        // Compra B2B de cupos: no matricula directamente, alimenta el seat pool.
        const existingPool = await this.prisma.companySeatPool.findFirst({
          where: {
            companyId: order.companyId!,
            offeringKind: item.offeringKind,
            courseId: item.courseId,
            programId: item.programId,
          },
        });
        if (existingPool) {
          await this.prisma.companySeatPool.update({
            where: { id: existingPool.id },
            data: { seatsPurchased: existingPool.seatsPurchased + item.seatPoolQty },
          });
        } else {
          await this.prisma.companySeatPool.create({
            data: {
              companyId: order.companyId!,
              offeringKind: item.offeringKind,
              courseId: item.courseId,
              programId: item.programId,
              seatsPurchased: item.seatPoolQty,
            },
          });
        }
        continue;
      }

      const enrollment = await this.prisma.enrollment.create({
        data: {
          userId: order.userId,
          offeringKind: item.offeringKind,
          courseId: item.courseId,
          programId: item.programId,
          companyId: order.companyId,
          source: order.companyId ? "B2B_SEAT" : "B2C_PURCHASE",
        },
      });
      enrollmentIds.push(enrollment.id);

      if (item.offeringKind === "COURSE" && item.courseId) {
        const course = await this.prisma.course.findUnique({ where: { id: item.courseId } });
        if (course) {
          const accessExpiresAt = computeAccessExpiresAt(course.accessDurationPolicy, new Date());
          if (accessExpiresAt) {
            await this.prisma.enrollment.update({ where: { id: enrollment.id }, data: { accessExpiresAt } });
          }
          await this.calendarService.scheduleForEnrollment(order.userId, course, accessExpiresAt);
        }
      }
    }

    const receiptUrl = order.payments.find((p) => p.status === "SUCCEEDED")?.receiptUrl ?? undefined;
    await this.notifications.sendReceipt(
      order.user.email,
      order.id,
      decimalToString(order.total),
      order.currency,
      order.userId,
    );

    return { enrollmentIds, receiptUrl };
  }

  async getOrderById(userId: string, orderId: string, isAdmin: boolean) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true },
    });
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (!isAdmin && order.userId !== userId) {
      throw new ForbiddenException("No puedes ver la orden de otro usuario");
    }
    return {
      id: order.id,
      status: order.status,
      subtotal: decimalToString(order.subtotal),
      discount: decimalToString(order.discount),
      tax: decimalToString(order.tax),
      total: decimalToString(order.total),
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((i) => ({
        offeringKind: i.offeringKind,
        courseId: i.courseId,
        programId: i.programId,
        seatPoolQty: i.seatPoolQty,
        unitPrice: decimalToString(i.unitPrice),
        quantity: i.quantity,
      })),
      payments: order.payments.map((p) => ({
        provider: p.provider,
        status: p.status,
        receiptUrl: p.receiptUrl,
        paidAt: p.paidAt?.toISOString() ?? null,
      })),
    };
  }

  async listMine(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: { payments: true },
      orderBy: { createdAt: "desc" },
    });
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      total: decimalToString(o.total),
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
      receiptUrl: o.payments.find((p) => p.status === "SUCCEEDED")?.receiptUrl ?? null,
    }));
  }

  // --- Webhooks ---

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripeProvider.verifyWebhookSignature(rawBody, signature);
    if (!event) throw new BadRequestException("Firma de webhook inválida");

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as { id: string };
      const payment = await this.prisma.payment.findFirst({ where: { providerRef: intent.id } });
      if (payment && payment.status !== "SUCCEEDED") {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: "SUCCEEDED", paidAt: new Date() },
        });
        await this.finalizeOrderPaid(payment.orderId);
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as { id: string };
      const payment = await this.prisma.payment.findFirst({ where: { providerRef: intent.id } });
      if (payment) {
        await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
        await this.prisma.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });
      }
    } else {
      this.logger.log(`Evento de Stripe no manejado: ${event.type}`);
    }
    return { received: true };
  }

  /**
   * Culqi no publica un esquema de verificación de firma tan estandarizado
   * como Stripe; se documenta como simplificación en IMPLEMENTATION-NOTES.md.
   * Se asume el payload `{ id: string, type: string, object?: string }` que
   * Culqi envía en sus eventos de "charge".
   */
  async handleCulqiWebhook(payload: { id?: string; type?: string; data?: { id?: string } }) {
    const chargeId = payload.data?.id ?? payload.id;
    if (!chargeId) throw new BadRequestException("Payload de webhook de Culqi inválido");

    const payment = await this.prisma.payment.findFirst({ where: { providerRef: chargeId } });
    if (!payment) {
      this.logger.warn(`Webhook de Culqi para un charge desconocido: ${chargeId}`);
      return { received: true };
    }

    const isSuccess = !payload.type || payload.type.includes("succeeded") || payload.type.includes("creation");
    if (isSuccess && payment.status !== "SUCCEEDED") {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: "SUCCEEDED", paidAt: new Date() },
      });
      await this.finalizeOrderPaid(payment.orderId);
    } else if (!isSuccess) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      await this.prisma.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });
    }
    return { received: true };
  }
}

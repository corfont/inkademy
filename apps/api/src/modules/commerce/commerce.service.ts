import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { AccessDurationPolicy, ElectronicDocumentType, ElectronicNoteType, Prisma, PrismaClient } from "@inkademy/db";
import type { CancelOrderInput, CheckoutInput, CheckoutResult } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { decimalToString } from "../../common/utils/money";
import { INVOICE_JOBS, QUEUE_NAMES } from "../../common/queues/queue.constants";
import { NotificationService } from "../notification/notification.service";
import { CalendarService } from "../calendar/calendar.service";
import { CulqiProvider } from "./providers/culqi.provider";
import { StripeProvider } from "./providers/stripe.provider";
import { PayPalProvider } from "./providers/paypal.provider";
import type { PaymentProvider } from "./providers/payment-provider.interface";

/** Datos de comprador ya resueltos para la boleta/factura electrónica. */
interface ResolvedBuyerInfo {
  buyerDocumentType: string;
  buyerDocumentNumber: string;
  buyerLegalName: string;
  buyerCountry: string;
}

/** Ver grantFreeAccessSchema en apps/api/src/common/validation/local-schemas.ts. */
interface GrantFreeAccessInput {
  offeringKind: "COURSE" | "PROGRAM";
  courseSlug?: string;
  programSlug?: string;
  userEmail?: string;
  companyId?: string;
  seatPoolQty?: number;
  note: string;
}

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
    private readonly paypalProvider: PayPalProvider,
    @InjectQueue(QUEUE_NAMES.INVOICE) private readonly invoiceQueue: Queue,
  ) {}

  private resolveProvider(type: CheckoutInput["paymentProvider"]): PaymentProvider {
    if (type === "CULQI") return this.culqiProvider;
    if (type === "STRIPE") return this.stripeProvider;
    if (type === "PAYPAL") return this.paypalProvider;
    throw new BadRequestException("Proveedor de pago no soportado: " + type);
  }

  /**
   * Resuelve los datos del comprador para la boleta/factura electrónica.
   * Prioridad: (1) compra a nombre de empresa → factura con el RUC de la
   * empresa; (2) datos de comprador enviados explícitamente en el checkout
   * (persona natural que quiere su boleta con su propio documento); (3)
   * boleta genérica a "Cliente varios" con DNI 00000000 (uso habitual en
   * Perú para ventas al público sin identificar al comprador).
   */
  private async resolveBuyerInfo(input: CheckoutInput): Promise<ResolvedBuyerInfo> {
    if (input.companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: input.companyId } });
      if (company) {
        return {
          buyerDocumentType: "6", // RUC
          buyerDocumentNumber: company.taxId,
          buyerLegalName: company.legalName,
          buyerCountry: company.country,
        };
      }
    }
    if (input.buyerDocumentType && input.buyerDocumentNumber && input.buyerLegalName) {
      return {
        buyerDocumentType: input.buyerDocumentType,
        buyerDocumentNumber: input.buyerDocumentNumber,
        buyerLegalName: input.buyerLegalName,
        buyerCountry: input.buyerCountry ?? "PE",
      };
    }
    return {
      buyerDocumentType: "1", // DNI
      buyerDocumentNumber: "00000000",
      buyerLegalName: "Cliente varios",
      buyerCountry: "PE",
    };
  }

  /**
   * Resuelve items del carrito a precios reales (con descuento vigente
   * aplicado si corresponde) — extraído de `checkout()` para reutilizarlo
   * en `createPayPalOrder()`: a diferencia de Culqi/Stripe (donde el monto
   * se fija y se cobra en la MISMA llamada), el flujo de PayPal necesita
   * crear la orden con el monto ANTES de que el comprador la apruebe, en
   * un paso separado — pero el precio tiene que salir de la misma fuente
   * de verdad (nunca confiar en un monto que mande el cliente).
   */
  private async resolveCheckoutItems(items: CheckoutInput["items"], companyId?: string) {
    type ResolvedItem = {
      offeringKind: "COURSE" | "PROGRAM";
      courseId?: string;
      programId?: string;
      seatPoolQty?: number;
      // Precio de lista (sin descuento) — solo para calcular Order.discount,
      // nunca se guarda tal cual en OrderItem.
      listUnitPrice: number;
      // Lo que realmente se cobra (ya con el % de descuento vigente aplicado,
      // si lo hay) — "si el curso tiene descuento figurará en el balance por
      // lo que efectivamente ha pagado el cliente". Antes esto SIEMPRE
      // cobraba el precio de lista, ignorando el descuento que el catálogo
      // ya mostraba — bug real encontrado al implementar esto.
      unitPrice: number;
      quantity: number;
      accessDurationPolicy?: AccessDurationPolicy;
      title: unknown;
    };
    const resolved: ResolvedItem[] = [];

    for (const item of items) {
      if (item.offeringKind === "COURSE") {
        if (!item.courseId) throw new BadRequestException("courseId requerido para items de tipo COURSE");
        const course = await this.prisma.course.findUnique({ where: { id: item.courseId } });
        if (!course || course.status !== "PUBLISHED") {
          throw new NotFoundException(`Curso ${item.courseId} no disponible`);
        }
        const usesB2bPrice = Boolean(companyId) && course.b2bAvailable && course.b2bPriceAmount;
        const listUnitPrice = Number(usesB2bPrice ? course.b2bPriceAmount : course.priceAmount);
        // El descuento solo aplica a la venta B2C pública — un precio B2B ya
        // es una tarifa negociada aparte, no se le suma otro descuento encima.
        const isOnSale =
          !usesB2bPrice &&
          Boolean(course.discountPercent) &&
          course.discountPercent! > 0 &&
          (!course.discountExpiresAt || course.discountExpiresAt.getTime() > Date.now());
        const unitPrice = isOnSale ? Math.round(listUnitPrice * (1 - course.discountPercent! / 100) * 100) / 100 : listUnitPrice;
        resolved.push({
          offeringKind: "COURSE",
          courseId: course.id,
          seatPoolQty: item.seatPoolQty,
          listUnitPrice,
          unitPrice,
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
          listUnitPrice: Number(program.priceAmount),
          unitPrice: Number(program.priceAmount),
          quantity: item.seatPoolQty ?? 1,
          title: program.title,
        });
      }
    }

    const subtotal = resolved.reduce((sum, i) => sum + i.listUnitPrice * i.quantity, 0);
    const total = resolved.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const discount = Math.round((subtotal - total) * 100) / 100; // sin impuestos por ahora (ver IMPLEMENTATION-NOTES.md)
    return { resolved, subtotal, total, discount };
  }

  /**
   * Crea la orden de PayPal (paso previo obligatorio: PayPal necesita que el
   * comprador APRUEBE un monto ya fijado antes de poder capturarlo). El
   * frontend usa el `orderId` devuelto para renderizar el botón de PayPal;
   * al aprobar, se llama a POST /checkout con `paymentProvider: "PAYPAL"` y
   * `paymentMethodToken: orderId` — PayPalProvider.charge() solo CAPTURA
   * esa orden ya aprobada, nunca crea una nueva ni confía en un monto que
   * mande el cliente en ese segundo paso.
   */
  async createPayPalOrder(input: { items: CheckoutInput["items"]; companyId?: string }): Promise<{ orderId: string; amount: number; currency: string }> {
    const { total } = await this.resolveCheckoutItems(input.items, input.companyId);
    if (total <= 0) throw new BadRequestException("El monto a cobrar debe ser mayor a cero");
    const orderId = await this.paypalProvider.createOrder({ amountInMinorUnits: Math.round(total * 100), currency: "USD" });
    return { orderId, amount: total, currency: "USD" };
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

    const { resolved, subtotal, total, discount } = await this.resolveCheckoutItems(input.items, input.companyId);
    const buyerInfo = await this.resolveBuyerInfo(input);

    const order = await this.prisma.order.create({
      data: {
        userId,
        companyId: input.companyId,
        subtotal,
        discount,
        tax: 0,
        total,
        currency: input.currency,
        status: "PENDING",
        ...buyerInfo,
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
        paymentMethod: chargeResult.paymentMethod ?? null,
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

    // "Dos webhooks concurrentes del mismo pago (Stripe/Culqi reintentan
    // esto de rutina) podían leer status !== PAID los dos, y los dos
    // ejecutar el bloque de matrícula/seat-pool — doble matrícula por un
    // solo pago" — hallazgo de auditoría. El `updateMany` con guard en el
    // `where` es la operación atómica: solo UNA llamada concurrente puede
    // ganar la carrera (la que de verdad actualiza la fila), sin necesidad
    // de un $transaction para todo el método completo.
    const claimed = await this.prisma.order.updateMany({
      where: { id: order.id, status: { not: "PAID" } },
      data: { status: "PAID" },
    });
    if (claimed.count === 0) {
      // Ya estaba PAID — esta misma llamada reintentada, o una concurrente
      // que ganó la carrera. Mismo camino idempotente que antes.
      const existingEnrollments = await this.prisma.enrollment.findMany({
        where: { userId: order.userId, enrolledAt: { gte: order.createdAt } },
      });
      return {
        enrollmentIds: existingEnrollments.map((e) => e.id),
        receiptUrl: order.payments[0]?.receiptUrl,
      };
    }

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

    // "Podría pasar que la institución nos diga que los que van a facturar
    // son ellos y ellos nos transfieren después" — si algún curso de la
    // orden tiene un convenio activo con invoicesDirectly=true vigente en
    // esta fecha, Inkapitales no emite su propio comprobante SUNAT para
    // esta orden (la institución socia factura al cliente final por su cuenta).
    if (await this.hasDirectInvoicingPartnership(order.items)) {
      this.logger.log(`Orden ${order.id}: la institución del convenio factura directamente — Inkapitales no emite comprobante.`);
    } else {
      await this.createElectronicInvoiceIfNeeded(order);
    }

    return { enrollmentIds, receiptUrl };
  }

  private async hasDirectInvoicingPartnership(items: { courseId: string | null }[]): Promise<boolean> {
    const courseIds = items.map((i) => i.courseId).filter((id): id is string => Boolean(id));
    if (courseIds.length === 0) return false;
    const now = new Date();
    const partnership = await this.prisma.coursePartnership.findFirst({
      where: {
        courseId: { in: courseIds },
        partnerInstitution: { active: true, invoicesDirectly: true },
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
    });
    return Boolean(partnership);
  }

  /**
   * Emite boleta/factura electrónica (SUNAT) por la orden, sin importar si
   * quedó PAID por el cargo síncrono de checkout() o por un webhook async —
   * finalizeOrderPaid() es el único punto de paso, tal como pidió el
   * cliente ("se debe emitir automáticamente sin importar el medio").
   * Se omite por completo si el monto es 0 (curso gratuito o 100% cupón):
   * en Perú no corresponde emitir ningún comprobante por una venta a S/0.
   * Nunca lanza — un fallo al facturar no debe tumbar la confirmación de
   * matrícula, que ya ocurrió; queda como log de advertencia y la orden
   * simplemente no tiene electronicInvoice (se puede reintentar a mano).
   */
  /**
   * Lee la serie configurada en /admin/facturacion (fila SunatSettings) con
   * fallback a la variable de entorno correspondiente y luego al default —
   * mismo criterio de prioridad que apps/worker/src/lib/sunat/config.ts.
   */
  private async resolveSunatSeries(
    field: "boletaSeries" | "facturaSeries" | "boletaCreditSeries" | "facturaCreditSeries",
    fallbackDefault: string,
  ): Promise<string> {
    const settings = await this.prisma.sunatSettings.findUnique({ where: { id: "default" } });
    const envKey =
      field === "boletaSeries"
        ? "SUNAT_BOLETA_SERIES"
        : field === "facturaSeries"
          ? "SUNAT_FACTURA_SERIES"
          : field === "boletaCreditSeries"
            ? "SUNAT_BOLETA_CREDIT_SERIES"
            : "SUNAT_FACTURA_CREDIT_SERIES";
    return settings?.[field] ?? process.env[envKey] ?? fallbackDefault;
  }

  private async createElectronicInvoiceIfNeeded(order: {
    id: string;
    total: Prisma.Decimal;
    currency: string;
    buyerDocumentType: string | null;
    buyerDocumentNumber: string | null;
    buyerLegalName: string | null;
    buyerCountry: string | null;
  }): Promise<void> {
    try {
      if (Number(order.total) <= 0) {
        this.logger.log(`Orden ${order.id} es S/0 (curso gratuito) — no se emite comprobante`);
        return;
      }

      const documentType: ElectronicDocumentType = order.buyerDocumentType === "6" ? "FACTURA" : "BOLETA";
      const series = await this.resolveSunatSeries(documentType === "FACTURA" ? "facturaSeries" : "boletaSeries", documentType === "FACTURA" ? "F001" : "B001");

      // Correlativo secuencial por (documentType, series). No es 100% a
      // prueba de condiciones de carrera bajo alta concurrencia (haría
      // falta una secuencia dedicada a nivel de BD); para el volumen de
      // este proyecto, con el unique([documentType, series, correlativo])
      // como respaldo, es suficiente — ver IMPLEMENTATION-NOTES.md.
      const last = await this.prisma.electronicInvoice.findFirst({
        where: { documentType, series },
        orderBy: { correlativo: "desc" },
      });
      const correlativo = (last?.correlativo ?? 0) + 1;

      const invoice = await this.prisma.electronicInvoice.create({
        data: {
          orderId: order.id,
          documentType,
          series,
          correlativo,
          buyerDocumentType: order.buyerDocumentType ?? "1",
          buyerDocumentNumber: order.buyerDocumentNumber ?? "00000000",
          buyerLegalName: order.buyerLegalName ?? "Cliente varios",
          buyerCountry: order.buyerCountry ?? "PE",
          currency: order.currency,
          totalAmount: order.total,
          status: "PENDING",
        },
      });

      await this.invoiceQueue.add(
        INVOICE_JOBS.GENERATE,
        { invoiceId: invoice.id },
        { attempts: 3, backoff: { type: "exponential", delay: 15000 }, removeOnComplete: true },
      );
    } catch (err) {
      this.logger.warn(`No se pudo iniciar la emisión de comprobante para la orden ${order.id}: ${String(err)}`);
    }
  }

  /**
   * Cancela una orden pagada: reembolsa el cobro original vía el mismo
   * proveedor con el que se cobró, y emite la nota de crédito SUNAT que
   * corresponde a la boleta/factura original ("el comprador desiste de la
   * compra" — catálogo 09, motivo "01" = Anulación de la operación por
   * defecto). Solo ADMIN/SUPPORT puede invocarla (ver commerce.controller.ts).
   *
   * Deliberadamente NO revoca la matrícula/acceso al curso — es una
   * decisión de negocio aparte (¿cuánto contenido ya consumió el alumno?)
   * que no estaba en el alcance de este pedido; queda para un endpoint
   * separado si se necesita.
   */
  /**
   * "Cancelar una orden reembolsa dinero real y anula un comprobante
   * tributario — no queda registro de qué ADMIN/SUPPORT lo hizo" —
   * hallazgo de auditoría de trazabilidad. `actorId` es opcional solo para
   * no romper cualquier llamador interno que no lo tenga a mano; el
   * controller SIEMPRE lo manda (viene de @CurrentUser()).
   */
  async cancelOrder(orderId: string, input: CancelOrderInput, actorId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true, electronicInvoice: true },
    });
    if (!order) throw new NotFoundException("Orden no encontrada");
    if (order.status !== "PAID") {
      throw new BadRequestException("Solo se pueden cancelar órdenes en estado PAID");
    }

    const invoice = order.electronicInvoice;
    if (!invoice || (invoice.status !== "ACCEPTED" && invoice.status !== "SIMULATED")) {
      throw new BadRequestException(
        "La orden no tiene un comprobante electrónico emitido todavía — espera a que se procese o revisa su estado",
      );
    }

    const successfulPayment = order.payments.find((p) => p.status === "SUCCEEDED");
    if (!successfulPayment) {
      throw new BadRequestException("La orden no tiene un pago exitoso que reembolsar");
    }

    const provider = this.resolveProvider(successfulPayment.provider as CheckoutInput["paymentProvider"]);
    const refundResult = await provider.refund({
      providerRef: successfulPayment.providerRef ?? "",
      amountInMinorUnits: Math.round(Number(order.total) * 100),
      reason: input.reasonDescription,
    });
    if (!refundResult.success) {
      throw new BadRequestException(refundResult.failureMessage ?? "No se pudo procesar el reembolso");
    }

    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } }),
      this.prisma.payment.update({ where: { id: successfulPayment.id }, data: { status: "REFUNDED" } }),
    ]);

    const noteType: ElectronicNoteType = "CREDIT";
    const series = await this.resolveSunatSeries(
      invoice.documentType === "FACTURA" ? "facturaCreditSeries" : "boletaCreditSeries",
      invoice.documentType === "FACTURA" ? "FC01" : "BC01",
    );

    // Mismo enfoque de correlativo secuencial simple que createElectronicInvoiceIfNeeded.
    const last = await this.prisma.electronicNote.findFirst({
      where: { noteType, series },
      orderBy: { correlativo: "desc" },
    });
    const correlativo = (last?.correlativo ?? 0) + 1;

    const note = await this.prisma.electronicNote.create({
      data: {
        orderId: order.id,
        noteType,
        series,
        correlativo,
        referenceDocType: invoice.documentType,
        referenceSeries: invoice.series,
        referenceCorrelativo: invoice.correlativo,
        reasonCode: input.reasonCode,
        reasonDescription: input.reasonDescription,
        currency: invoice.currency,
        totalAmount: invoice.totalAmount,
        status: "PENDING",
      },
    });

    await this.invoiceQueue.add(
      INVOICE_JOBS.GENERATE_NOTE,
      { noteId: note.id },
      { attempts: 3, backoff: { type: "exponential", delay: 15000 }, removeOnComplete: true },
    );

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: "ORDER_CANCEL_REFUND",
        entity: "Order",
        entityId: order.id,
        before: { status: order.status, total: decimalToString(order.total) },
        after: { status: "REFUNDED", reasonCode: input.reasonCode, reasonDescription: input.reasonDescription, creditNoteId: note.id },
      },
    });

    return { orderId: order.id, status: "REFUNDED" as const, noteId: note.id };
  }

  /**
   * Otorga acceso gratuito a un curso/programa que SÍ tiene precio (p.ej.
   * estrategia de marketing, cortesía a un cliente corporativo) — a
   * diferencia de un curso realmente gratuito (priceAmount = 0), esto es
   * una decisión discrecional del admin sobre UNA venta puntual. Por eso
   * NUNCA pasa por Order/Payment: no hay nada que cobrar, así que
   * createElectronicInvoiceIfNeeded ni se llama — no se emite boleta ni
   * factura, tal como pidió el cliente explícitamente.
   */
  async grantFree(actorId: string, input: GrantFreeAccessInput) {
    let offeringTitle: unknown;
    let accessDurationPolicy: AccessDurationPolicy | undefined;
    let courseId: string | undefined;
    let programId: string | undefined;

    if (input.offeringKind === "COURSE") {
      const course = await this.prisma.course.findUnique({ where: { slug: input.courseSlug } });
      if (!course || course.status !== "PUBLISHED") throw new NotFoundException("Curso no disponible");
      offeringTitle = course.title;
      accessDurationPolicy = course.accessDurationPolicy;
      courseId = course.id;
    } else {
      const program = await this.prisma.program.findUnique({ where: { slug: input.programSlug } });
      if (!program || program.status !== "PUBLISHED") throw new NotFoundException("Programa no disponible");
      offeringTitle = program.title;
      programId = program.id;
    }
    const title = ((offeringTitle as Record<string, string>) ?? {}).es ?? "un curso de Inkademy";

    if (input.companyId) {
      if (!input.seatPoolQty) throw new BadRequestException("seatPoolQty es requerido al otorgar a una empresa");
      const company = await this.prisma.company.findUnique({ where: { id: input.companyId } });
      if (!company) throw new NotFoundException("Empresa no encontrada");

      const existingPool = await this.prisma.companySeatPool.findFirst({
        where: { companyId: input.companyId, offeringKind: input.offeringKind, courseId, programId },
      });
      if (existingPool) {
        await this.prisma.companySeatPool.update({
          where: { id: existingPool.id },
          data: { seatsPurchased: existingPool.seatsPurchased + input.seatPoolQty },
        });
      } else {
        await this.prisma.companySeatPool.create({
          data: { companyId: input.companyId, offeringKind: input.offeringKind, courseId, programId, seatsPurchased: input.seatPoolQty },
        });
      }

      await this.prisma.auditLog.create({
        data: {
          actorId,
          companyId: input.companyId,
          action: "GRANT_FREE_ACCESS",
          entity: input.offeringKind === "COURSE" ? "Course" : "Program",
          entityId: courseId ?? programId,
          after: { companyId: input.companyId, seatPoolQty: input.seatPoolQty, note: input.note },
        },
      });

      return { granted: "COMPANY_SEATS" as const, companyId: input.companyId, seatPoolQty: input.seatPoolQty };
    }

    const user = await this.prisma.user.findUnique({ where: { email: input.userEmail } });
    if (!user) throw new NotFoundException("No existe un usuario con ese correo");
    const userId = user.id;

    const existingEnrollment = await this.prisma.enrollment.findFirst({
      where: { userId, offeringKind: input.offeringKind, courseId, programId, status: "ACTIVE" },
    });
    if (existingEnrollment) {
      throw new BadRequestException("Este usuario ya tiene una matrícula activa en esta oferta");
    }

    const accessExpiresAt = accessDurationPolicy ? computeAccessExpiresAt(accessDurationPolicy, new Date()) : null;
    const enrollment = await this.prisma.enrollment.create({
      data: { userId, offeringKind: input.offeringKind, courseId, programId, source: "ADMIN_GRANTED", accessExpiresAt },
    });

    if (input.offeringKind === "COURSE" && courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: courseId } });
      if (course) await this.calendarService.scheduleForEnrollment(userId, course, accessExpiresAt);
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: "GRANT_FREE_ACCESS",
        entity: input.offeringKind === "COURSE" ? "Course" : "Program",
        entityId: courseId ?? programId,
        after: { userId, note: input.note },
      },
    });

    await this.notifications.sendFreeAccessGranted(user.email, title, userId);

    return { granted: "ENROLLMENT" as const, enrollmentId: enrollment.id };
  }

  async getOrderById(userId: string, orderId: string, isAdmin: boolean) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true, electronicInvoice: true, electronicNotes: true },
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
      electronicInvoice: order.electronicInvoice
        ? {
            documentType: order.electronicInvoice.documentType,
            series: order.electronicInvoice.series,
            correlativo: order.electronicInvoice.correlativo,
            status: order.electronicInvoice.status,
            sunatDescription: order.electronicInvoice.sunatDescription,
          }
        : null,
      electronicNotes: order.electronicNotes.map((n) => ({
        noteType: n.noteType,
        series: n.series,
        correlativo: n.correlativo,
        status: n.status,
        reasonDescription: n.reasonDescription,
        sunatDescription: n.sunatDescription,
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
   * Culqi no publica firma de webhook como Stripe — la protección real acá
   * es NUNCA confiar en el `payload.type` que llega en el body (cualquiera
   * puede enviarlo con cualquier valor, o sin `type` en absoluto, a esta
   * ruta pública). En vez de eso, el webhook solo dispara una
   * re-verificación server-to-server directa contra la API de Culqi
   * (`verifyChargeSucceeded`) — el estado que importa es el que Culqi
   * confirma, no el que declaró quien llamó a este endpoint. Antes,
   * `!payload.type || payload.type.includes("succeeded")...` incluso
   * trataba un body SIN `type` como éxito — cualquiera que conociera el
   * `providerRef` de un cargo podía matricularse gratis simulando este
   * webhook (hallazgo de auditoría de seguridad).
   */
  async handleCulqiWebhook(payload: { id?: string; type?: string; data?: { id?: string } }) {
    const chargeId = payload.data?.id ?? payload.id;
    if (!chargeId) throw new BadRequestException("Payload de webhook de Culqi inválido");

    const payment = await this.prisma.payment.findFirst({ where: { providerRef: chargeId } });
    if (!payment) {
      this.logger.warn(`Webhook de Culqi para un charge desconocido: ${chargeId}`);
      return { received: true };
    }
    if (payment.status === "SUCCEEDED") return { received: true }; // idempotente ante reintentos

    const reallySucceeded = await this.culqiProvider.verifyChargeSucceeded(chargeId);
    if (reallySucceeded) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: "SUCCEEDED", paidAt: new Date() },
      });
      await this.finalizeOrderPaid(payment.orderId);
    } else {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      await this.prisma.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });
    }
    return { received: true };
  }
}

import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { cancelOrderSchema, checkoutSchema, createPayPalOrderSchema } from "@inkademy/shared";
import type { CancelOrderInput, CheckoutInput, CreatePayPalOrderInput } from "@inkademy/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { grantFreeAccessSchema } from "../../common/validation/local-schemas";
import { CommerceService } from "./commerce.service";

@ApiTags("commerce")
@ApiBearerAuth()
@Controller()
export class CommerceController {
  constructor(private readonly commerceService: CommerceService) {}

  @Post("checkout")
  @ApiOperation({ summary: "Crea una orden, cobra vía Culqi/Stripe y matricula si el pago fue exitoso" })
  checkout(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(checkoutSchema)) dto: CheckoutInput,
  ) {
    return this.commerceService.checkout(user.id, dto);
  }

  @Post("checkout/paypal-order")
  @ApiOperation({ summary: "Crea (sin capturar) una orden de PayPal para que el frontend renderice el botón de aprobación" })
  createPayPalOrder(@Body(new ZodValidationPipe(createPayPalOrderSchema)) dto: CreatePayPalOrderInput) {
    return this.commerceService.createPayPalOrder(dto);
  }

  @Get("orders/:id")
  @ApiOperation({ summary: "Detalle de una orden + comprobante" })
  getOrder(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.commerceService.getOrderById(user.id, id, user.globalRole === "ADMIN" || user.globalRole === "SUPPORT");
  }

  @Get("me/orders")
  @ApiOperation({ summary: "Historial de compras/comprobantes del usuario" })
  listMine(@CurrentUser() user: RequestUser) {
    return this.commerceService.listMine(user.id);
  }

  @Post("grants")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({
    summary:
      "Otorga acceso gratuito a un curso/programa con precio (marketing/cortesía) a una persona o a una empresa — nunca genera Order ni comprobante SUNAT",
  })
  grantFree(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(grantFreeAccessSchema)) dto: any) {
    return this.commerceService.grantFree(user.id, dto);
  }

  @Post("orders/:id/cancel")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({
    summary:
      "Cancela una orden pagada: reembolsa el cobro original (Culqi/Stripe) y emite la nota de crédito SUNAT correspondiente",
  })
  cancelOrder(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(cancelOrderSchema)) dto: CancelOrderInput) {
    return this.commerceService.cancelOrder(id, dto, user.id);
  }

  @Post("orders/:id/cancel-test")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({
    summary:
      "Zona de pruebas: deshace una orden de prueba sin comprobante SUNAT emitido (sin reembolso real) y cancela la matrícula que generó",
  })
  cancelTestOrder(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.commerceService.cancelTestOrder(id, user.id);
  }
}

@ApiTags("webhooks")
@Public()
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly commerceService: CommerceService) {}

  @Post("stripe")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Webhook de Stripe (firma verificada con STRIPE_WEBHOOK_SECRET)" })
  async stripeWebhook(@Req() req: Request) {
    const signature = req.headers["stripe-signature"] as string | undefined;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!signature || !rawBody) throw new BadRequestException("Falta la firma o el cuerpo crudo de Stripe");
    return this.commerceService.handleStripeWebhook(rawBody, signature);
  }

  @Post("culqi")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Webhook de Culqi" })
  async culqiWebhook(@Body() body: { id?: string; type?: string; data?: { id?: string } }) {
    return this.commerceService.handleCulqiWebhook(body);
  }
}

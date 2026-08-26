import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { CalendarModule } from "../calendar/calendar.module";
import { CommerceController, WebhooksController } from "./commerce.controller";
import { CommerceService } from "./commerce.service";
import { CulqiProvider } from "./providers/culqi.provider";
import { StripeProvider } from "./providers/stripe.provider";
import { PayPalProvider } from "./providers/paypal.provider";

@Module({
  imports: [NotificationModule, CalendarModule],
  controllers: [CommerceController, WebhooksController],
  providers: [CommerceService, CulqiProvider, StripeProvider, PayPalProvider],
  exports: [CommerceService],
})
export class CommerceModule {}

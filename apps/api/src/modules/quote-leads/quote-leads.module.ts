import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { CrmBridgeProvider } from "../commerce/providers/crm-bridge.provider";
import { QuoteLeadsController } from "./quote-leads.controller";
import { QuoteLeadsService } from "./quote-leads.service";

@Module({
  imports: [NotificationModule],
  controllers: [QuoteLeadsController],
  providers: [QuoteLeadsService, CrmBridgeProvider],
})
export class QuoteLeadsModule {}

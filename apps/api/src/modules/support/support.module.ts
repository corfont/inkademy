import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { ChatbotModule } from "../chatbot/chatbot.module";
import { AuthModule } from "../auth/auth.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { SupportGateway } from "./support.gateway";

@Module({
  imports: [NotificationModule, ChatbotModule, AuthModule],
  controllers: [SupportController],
  providers: [SupportService, SupportGateway],
  exports: [SupportService],
})
export class SupportModule {}

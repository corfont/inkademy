import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { ChatbotModule } from "../chatbot/chatbot.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";

@Module({
  imports: [NotificationModule, ChatbotModule],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}

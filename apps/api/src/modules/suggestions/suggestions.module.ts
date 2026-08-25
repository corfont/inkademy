import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { ChatbotModule } from "../chatbot/chatbot.module";
import { SuggestionsController } from "./suggestions.controller";
import { SuggestionsService } from "./suggestions.service";

@Module({
  imports: [NotificationModule, ChatbotModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
})
export class SuggestionsModule {}

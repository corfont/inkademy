import { Module } from "@nestjs/common";
import { StorageModule } from "../../storage/storage.module";
import { ChatbotController } from "./chatbot.controller";
import { ChatbotDocumentsController } from "./chatbot-documents.controller";
import { ChatbotService } from "./chatbot.service";
import { ChatbotDocumentsService } from "./chatbot-documents.service";

@Module({
  imports: [StorageModule],
  controllers: [ChatbotController, ChatbotDocumentsController],
  providers: [ChatbotService, ChatbotDocumentsService],
  // Exportados para que SupportModule/SuggestionsModule puedan generar
  // borradores de respuesta y guardar tickets/sugerencias resueltos como
  // fuente de conocimiento del asistente (ver "haz todo" del admin).
  exports: [ChatbotService, ChatbotDocumentsService],
})
export class ChatbotModule {}

import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { chatbotMessageSchema } from "../../common/validation/local-schemas";
import { ChatbotService } from "./chatbot.service";

@ApiTags("chatbot")
@Controller("chatbot")
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Public()
  @Get("status")
  @ApiOperation({ summary: "Si el asistente de IA está habilitado (para mostrar u ocultar el widget)" })
  status() {
    return this.chatbotService.status();
  }

  @ApiBearerAuth()
  @Post("message")
  @ApiOperation({ summary: "Envía un mensaje al asistente de IA (Gemini) y devuelve su respuesta" })
  sendMessage(@Body(new ZodValidationPipe(chatbotMessageSchema)) dto: { message: string; history?: Array<{ role: "user" | "assistant"; content: string }> }) {
    return this.chatbotService.sendMessage(dto.message, dto.history);
  }
}

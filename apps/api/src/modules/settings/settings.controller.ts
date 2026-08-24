import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { upsertChatbotSettingsSchema, upsertSettingsSchema, upsertSunatSettingsSchema } from "../../common/validation/local-schemas";
import { SettingsService } from "./settings.service";
import { SunatSettingsService } from "./sunat-settings.service";
import { ChatbotSettingsService } from "./chatbot-settings.service";

@ApiTags("settings")
@Controller()
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly sunatSettingsService: SunatSettingsService,
    private readonly chatbotSettingsService: ChatbotSettingsService,
  ) {}

  @Public()
  @Get("settings")
  @ApiOperation({ summary: "Identidad visual pública de la plataforma (logo, tipografía, fondo)" })
  get() {
    return this.settingsService.get();
  }

  @Patch("admin/settings")
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "Actualiza la identidad visual de la plataforma" })
  update(@Body(new ZodValidationPipe(upsertSettingsSchema)) dto: any) {
    return this.settingsService.update(dto);
  }

  @Get("admin/sunat-settings")
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "Configuración de facturación electrónica SUNAT (los secretos nunca se devuelven en texto plano)" })
  getSunatSettings() {
    return this.sunatSettingsService.get();
  }

  @Patch("admin/sunat-settings")
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "Actualiza la configuración de facturación electrónica SUNAT" })
  updateSunatSettings(@Body(new ZodValidationPipe(upsertSunatSettingsSchema)) dto: any) {
    return this.sunatSettingsService.update(dto);
  }

  @Get("admin/chatbot-settings")
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "Configuración del asistente de IA (la API key nunca se devuelve en texto plano)" })
  getChatbotSettings() {
    return this.chatbotSettingsService.get();
  }

  @Patch("admin/chatbot-settings")
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "Actualiza la configuración del asistente de IA" })
  updateChatbotSettings(@Body(new ZodValidationPipe(upsertChatbotSettingsSchema)) dto: any) {
    return this.chatbotSettingsService.update(dto);
  }
}

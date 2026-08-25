import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  upsertChatbotSettingsSchema,
  upsertSettingsSchema,
  upsertSunatSettingsSchema,
  upsertEmailServerSettingsSchema,
} from "../../common/validation/local-schemas";
import { SettingsService } from "./settings.service";
import { SunatSettingsService } from "./sunat-settings.service";
import { ChatbotSettingsService } from "./chatbot-settings.service";
import { EmailServerSettingsService } from "./email-server-settings.service";

@ApiTags("settings")
@Controller()
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly sunatSettingsService: SunatSettingsService,
    private readonly chatbotSettingsService: ChatbotSettingsService,
    private readonly emailServerSettingsService: EmailServerSettingsService,
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
  updateSunatSettings(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(upsertSunatSettingsSchema)) dto: any) {
    return this.sunatSettingsService.update(dto, user.id);
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

  @Get("admin/email-server-settings")
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "Configuración del servidor SMTP (la contraseña nunca se devuelve en texto plano)" })
  getEmailServerSettings() {
    return this.emailServerSettingsService.get();
  }

  @Patch("admin/email-server-settings")
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "Actualiza la configuración del servidor SMTP" })
  updateEmailServerSettings(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(upsertEmailServerSettingsSchema)) dto: any) {
    return this.emailServerSettingsService.update(dto, user.id);
  }
}

import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { upsertSettingsSchema } from "../../common/validation/local-schemas";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
}

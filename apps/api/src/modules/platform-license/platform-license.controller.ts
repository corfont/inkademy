import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PlatformLicenseService } from "./platform-license.service";

const upsertPlatformLicenseSchema = z.object({
  clientName: z.string().min(1),
  domain: z.string().optional().nullable(),
  deploymentUrl: z.string().optional().nullable(),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
  priceAmount: z.number().min(0),
  currency: z.string().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: z.enum(["ACTIVE", "EXPIRING_SOON", "EXPIRED", "CANCELLED"]).optional(),
  notes: z.string().optional().nullable(),
});

const updatePlatformLicenseSchema = upsertPlatformLicenseSchema.partial();

@ApiTags("platform-license")
@ApiBearerAuth()
@Controller("admin/licenses")
@UseGuards(RolesGuard)
@Roles("ADMIN")
export class PlatformLicenseController {
  constructor(private readonly service: PlatformLicenseService) {}

  @Get()
  @ApiOperation({ summary: "Lista las licencias de arriendo del sistema (instancias marca blanca)" })
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({ summary: "Registra una nueva licencia de arriendo" })
  create(@Body(new ZodValidationPipe(upsertPlatformLicenseSchema)) dto: z.infer<typeof upsertPlatformLicenseSchema>) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edita una licencia de arriendo" })
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updatePlatformLicenseSchema)) dto: z.infer<typeof updatePlatformLicenseSchema>) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Elimina una licencia de arriendo" })
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}

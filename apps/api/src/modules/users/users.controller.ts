import { Body, Controller, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { completeProfileSchema } from "@inkademy/shared";
import type { CompleteProfileInput } from "@inkademy/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { CompleteProfileDto } from "../auth/dto/auth.dto";
import { UsersService } from "./users.service";
import { ApiBody } from "@nestjs/swagger";

@ApiTags("profile")
@ApiBearerAuth()
@Controller("profile")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch()
  @ApiOperation({ summary: "Completa/actualiza el perfil progresivo del usuario (persona natural)" })
  @ApiBody({ type: CompleteProfileDto })
  async completeProfile(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(completeProfileSchema)) dto: CompleteProfileInput,
  ) {
    return this.usersService.completeProfile(user.id, dto);
  }

  @Post("avatar")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Sube/reemplaza la foto de perfil del usuario autenticado" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string },
  ) {
    return this.usersService.updateAvatar(user.id, file);
  }
}

import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import type { CompleteProfileInput } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { toAuthUser } from "../../common/utils/map-user";
import { StorageService } from "../../storage/storage.service";

@Injectable()
export class UsersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storageService: StorageService,
  ) {}

  async completeProfile(userId: string, input: CompleteProfileInput) {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const willHaveDoc = input.documentNumber ?? current.documentNumber;
    const willHaveCountry = input.country ?? current.country;
    const profileCompletedAt =
      willHaveDoc && willHaveCountry && !current.profileCompletedAt
        ? new Date()
        : current.profileCompletedAt;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { ...input, profileCompletedAt },
    });
    return toAuthUser(user);
  }

  /**
   * Antes el registro/perfil no pedía foto en absoluto — ni había forma de
   * subir una. A diferencia de POST /admin/uploads (solo ADMIN/TEACHER,
   * pensado para contenido de curso), este endpoint es de cualquier usuario
   * autenticado sobre su propio avatar.
   */
  async updateAvatar(userId: string, file: { originalname: string; buffer: Buffer; mimetype: string }) {
    const key = `avatars/${userId}-${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await this.storageService.uploadBuffer(key, file.buffer, file.mimetype);
    const url = this.storageService.getPublicUrl(key) ?? (await this.storageService.getSignedUrl(key, 60 * 60 * 24 * 365));
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });
    return toAuthUser(user);
  }
}

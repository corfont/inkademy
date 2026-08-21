import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import type { CompleteProfileInput } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { toAuthUser } from "../../common/utils/map-user";

@Injectable()
export class UsersService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

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
}

import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";

@Injectable()
export class SuggestionsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  create(userId: string, message: string) {
    return this.prisma.courseSuggestion.create({ data: { userId, message } });
  }

  listMine(userId: string) {
    return this.prisma.courseSuggestion.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  }

  listAll() {
    return this.prisma.courseSuggestion.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });
  }

  updateStatus(id: string, status: string) {
    return this.prisma.courseSuggestion.update({ where: { id }, data: { status } });
  }
}

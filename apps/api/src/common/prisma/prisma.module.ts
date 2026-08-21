import { Global, Module, OnApplicationShutdown } from "@nestjs/common";
import { prisma } from "@inkademy/db";

export const PRISMA = "PRISMA";

/**
 * Envuelve la instancia singleton de PrismaClient exportada por @inkademy/db
 * como provider inyectable en Nest, sin crear una segunda conexión.
 */
@Global()
@Module({
  providers: [{ provide: PRISMA, useValue: prisma }],
  exports: [PRISMA],
})
export class PrismaModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await prisma.$disconnect();
  }
}

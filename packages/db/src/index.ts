// Cliente Prisma compartido por apps/api y apps/worker.
// El cliente se genera en ./generated (ver generator "client" en prisma/schema.prisma)
// para evitar ambigüedades de resolución de node_modules en el monorepo pnpm.
import { PrismaClient } from "../generated";

export * from "../generated";

declare global {
  // eslint-disable-next-line no-var
  var __inkademyPrisma: PrismaClient | undefined;
}

// Reusa la instancia en dev (hot-reload) para no agotar conexiones de Postgres.
export const prisma: PrismaClient =
  global.__inkademyPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV === "development") {
  global.__inkademyPrisma = prisma;
}

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL
      ? `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes("?") ? "&" : "?"}connection_limit=5&pool_timeout=30`
      : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

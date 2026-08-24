import { PrismaClient } from "@prisma/client";

import { isProduction } from "@/lib/env";

// Reuse the client across hot reloads in dev, and across serverless invocations
// that land on a warm lambda in production.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ["error"] : ["error", "warn"],
  });

if (!isProduction) globalForPrisma.prisma = db;

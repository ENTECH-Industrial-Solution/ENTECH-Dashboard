import { PrismaClient } from "@prisma/client";

import { env, isProduction } from "@/lib/env";

/**
 * Which connection string the client uses.
 *
 * Production always gets DATABASE_URL — the transaction pooler on :6543, with
 * `pgbouncer=true`. That flag costs roughly 250ms on *every* query: it turns
 * off Prisma's prepared-statement cache, so each query re-parses over several
 * round trips. Measured from one machine against the same host, `SELECT 1` is
 * ~56ms without the flag and ~283ms with it.
 *
 * Do not remove it. Transaction pooling hands consecutive queries to different
 * server connections, and a prepared statement made on one is absent on the
 * next. Removing the flag and running 1200 queries produced 1102 failures, all
 * `26000 prepared statement "sN" does not exist`. The flag is correctness; the
 * latency is its price, and the way to pay less is fewer round trips (see the
 * aggregate reads in src/server/queries.ts), not a cheaper flag.
 *
 * Development can opt out of that price with DEV_DIRECT_DB=1, which routes the
 * app through DIRECT_URL — session mode on :5432, where prepared statements
 * survive and no flag is needed. It is worth real time: the admin dashboard's
 * six round trips measured a median of 2598ms through the pooler and 926ms
 * direct.
 *
 * It is off by default because session mode's pool is small and shared. Prisma
 * Studio, a migrate run and the dev server all draw on it, and when it runs out
 * Supavisor refuses the TCP connection outright — which surfaces as
 * `P1001 Can't reach database server`, a message that reads like the database
 * is down rather than like a pool being full. A dev environment that fails
 * that way costs more than the 1.7s a page reload saves, so speed here is an
 * informed choice, not a default. If you turn it on and see P1001, turn it
 * back off.
 */
function connectionUrl(): string {
  const useDirect = !isProduction && env.DEV_DIRECT_DB && env.DIRECT_URL;
  if (!useDirect) return env.DATABASE_URL;

  const url = new URL(env.DIRECT_URL!);

  // Keep the footprint on that shared pool small. Left alone Prisma asks for
  // num_cpus * 2 + 1, which on a developer machine could claim most of it.
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "3");
  }

  return url.toString();
}

// Reuse the client across hot reloads in dev, and across serverless invocations
// that land on a warm lambda in production.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: connectionUrl(),
    log: isProduction ? ["error"] : ["error", "warn"],
  });

if (!isProduction) globalForPrisma.prisma = db;

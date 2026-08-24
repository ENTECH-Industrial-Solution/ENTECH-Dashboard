import { z } from "zod";

/**
 * Fail fast at boot rather than at the first request that needs a secret.
 * Importing this module from anywhere server-side validates the whole set once.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters — generate with: openssl rand -base64 48"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Canonical origin, used for the Server Action origin check and cookie flags. */
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Bootstrap admin, consumed only by prisma/seed.ts. */
  SEED_ADMIN_CODE: z.string().min(3).optional(),
  SEED_ADMIN_PASSWORD: z.string().min(12).optional(),
  SEED_ADMIN_NAME: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";

import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

/**
 * Argon2id parameters. These follow OWASP's 2024 guidance (19 MiB, t=2, p=1)
 * which fits comfortably inside a Vercel function's memory budget while staying
 * expensive enough to make offline cracking impractical.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export const passwordSchema = z
  .string()
  .min(12, "รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร / Password must be at least 12 characters")
  .max(128, "รหัสผ่านยาวเกินไป / Password is too long")
  .refine((v) => /[a-z]/.test(v), "ต้องมีตัวพิมพ์เล็ก / Must contain a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "ต้องมีตัวพิมพ์ใหญ่ / Must contain an uppercase letter")
  .refine((v) => /[0-9]/.test(v), "ต้องมีตัวเลข / Must contain a number")
  .refine(
    (v) => /[^A-Za-z0-9]/.test(v),
    "ต้องมีอักขระพิเศษ / Must contain a special character",
  );

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  plaintext: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext, ARGON2_OPTIONS);
  } catch {
    // Malformed hash in the database — treat as a failed login, never as a pass.
    return false;
  }
}

/**
 * Burn roughly the same CPU as a real verification when the account does not
 * exist, so response timing does not reveal which employee codes are valid.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";

export async function fakeVerify(): Promise<void> {
  await verify(DUMMY_HASH, "dummy-password-for-timing", ARGON2_OPTIONS).catch(() => false);
}

/** Temporary password handed to a new employee; they must change it on first login. */
export function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;

  const pick = (set: string) => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return set[bytes[0]! % set.length]!;
  };

  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 16) chars.push(pick(all));

  // Fisher-Yates with CSPRNG so the guaranteed-class characters aren't positional.
  for (let i = chars.length - 1; i > 0; i--) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const j = bytes[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

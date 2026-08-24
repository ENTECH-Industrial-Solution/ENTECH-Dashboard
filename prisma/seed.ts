import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

/**
 * Creates the bootstrap administrator. Idempotent: running it again updates the
 * existing account's password rather than failing on the unique constraint.
 *
 * Required env: SEED_ADMIN_CODE, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME.
 * The seeded admin is flagged mustChangePassword, so the value you pass here is
 * a one-time bootstrap credential, not a standing password.
 */
const db = new PrismaClient();

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

async function main() {
  const employeeCode = process.env.SEED_ADMIN_CODE;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const fullName = process.env.SEED_ADMIN_NAME ?? "System Administrator";

  if (!employeeCode || !password) {
    throw new Error(
      "Set SEED_ADMIN_CODE and SEED_ADMIN_PASSWORD before seeding.\n" +
        "Example: SEED_ADMIN_CODE=ENT-0001 SEED_ADMIN_PASSWORD='...' npm run db:seed",
    );
  }

  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const passwordHash = await hash(password, ARGON2_OPTIONS);
  const code = employeeCode.toUpperCase();

  const admin = await db.employee.upsert({
    where: { employeeCode: code },
    create: {
      employeeCode: code,
      fullName,
      role: "ADMIN",
      passwordHash,
      mustChangePassword: true,
    },
    update: {
      passwordHash,
      role: "ADMIN",
      isActive: true,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  await db.counter.upsert({
    where: { name: "task" },
    create: { name: "task", value: 0 },
    update: {},
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorLabel: `${admin.employeeCode} — ${admin.fullName}`,
      action: "employee.created",
      entityType: "Employee",
      entityId: admin.id,
      metadata: { via: "seed", role: "ADMIN" },
    },
  });

  console.log(`Seeded administrator ${admin.employeeCode} (${admin.fullName}).`);
  console.log("This account must change its password on first sign-in.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

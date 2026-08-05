import bcrypt from "bcryptjs";
import { UserRole } from "../lib/generated/prisma/client";
import { passwordPolicyError } from "../lib/password-policy";
import { createScriptPrisma } from "./database-client";
import { createAdminTotp, protectAdminTotpSecret } from "../lib/admin-mfa";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || "";
const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim() || "";
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
const enforceSingleAdmin = process.env.BOOTSTRAP_SINGLE_ADMIN === "true";
const rotateTotp = process.env.BOOTSTRAP_ROTATE_TOTP === "true";

if (!email || !username || !password) {
  throw new Error("Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_USERNAME, and BOOTSTRAP_ADMIN_PASSWORD");
}

const passwordError = passwordPolicyError(password, [username, email.split("@")[0] || ""]);
if (passwordError) throw new Error(passwordError);

const prisma = createScriptPrisma();

async function main() {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== UserRole.ADMIN) {
    throw new Error("That email already belongs to a non-admin account; choose another address or review it manually");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const totpSetup = !existing?.adminTotpSecret || rotateTotp ? createAdminTotp(email) : null;
  const admin = await prisma.$transaction(async (tx) => {
    if (enforceSingleAdmin) {
      await tx.user.updateMany({
        where: { role: UserRole.ADMIN, email: { not: email } },
        data: { role: UserRole.PLAYER }
      });
    }

    return tx.user.upsert({
      where: { email },
      create: {
        email,
        username,
        passwordHash,
        passwordChangedAt: new Date(),
        emailVerifiedAt: new Date(),
        role: UserRole.ADMIN,
        ...(totpSetup ? { adminTotpSecret: protectAdminTotpSecret(totpSetup.secret), adminTotpEnabledAt: new Date() } : {})
      },
      update: {
        username,
        passwordHash,
        passwordChangedAt: new Date(),
        emailVerifiedAt: new Date(),
        role: UserRole.ADMIN,
        ...(totpSetup ? { adminTotpSecret: protectAdminTotpSecret(totpSetup.secret), adminTotpEnabledAt: new Date() } : {})
      }
    });
  });

  await prisma.authSession.updateMany({
    where: { userId: admin.id, revokedAt: null },
    data: { revokedAt: new Date() }
  });

  console.log(`Administrator ${admin.email} is ready. Existing sessions for this account were revoked.`);
  if (totpSetup) {
    console.log("Add this one-time setup key to the administrator's authenticator app, then remove this terminal output from any shared records:");
    console.log(totpSetup.secret);
    console.log(totpSetup.uri);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

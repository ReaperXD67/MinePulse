import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import { AccountTokenKind, UserRole } from "../lib/generated/prisma/client";
import { createAdminTotp, protectAdminTotpSecret } from "../lib/admin-mfa";
import { createScriptPrisma } from "./database-client";

const prisma = createScriptPrisma();
const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const memberEmail = `account-security-${stamp}@example.test`;
const adminEmail = `admin-security-${stamp}@example.test`;
const oldPassword = `Old!${stamp}Aa9`;
const newPassword = `New!${stamp}Bb8`;
const tokenDigest = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
let memberId = "";
let adminId = "";

async function login(email: string, password: string, totpCode?: string) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) })
  });
}

async function oneUseToken(userId: string, kind: AccountTokenKind) {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.accountToken.create({
    data: { userId, kind, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + 10 * 60 * 1000) }
  });
  return token;
}

async function main() {
  assert.equal(process.env.EMAIL_REQUIRED, "true", "Run the audit with EMAIL_REQUIRED=true");
  assert.equal(process.env.ADMIN_2FA_REQUIRED, "true", "Run the audit with ADMIN_2FA_REQUIRED=true");

  const member = await prisma.user.create({
    data: {
      email: memberEmail,
      username: `SecureMember${stamp.slice(-4)}`,
      passwordHash: await bcrypt.hash(oldPassword, 12),
      emailVerifiedAt: null
    }
  });
  memberId = member.id;

  const unverifiedLogin = await login(memberEmail, oldPassword);
  assert.equal(unverifiedLogin.status, 403, "Unverified account was allowed to log in");
  assert.equal((await unverifiedLogin.json()).code, "EMAIL_NOT_VERIFIED");

  const verifyToken = await oneUseToken(memberId, AccountTokenKind.EMAIL_VERIFICATION);
  const verify = await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: verifyToken })
  });
  assert.equal(verify.status, 200, "Email verification failed");
  const verifyReplay = await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: verifyToken })
  });
  assert.equal(verifyReplay.status, 400, "Verification token replay was accepted");

  const memberLogin = await login(memberEmail, oldPassword);
  assert.equal(memberLogin.status, 200, "Verified member could not log in");
  const memberCookie = memberLogin.headers.get("set-cookie")?.split(";", 1)[0] || "";
  assert(memberCookie, "Member login did not issue a session cookie");

  const resetToken = await oneUseToken(memberId, AccountTokenKind.PASSWORD_RESET);
  const reset = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: newPassword })
  });
  assert.equal(reset.status, 200, "Password reset failed");
  const resetReplay = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: `${newPassword}Again` })
  });
  assert.equal(resetReplay.status, 400, "Password reset token replay was accepted");
  const revokedSession = await fetch(`${baseUrl}/api/account/sessions`, { headers: { cookie: memberCookie } });
  assert.equal(revokedSession.status, 401, "Password reset did not revoke the old session");
  assert.equal((await login(memberEmail, oldPassword)).status, 401, "Old password remained valid");
  assert.equal((await login(memberEmail, newPassword)).status, 200, "New password was rejected");

  const unknownRecovery = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `missing-${stamp}@example.test` })
  });
  const knownRecovery = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: memberEmail })
  });
  assert.equal(unknownRecovery.status, knownRecovery.status, "Recovery status reveals whether an account exists");
  assert.deepEqual(await unknownRecovery.json(), await knownRecovery.json(), "Recovery message reveals whether an account exists");

  const setup = createAdminTotp(adminEmail);
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      username: `SecureAdmin${stamp.slice(-4)}`,
      passwordHash: await bcrypt.hash(oldPassword, 12),
      emailVerifiedAt: new Date(),
      role: UserRole.ADMIN,
      adminTotpSecret: protectAdminTotpSecret(setup.secret),
      adminTotpEnabledAt: new Date()
    }
  });
  adminId = admin.id;
  const missingMfa = await login(adminEmail, oldPassword);
  assert.equal((await missingMfa.json()).code, "TWO_FACTOR_REQUIRED", "Admin login did not require TOTP");
  assert.equal((await login(adminEmail, oldPassword, "000000")).status, 401, "Invalid admin TOTP was accepted");
  const currentTotp = new OTPAuth.TOTP({
    issuer: "KarixMC",
    label: adminEmail,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(setup.secret)
  }).generate();
  assert.equal((await login(adminEmail, oldPassword, currentTotp)).status, 200, "Valid admin TOTP was rejected");

  console.log(JSON.stringify({
    ok: true,
    checks: {
      unverifiedLoginBlocked: true,
      emailVerificationOneUse: true,
      passwordResetOneUse: true,
      passwordResetRevokesSessions: true,
      recoveryDoesNotEnumerateAccounts: true,
      administratorTotpRequired: true
    }
  }, null, 2));
}

async function cleanup() {
  const ids = [memberId, adminId].filter(Boolean);
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);

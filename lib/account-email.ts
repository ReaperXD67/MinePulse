import "server-only";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { AccountTokenKind } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL = {
  [AccountTokenKind.EMAIL_VERIFICATION]: 24 * 60 * 60 * 1000,
  [AccountTokenKind.PASSWORD_RESET]: 30 * 60 * 1000
};

export function emailDeliveryRequired() {
  return process.env.EMAIL_REQUIRED === "true";
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function baseUrl() {
  const value = process.env.APP_BASE_URL;
  if (!value) throw new Error("APP_BASE_URL is required for account emails");
  return value;
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character] || character);
}

async function transport() {
  const smtpUrl = process.env.SMTP_URL;
  if (!smtpUrl) {
    if (emailDeliveryRequired()) throw new Error("SMTP_URL is required when EMAIL_REQUIRED=true");
    return null;
  }
  return nodemailer.createTransport(smtpUrl);
}

export async function issueAccountToken(userId: string, kind: AccountTokenKind) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction([
    prisma.accountToken.deleteMany({ where: { userId, kind } }),
    prisma.accountToken.create({
      data: {
        userId,
        kind,
        tokenHash: tokenHash(token),
        expiresAt: new Date(now.getTime() + TOKEN_TTL[kind])
      }
    })
  ]);
  return token;
}

export function accountTokenDigest(token: string) {
  return tokenHash(token);
}

async function sendAccountEmail(input: { to: string; username: string; subject: string; action: string; url: URL; expires: string }) {
  const sender = process.env.EMAIL_FROM;
  if (!sender) {
    if (emailDeliveryRequired()) throw new Error("EMAIL_FROM is required when EMAIL_REQUIRED=true");
    return false;
  }
  const mailer = await transport();
  if (!mailer) return false;

  const safeName = htmlEscape(input.username);
  const safeUrl = htmlEscape(input.url.toString());
  await mailer.sendMail({
    from: sender,
    to: input.to,
    subject: input.subject,
    text: `Hello ${input.username},\n\n${input.action}: ${input.url}\n\nThis link expires ${input.expires}. If you did not request it, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#101820"><h1>KarixMC</h1><p>Hello ${safeName},</p><p>${htmlEscape(input.action)}.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#72f59b;color:#07120b;text-decoration:none;font-weight:700">Continue securely</a></p><p>This link expires ${htmlEscape(input.expires)}. If you did not request it, ignore this email.</p></div>`
  });
  return true;
}

export async function sendVerificationEmail(user: { id: string; email: string; username: string }) {
  const token = await issueAccountToken(user.id, AccountTokenKind.EMAIL_VERIFICATION);
  const url = new URL("/verify-email", baseUrl());
  url.searchParams.set("token", token);
  return sendAccountEmail({
    to: user.email,
    username: user.username,
    subject: "Verify your KarixMC email",
    action: "Verify this email address to activate your account",
    url,
    expires: "in 24 hours"
  });
}

export async function sendPasswordResetEmail(user: { id: string; email: string; username: string }) {
  const token = await issueAccountToken(user.id, AccountTokenKind.PASSWORD_RESET);
  const url = new URL("/reset-password", baseUrl());
  url.searchParams.set("token", token);
  return sendAccountEmail({
    to: user.email,
    username: user.username,
    subject: "Reset your KarixMC password",
    action: "Reset your password using the secure link below",
    url,
    expires: "in 30 minutes"
  });
}

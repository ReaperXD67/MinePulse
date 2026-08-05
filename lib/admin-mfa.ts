import crypto from "node:crypto";
import * as OTPAuth from "otpauth";

const PREFIX = "mfa:v1";

function encryptionKey() {
  const source = process.env.ACCOUNT_MFA_ENCRYPTION_KEY;
  if (!source || source.length < 32) throw new Error("ACCOUNT_MFA_ENCRYPTION_KEY must contain at least 32 characters");
  return crypto.createHash("sha256").update(source).digest();
}

export function protectAdminTotpSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

function revealAdminTotpSecret(stored: string) {
  const parts = stored.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== PREFIX) throw new Error("Stored administrator MFA credential is malformed");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(parts[2], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[4], "base64url")), decipher.final()]).toString("utf8");
}

function totp(secret: string, account: string) {
  return new OTPAuth.TOTP({
    issuer: "KarixMC",
    label: account,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret)
  });
}

export function createAdminTotp(account: string) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  return { secret, uri: totp(secret, account).toString() };
}

export function verifyAdminTotp(storedSecret: string, account: string, token: string) {
  if (!/^\d{6}$/.test(token)) return false;
  return totp(revealAdminTotpSecret(storedSecret), account).validate({ token, window: 1 }) !== null;
}

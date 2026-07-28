import crypto from "node:crypto";

const PREFIX = "enc:v1";

function encryptionKey() {
  const source = process.env.PLUGIN_SECRET_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!source || source.length < 32) {
    throw new Error("PLUGIN_SECRET_ENCRYPTION_KEY must be configured with at least 32 characters");
  }
  return crypto.createHash("sha256").update(source).digest();
}

export function protectPluginSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function revealPluginSecret(stored: string) {
  if (!stored.startsWith(`${PREFIX}:`)) return stored;
  const parts = stored.split(":");
  if (parts.length !== 5) throw new Error("Stored plugin credential is malformed");
  const iv = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const encrypted = Buffer.from(parts[4], "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

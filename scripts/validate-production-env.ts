import "dotenv/config";
import path from "node:path";

const errors: string[] = [];
const warnings: string[] = [];

function required(name: string) {
  const value = process.env[name]?.trim() || "";
  if (!value) errors.push(`${name} is required`);
  return value;
}

function secret(name: string) {
  const value = required(name);
  if (value.length < 32) errors.push(`${name} must contain at least 32 characters`);
  if (/replace|example|changeme|local|preview/i.test(value)) errors.push(`${name} still contains a placeholder value`);
  return value;
}

const databaseUrl = required("DATABASE_URL");
const redisUrl = required("REDIS_URL");
const appBaseUrl = required("APP_BASE_URL");
const postgresPassword = secret("POSTGRES_PASSWORD");
const redisPassword = secret("REDIS_PASSWORD");
const authSecret = secret("AUTH_SECRET");
const pluginSecret = secret("PLUGIN_SECRET_ENCRYPTION_KEY");
const mfaSecret = secret("ACCOUNT_MFA_ENCRYPTION_KEY");
const healthcheckToken = secret("HEALTHCHECK_TOKEN");
const mediaRoot = required("MEDIA_ROOT");

if (!/^postgres(ql)?:\/\//.test(databaseUrl)) errors.push("DATABASE_URL must use PostgreSQL");
if (!/^rediss?:\/\//.test(redisUrl)) errors.push("REDIS_URL must use Redis");
try {
  const parsedBaseUrl = new URL(appBaseUrl);
  if (parsedBaseUrl.protocol !== "https:") errors.push("APP_BASE_URL must use HTTPS");
  if (parsedBaseUrl.pathname !== "/" || parsedBaseUrl.search || parsedBaseUrl.hash) errors.push("APP_BASE_URL must be the public origin without a path, query, or fragment");
  if (parsedBaseUrl.hostname.endsWith(".example") || parsedBaseUrl.hostname === "localhost") errors.push("APP_BASE_URL still uses a non-production hostname");
} catch {
  errors.push("APP_BASE_URL must be a valid absolute URL");
}
const independentSecrets = [postgresPassword, redisPassword, authSecret, pluginSecret, mfaSecret, healthcheckToken].filter(Boolean);
if (independentSecrets.length !== new Set(independentSecrets).size) errors.push("Database, Redis, authentication, plugin, MFA, and health-check secrets must all be different");
if (process.env.AUTH_COOKIE_SECURE !== "true") errors.push("AUTH_COOKIE_SECURE must be true");
if (process.env.REDIS_REQUIRED !== "true") errors.push("REDIS_REQUIRED must be true");
if (process.env.PAYMENTS_ENABLED !== "false") errors.push("PAYMENTS_ENABLED must remain false until a real provider is integrated and audited");
if (!path.isAbsolute(mediaRoot)) errors.push("MEDIA_ROOT must be an absolute path");
if (!process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.includes("@")) errors.push("NEXT_PUBLIC_PRIVACY_EMAIL must be a valid contact address");
if (!process.env.NEXT_PUBLIC_LEGAL_NAME?.trim()) errors.push("NEXT_PUBLIC_LEGAL_NAME is required");
if (process.env.EMAIL_REQUIRED !== "true") errors.push("EMAIL_REQUIRED must be true for public production");
if (!process.env.SMTP_URL?.trim()) errors.push("SMTP_URL is required for verification and password recovery email");
else {
  try {
    const smtpUrl = new URL(process.env.SMTP_URL);
    if (!["smtp:", "smtps:"].includes(smtpUrl.protocol)) errors.push("SMTP_URL must use smtp:// or smtps://");
    if (smtpUrl.hostname.endsWith(".invalid") || smtpUrl.hostname.endsWith(".example") || smtpUrl.hostname === "localhost") {
      errors.push("SMTP_URL still uses a non-production hostname");
    }
    if (!smtpUrl.username || !smtpUrl.password) errors.push("SMTP_URL must include authenticated provider credentials");
    if (/replace|example|changeme|your[_-]/i.test(smtpUrl.password)) errors.push("SMTP_URL still contains a placeholder password");
    if (smtpUrl.hostname === "smtp.resend.com") {
      if (smtpUrl.username !== "resend") errors.push("Resend SMTP_URL username must be resend");
      const port = smtpUrl.port || (smtpUrl.protocol === "smtps:" ? "465" : "587");
      const allowedPorts = smtpUrl.protocol === "smtps:" ? ["465", "2465"] : ["25", "587", "2587"];
      if (!allowedPorts.includes(port)) errors.push(`Port ${port} does not match the selected Resend SMTP security mode`);
    }
  } catch {
    errors.push("SMTP_URL must be a valid URL");
  }
}
if (!process.env.EMAIL_FROM?.includes("@")) errors.push("EMAIL_FROM must contain the verified sender address");
if (process.env.ADMIN_2FA_REQUIRED !== "true") errors.push("ADMIN_2FA_REQUIRED must be true for production administrators");
if (process.env.NEXT_PUBLIC_DISCORD_URL && !process.env.NEXT_PUBLIC_DISCORD_URL.startsWith("https://")) errors.push("NEXT_PUBLIC_DISCORD_URL must use HTTPS");
const poolMaximum = Number(process.env.DATABASE_POOL_MAX || 0);
if (!Number.isInteger(poolMaximum) || poolMaximum < 5 || poolMaximum > 50) errors.push("DATABASE_POOL_MAX must be an integer between 5 and 50");
if (!process.env.BACKUP_AGE_RECIPIENT?.trim()) warnings.push("BACKUP_AGE_RECIPIENT is not set; backups will not be encrypted by the supplied backup script");
if (!process.env.BACKUP_REMOTE?.trim()) warnings.push("BACKUP_REMOTE is not set; backups will remain on the VPS unless another off-site process copies them");
if (!process.env.ALERT_WEBHOOK_URL?.trim()) warnings.push("ALERT_WEBHOOK_URL is not set; external health alerts still need to be configured");

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors, warnings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, warnings }, null, 2));

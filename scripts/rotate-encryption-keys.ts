import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { createScriptPrisma } from "./database-client";

const keySchema = z.string().min(48).max(512);
const inputSchema = z.object({
  oldPluginKey: keySchema,
  newPluginKey: keySchema,
  oldMfaKey: keySchema,
  newMfaKey: keySchema
}).strict();

type RotationInput = z.infer<typeof inputSchema>;
type Prefix = "enc:v1" | "mfa:v1";

function keyBytes(source: string) {
  return crypto.createHash("sha256").update(source).digest();
}

function decrypt(value: string, source: string, prefix: Prefix) {
  const parts = value.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== prefix) {
    throw new Error(`Stored ${prefix} credential is malformed`);
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBytes(source), Buffer.from(parts[2], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[4], "base64url")), decipher.final()]).toString("utf8");
}

function encrypt(value: string, source: string, prefix: Prefix) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes(source), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [prefix, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

function selectedKeys(input: RotationInput, reverse: boolean) {
  return reverse
    ? { pluginFrom: input.newPluginKey, pluginTo: input.oldPluginKey, mfaFrom: input.newMfaKey, mfaTo: input.oldMfaKey }
    : { pluginFrom: input.oldPluginKey, pluginTo: input.newPluginKey, mfaFrom: input.oldMfaKey, mfaTo: input.newMfaKey };
}

async function main() {
  const inputPath = process.argv[2];
  const reverse = process.argv[3] === "--reverse";
  if (!inputPath?.startsWith("/")) throw new Error("Pass an absolute path to the root-only rotation JSON file");

  const input = inputSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
  const distinct = new Set([input.oldPluginKey, input.newPluginKey, input.oldMfaKey, input.newMfaKey]);
  if (distinct.size !== 4) throw new Error("Old and new plugin/MFA keys must all be independent");
  const keys = selectedKeys(input, reverse);
  const prisma = createScriptPrisma();

  try {
    const [servers, administrators] = await Promise.all([
      prisma.server.findMany({ select: { id: true, pluginSecret: true } }),
      prisma.user.findMany({ where: { adminTotpSecret: { not: null } }, select: { id: true, adminTotpSecret: true } })
    ]);
    const serverUpdates = servers.map((server) => ({
      id: server.id,
      pluginSecret: encrypt(decrypt(server.pluginSecret, keys.pluginFrom, "enc:v1"), keys.pluginTo, "enc:v1")
    }));
    const administratorUpdates = administrators.map((administrator) => ({
      id: administrator.id,
      adminTotpSecret: encrypt(decrypt(administrator.adminTotpSecret!, keys.mfaFrom, "mfa:v1"), keys.mfaTo, "mfa:v1")
    }));

    await prisma.$transaction(async (transaction) => {
      for (const update of serverUpdates) {
        await transaction.server.update({ where: { id: update.id }, data: { pluginSecret: update.pluginSecret } });
      }
      for (const update of administratorUpdates) {
        await transaction.user.update({ where: { id: update.id }, data: { adminTotpSecret: update.adminTotpSecret } });
      }
    });

    console.log(JSON.stringify({
      ok: true,
      direction: reverse ? "rollback" : "forward",
      pluginCredentialsRotated: serverUpdates.length,
      administratorMfaCredentialsRotated: administratorUpdates.length
    }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Encryption-key rotation failed");
  process.exitCode = 1;
});

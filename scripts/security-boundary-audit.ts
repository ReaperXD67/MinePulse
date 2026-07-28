import crypto from "node:crypto";
import path from "node:path";
import { rm } from "node:fs/promises";
import { request, type APIRequestContext, type APIResponse } from "playwright";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";
import sharp from "sharp";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./prisma/dev.db" });
const prisma = new PrismaClient({ adapter });
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const ownerEmail = `security-owner-${stamp}@example.test`;
const secondEmail = `security-second-${stamp}@example.test`;
const password = `Security!Audit!Passphrase!${stamp}`;
const auditAddress = `2001:db8::${crypto.randomBytes(8).toString("hex")}`;
let serverId = "";
let ownerId = "";
let uploadedPath = "";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function body(response: APIResponse) {
  return response.json().catch(() => ({}));
}

async function register(context: APIRequestContext, email: string, username: string) {
  const response = await context.post("/api/auth/register", { data: { email, username, password } });
  const payload = await body(response);
  assert(response.ok(), `Registration failed (${response.status()}): ${JSON.stringify(payload)}`);
  return payload.user.id as string;
}

function serverPayload(host: string, overrides: Record<string, unknown> = {}) {
  return {
    name: `Security Audit ${stamp}`,
    host,
    port: 25565,
    minVersion: "1.20.6",
    maxVersion: "1.21.11",
    region: "GLOBAL",
    tags: "Survival,Audit",
    description: "A temporary listing for strict security-boundary verification.",
    longDescription: "",
    rules: "",
    galleryImages: "",
    websiteUrl: "",
    discordUrl: "",
    supportUrl: "",
    rewardRatePerSecond: 1,
    maxPaidPlayers: 20,
    minPlaySecondsForComment: 1800,
    ...overrides
  };
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function pluginConfig(secret: string) {
  const path = "/api/plugin/config";
  const payload = JSON.stringify({ serverId, pluginVersion: "0.6.0-audit" });
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const canonical = ["POST", path, serverId, timestamp, nonce, sha256(payload)].join("\n");
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-karixmc-protocol": "2",
      "x-karixmc-server-id": serverId,
      "x-karixmc-timestamp": String(timestamp),
      "x-karixmc-nonce": nonce,
      "x-karixmc-signature": crypto.createHmac("sha256", secret).update(canonical).digest("hex")
    },
    body: payload
  });
}

async function main() {
  const contextOptions = { baseURL: baseUrl, extraHTTPHeaders: { "x-forwarded-for": auditAddress } };
  const owner = await request.newContext(contextOptions);
  const second = await request.newContext(contextOptions);
  const anonymous = await request.newContext(contextOptions);
  try {
    ownerId = await register(owner, ownerEmail, "Security Owner");
    await register(second, secondEmail, "Security Second");

    const unauthorized = await anonymous.post("/api/owner/servers", { data: serverPayload(`${stamp}.anonymous.test`) });
    assert(unauthorized.status() === 401, `Anonymous server creation returned ${unauthorized.status()}`);

    const invalidRegion = await owner.post("/api/owner/servers", {
      data: serverPayload(`${stamp}.region.test`, { region: "arbitrary-text" })
    });
    assert(invalidRegion.status() === 400, `Free-text region returned ${invalidRegion.status()}`);

    const invalidVersion = await owner.post("/api/owner/servers", {
      data: serverPayload(`${stamp}.version.test`, { minVersion: "anything", maxVersion: "anything" })
    });
    assert(invalidVersion.status() === 400, `Free-text version returned ${invalidVersion.status()}`);

    const remoteMedia = await owner.post("/api/owner/servers", {
      data: serverPayload(`${stamp}.media.test`, { galleryImages: "https://untrusted.example/tracker.jpg" })
    });
    assert(remoteMedia.status() === 400, `Remote gallery media returned ${remoteMedia.status()}`);

    const created = await owner.post("/api/owner/servers", { data: serverPayload(`${stamp}.example.test`) });
    const createdBody = await body(created);
    assert(created.ok(), `Server creation failed (${created.status()}): ${JSON.stringify(createdBody)}`);
    serverId = createdBody.serverId;
    const firstSecret = createdBody.pluginSecret as string;
    assert(firstSecret?.length >= 40, "One-time plugin secret was not returned at creation");

    const stored = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    assert(stored.pluginSecret.startsWith("enc:v1:"), "Plugin secret is not encrypted at rest");
    assert(!stored.pluginSecret.includes(firstSecret), "Raw plugin secret appears in encrypted storage");

    const account = await owner.get("/account");
    const accountHtml = await account.text();
    assert(account.ok(), `Account failed with ${account.status()}`);
    assert(!accountHtml.includes(firstSecret) && !accountHtml.includes(stored.pluginSecret), "Plugin secret leaked into account HTML");

    const duplicate = await second.post("/api/owner/servers", { data: serverPayload(`${stamp}.example.test`) });
    assert(duplicate.status() === 409, `Second owner duplicated host and port with status ${duplicate.status()}`);

    const unsafeEvidence = await second.post(`/api/servers/${serverId}/report`, {
      data: {
        reason: "OTHER",
        details: "This intentionally tests rejection of a dangerous evidence protocol.",
        evidenceUrl: "javascript:alert(document.domain)"
      }
    });
    assert(unsafeEvidence.status() === 400, `Unsafe evidence URL returned ${unsafeEvidence.status()}`);

    const unsafeCommand = await owner.post("/api/owner/items", {
      data: { serverId, name: "Unsafe item", description: "Contains a control character.", pricePoints: 100, command: "say ok\nop @a", requiresOnline: true }
    });
    assert(unsafeCommand.status() === 400, `Newline command returned ${unsafeCommand.status()}`);

    const untargetedCommand = await owner.post("/api/owner/items", {
      data: { serverId, name: "Untargeted item", description: "Has no buyer placeholder.", pricePoints: 100, command: "say reward delivered", requiresOnline: true }
    });
    assert(untargetedCommand.status() === 400, `Untargeted command returned ${untargetedCommand.status()}`);

    const safeCommand = await owner.post("/api/owner/items", {
      data: { serverId, name: "Safe rank", description: "A buyer-targeted rank delivery.", pricePoints: 100, command: "lp user {player} parent add vip", requiresOnline: true }
    });
    assert(safeCommand.ok(), `Valid reward command failed with ${safeCommand.status()}`);

    const forgedProfile = await owner.patch("/api/account/profile", {
      data: { username: "Security Owner", minecraftName: "ForgedIdentity", friendsPrivate: false, bio: "", avatarUrl: "" }
    });
    assert(forgedProfile.ok(), `Profile update failed with ${forgedProfile.status()}`);
    const profile = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    assert(profile.minecraftName === null, "Website profile edit forged a linked Minecraft identity");

    const remoteAvatar = await owner.patch("/api/account/profile", {
      data: { username: "Security Owner", friendsPrivate: false, bio: "", avatarUrl: "https://untrusted.example/tracker.png" }
    });
    assert(remoteAvatar.status() === 400, `Remote avatar returned ${remoteAvatar.status()}`);

    const badUpload = await owner.post("/api/account/media", {
      multipart: { image: { name: "not-image.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image") } }
    });
    assert(badUpload.status() === 400, `Malformed image upload returned ${badUpload.status()}`);

    const oversizedUpload = await owner.post("/api/account/media", {
      multipart: { image: { name: "oversized.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(5 * 1024 * 1024) } }
    });
    assert(oversizedUpload.status() === 413, `Oversized image upload returned ${oversizedUpload.status()}`);

    const sourceImage = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 72, g: 227, b: 255, alpha: 1 } }
    }).withExif({ IFD0: { Copyright: "must be removed" } }).png().toBuffer();
    const validUpload = await owner.post("/api/account/media", {
      multipart: { image: { name: "avatar.png", mimeType: "image/png", buffer: sourceImage } }
    });
    const validUploadBody = await body(validUpload);
    assert(validUpload.ok() && /^\/uploads\/[a-z0-9_-]+\/[a-f0-9-]{36}\.png$/i.test(validUploadBody.url || ""), `Valid image upload failed (${validUpload.status()})`);
    uploadedPath = path.join(process.cwd(), "public", validUploadBody.url.replace(/^\//, ""));
    const sanitizedMetadata = await sharp(uploadedPath).metadata();
    assert(sanitizedMetadata.format === "png" && !sanitizedMetadata.exif && !sanitizedMetadata.icc, "Uploaded image metadata was not stripped");

    const initialPlugin = await pluginConfig(firstSecret);
    assert(initialPlugin.ok && initialPlugin.headers.get("x-karixmc-signature"), "Valid plugin secret did not authenticate");

    const rotated = await owner.post(`/api/owner/servers/${serverId}/plugin-secret`, { data: {} });
    const rotatedBody = await body(rotated);
    assert(rotated.ok() && rotatedBody.pluginSecret !== firstSecret, "Plugin secret did not rotate");
    const oldSecret = await pluginConfig(firstSecret);
    assert(oldSecret.status === 401, `Old plugin secret still works after rotation (${oldSecret.status})`);
    const newSecret = await pluginConfig(rotatedBody.pluginSecret);
    assert(newSecret.ok, `Rotated plugin secret failed (${newSecret.status})`);

    const home = await anonymous.get("/");
    assert(home.headers()["content-security-policy"]?.includes("img-src 'self'"), "Self-only media CSP is missing");
    assert(home.headers()["x-content-type-options"] === "nosniff", "MIME-sniffing protection is missing");

    console.log(JSON.stringify({
      ok: true,
      checks: {
        ownerAuthorization: true,
        duplicateServerOwnershipProtection: true,
        controlledRegionAndVersion: true,
        remoteMediaBlocked: true,
        remoteAvatarBlocked: true,
        imageDecoderRejectsInvalidData: true,
        oversizedImageRejectedBeforeDecode: true,
        uploadedImageReencodedWithoutMetadata: true,
        minecraftIdentityCannotBeForgedInProfile: true,
        consoleCommandValidation: true,
        unsafeEvidenceProtocolBlocked: true,
        encryptedOneTimePluginSecret: true,
        secretRotationRevokesOldCredential: true,
        secretAbsentFromHtml: true,
        browserSecurityHeaders: true
      }
    }, null, 2));
  } finally {
    await owner.dispose();
    await second.dispose();
    await anonymous.dispose();
  }
}

async function run() {
  try {
    await main();
  } finally {
    if (uploadedPath) await rm(uploadedPath, { force: true });
    if (serverId) await prisma.server.deleteMany({ where: { id: serverId } });
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, secondEmail] } } });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import crypto from "node:crypto";
import { request, type APIRequestContext, type APIResponse } from "playwright";
import { createScriptPrisma } from "./database-client";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const prisma = createScriptPrisma();
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const password = `Identity!Audit!Passphrase!${stamp}`;
const auditAddress = `2001:db8::${crypto.randomBytes(8).toString("hex")}`;
const userIds: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function body(response: APIResponse) {
  return response.json().catch(() => ({}));
}

async function register(context: APIRequestContext, suffix: string) {
  const response = await context.post("/api/auth/register", {
    data: {
      email: `minecraft-${suffix}-${stamp}@example.test`,
      username: `Minecraft ${suffix} ${stamp.slice(-6)}`,
      password
    }
  });
  const payload = await body(response);
  assert(response.ok(), `Registration failed (${response.status()}): ${JSON.stringify(payload)}`);
  userIds.push(payload.user.id);
  return payload.user.id as string;
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

async function signedPluginPost(serverId: string, secret: string, path: string, payload: unknown) {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const canonical = ["POST", path, serverId, timestamp, nonce, sha256(rawBody)].join("\n");

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
    body: rawBody
  });
}

async function main() {
  const options = { baseURL: baseUrl, extraHTTPHeaders: { "x-forwarded-for": auditAddress } };
  const member = await request.newContext(options);
  const secondMember = await request.newContext(options);
  const admin = await request.newContext(options);

  try {
    const server = await prisma.server.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
    assert(server, "The unlink audit requires one active seeded server");

    const memberId = await register(member, "self");
    const memberUuid = crypto.randomUUID();
    await prisma.user.update({
      where: { id: memberId },
      data: {
        minecraftUuid: memberUuid,
        minecraftName: "UnlinkAuditSelf",
        minecraftLinkedAt: new Date(),
        minecraftConsentVersion: "2026-07-28"
      }
    });
    await prisma.minecraftLinkCode.create({
      data: { code: `A${crypto.randomBytes(5).toString("hex").toUpperCase()}`, userId: memberId, expiresAt: new Date(Date.now() + 600_000) }
    });
    const session = await prisma.serverSession.create({
      data: { serverId: server.id, userId: memberId, minecraftName: "UnlinkAuditSelf", status: "ACTIVE" }
    });

    const selfUnlink = await member.delete("/api/account/minecraft-link");
    const selfBody = await body(selfUnlink);
    assert(selfUnlink.ok(), `Self-unlink failed (${selfUnlink.status()}): ${JSON.stringify(selfBody)}`);
    const selfAfter = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    assert(!selfAfter.minecraftUuid && !selfAfter.minecraftName && !selfAfter.minecraftLinkedAt && !selfAfter.minecraftConsentVersion, "Self-unlink left Minecraft identity data behind");
    const closedSession = await prisma.serverSession.findUniqueOrThrow({ where: { id: session.id } });
    assert(closedSession.status === "CLOSED" && closedSession.endedAt, "Self-unlink did not close the active reward session");
    assert(await prisma.minecraftLinkCode.count({ where: { userId: memberId } }) === 0, "Self-unlink did not invalidate pending link codes");

    const targetId = await register(secondMember, "admin-target");
    const targetUuid = crypto.randomUUID();
    await prisma.user.update({
      where: { id: targetId },
      data: {
        minecraftUuid: targetUuid,
        minecraftName: "UnlinkAuditAdmin",
        minecraftLinkedAt: new Date(),
        minecraftConsentVersion: "2026-07-28"
      }
    });

    const pluginServer = await member.post("/api/owner/servers", {
      data: {
        name: `Identity conflict ${stamp}`,
        host: `${stamp}.identity.example.test`,
        port: 25565,
        version: "1.21.11",
        region: "EU",
        tags: "SMP,Testing",
        description: "A temporary server for the Minecraft identity conflict audit.",
        longDescription: "",
        rules: "",
        galleryImages: "",
        bannerImage: "/voxel-network.png",
        rewardRatePerSecond: 1,
        maxPaidPlayers: 20,
        minPlaySecondsForComment: 1800
      }
    });
    const pluginServerBody = await body(pluginServer);
    assert(pluginServer.ok(), `Plugin audit server creation failed (${pluginServer.status()}): ${JSON.stringify(pluginServerBody)}`);
    const pluginServerId = String(pluginServerBody.serverId || "");
    const pluginSecret = String(pluginServerBody.pluginSecret || "");
    assert(pluginServerId && pluginSecret, "Plugin audit server did not return one-time credentials");

    const pendingLink = await member.post("/api/account/minecraft-link");
    const pendingLinkBody = await body(pendingLink);
    assert(pendingLink.ok() && pendingLinkBody.code, `Could not create a pending link code: ${JSON.stringify(pendingLinkBody)}`);
    const conflictResponse = await signedPluginPost(pluginServerId, pluginSecret, "/api/plugin/link", {
      serverId: pluginServerId,
      code: pendingLinkBody.code,
      minecraftUuid: targetUuid,
      minecraftName: "UnlinkAuditAdmin",
      consentVersion: "2026-07-28"
    });
    const conflictBody = await conflictResponse.json().catch(() => ({})) as { error?: string };
    assert(conflictResponse.status === 409, `Linked identity conflict returned ${conflictResponse.status} instead of 409`);
    assert(conflictBody.error?.includes("linked to another website account"), `Conflict did not explain the account link: ${JSON.stringify(conflictBody)}`);
    assert(conflictBody.error?.includes("New servers do not reset player links"), `Conflict implied that a new server resets identity links: ${JSON.stringify(conflictBody)}`);

    const forbidden = await member.delete(`/api/admin/users/${targetId}/minecraft-link`);
    assert(forbidden.status() === 403, `Member used the admin reset endpoint with status ${forbidden.status()}`);

    const adminLogin = await admin.post("/api/auth/login", {
      data: { email: "admin@minepulse.local", password: "admin123" }
    });
    assert(adminLogin.ok(), `Seed admin login failed with ${adminLogin.status()}`);
    const adminReset = await admin.delete(`/api/admin/users/${targetId}/minecraft-link`);
    const adminBody = await body(adminReset);
    assert(adminReset.ok(), `Admin unlink failed (${adminReset.status()}): ${JSON.stringify(adminBody)}`);
    const targetAfter = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
    assert(!targetAfter.minecraftUuid && !targetAfter.minecraftName, "Admin unlink left the target Minecraft identity attached");

    console.log(JSON.stringify({
      ok: true,
      checks: {
        selfUnlink: true,
        activeSessionsClosed: true,
        pendingCodesInvalidated: true,
        linkedIdentityConflictExplained: true,
        newServerIdentityScopeExplained: true,
        adminAuthorizationRequired: true,
        adminTargetedReset: true
      }
    }, null, 2));
  } finally {
    await member.dispose();
    await secondMember.dispose();
    await admin.dispose();
  }
}

async function run() {
  try {
    await main();
  } finally {
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

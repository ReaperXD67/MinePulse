import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { chromium, request, type APIResponse } from "playwright";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "../lib/generated/prisma/client";
import { protectPluginSecret } from "../lib/plugin-credentials";

loadEnvConfig(process.cwd());

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./prisma/dev.db" })
});
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const password = `Karix!Ban!Audit!${stamp}`;
const secret = crypto.randomBytes(32).toString("hex");
const minecraftUuid = crypto.randomUUID();
const ids: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(response: APIResponse) {
  return response.json().catch(() => ({}));
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

async function signedHeartbeat(serverId: string) {
  const path = "/api/plugin/heartbeat";
  const body = JSON.stringify({
    serverId,
    minecraftUuid,
    minecraftName: "BanAuditPlayer",
    afk: false,
    movementScore: 1000,
    activityEvents: 2,
    reportedSeconds: 20,
    pluginVersion: "0.6.0-ban-audit"
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const canonical = ["POST", path, serverId, timestamp, nonce, sha256(body)].join("\n");
  const signature = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-karixmc-protocol": "2",
      "x-karixmc-server-id": serverId,
      "x-karixmc-timestamp": String(timestamp),
      "x-karixmc-nonce": nonce,
      "x-karixmc-signature": signature
    },
    body
  });
  return { response, body: await response.json() };
}

async function main() {
  const passwordHash = await bcrypt.hash(password, 12);
  const [admin, player, ordinary, owner, bridgeOwner, expired] = await Promise.all([
    prisma.user.create({ data: { email: `ban-admin-${stamp}@example.test`, username: "Ban Audit Admin", role: "ADMIN", passwordHash } }),
    prisma.user.create({ data: { email: `ban-player-${stamp}@example.test`, username: "Ban Audit Player", passwordHash, minecraftUuid, minecraftName: "BanAuditPlayer" } }),
    prisma.user.create({ data: { email: `ban-ordinary-${stamp}@example.test`, username: "Ban Audit Ordinary", passwordHash } }),
    prisma.user.create({ data: { email: `ban-owner-${stamp}@example.test`, username: "Ban Audit Owner", role: "OWNER", passwordHash } }),
    prisma.user.create({ data: { email: `ban-bridge-${stamp}@example.test`, username: "Ban Audit Bridge Owner", role: "OWNER", passwordHash } }),
    prisma.user.create({
      data: {
        email: `ban-expired-${stamp}@example.test`,
        username: "Ban Audit Expired",
        passwordHash,
        bannedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        bannedUntil: new Date(Date.now() - 60 * 60 * 1000),
        banReason: "Expired audit restriction"
      }
    })
  ]);
  ids.push(admin.id, player.id, ordinary.id, owner.id, bridgeOwner.id, expired.id);

  const rewardServer = await prisma.server.create({
    data: {
      ownerId: bridgeOwner.id,
      slug: `ban-reward-${stamp}`,
      name: "Ban Reward Audit",
      host: `reward-${stamp}.example.test`,
      port: 25565,
      version: "1.21.11",
      description: "Verifies that suspended accounts cannot earn.",
      region: "GLOBAL",
      tags: "Test",
      pointPool: 1000,
      pluginSecret: protectPluginSecret(secret),
      challengeEnabled: false
    }
  });
  const ownerServer = await prisma.server.create({
    data: {
      ownerId: owner.id,
      slug: `ban-owner-${stamp}`,
      name: "Banned Owner Audit",
      host: `owner-${stamp}.example.test`,
      port: 25565,
      version: "1.21.11",
      description: "Verifies that a banned owner's server is paused.",
      region: "GLOBAL",
      tags: "Test",
      pointPool: 1000,
      pluginSecret: protectPluginSecret(crypto.randomBytes(32).toString("hex"))
    }
  });
  await prisma.serverSession.create({
    data: { serverId: ownerServer.id, userId: ordinary.id, minecraftName: "AuditGuest" }
  });

  const adminClient = await request.newContext({ baseURL: baseUrl });
  const playerClient = await request.newContext({ baseURL: baseUrl });
  const ordinaryClient = await request.newContext({ baseURL: baseUrl });
  const ownerClient = await request.newContext({ baseURL: baseUrl });
  const expiredClient = await request.newContext({ baseURL: baseUrl });

  try {
    for (const [client, email] of [
      [adminClient, admin.email],
      [playerClient, player.email],
      [ordinaryClient, ordinary.email],
      [ownerClient, owner.email]
    ] as const) {
      const login = await client.post("/api/auth/login", { data: { email, password } });
      assert(login.ok(), `Initial login failed for ${email}: ${login.status()} ${JSON.stringify(await json(login))}`);
    }

    const unauthorized = await ordinaryClient.post(`/api/admin/users/${player.id}/ban`, {
      data: { reason: "Unauthorized moderation attempt", durationHours: 24 }
    });
    assert(unauthorized.status() === 403, `Non-admin ban returned ${unauthorized.status()}`);

    const selfBan = await adminClient.post(`/api/admin/users/${admin.id}/ban`, {
      data: { reason: "Self-lockout test", durationHours: null }
    });
    assert(selfBan.status() === 400, `Admin self-ban returned ${selfBan.status()}`);

    const banPlayer = await adminClient.post(`/api/admin/users/${player.id}/ban`, {
      data: { reason: "Automated reward suspension audit", durationHours: 168 }
    });
    const banPlayerBody = await json(banPlayer);
    assert(banPlayer.ok() && banPlayerBody.account?.banActive, `Player ban failed: ${banPlayer.status()} ${JSON.stringify(banPlayerBody)}`);

    const revokedAccess = await playerClient.get("/api/account/sessions");
    assert(revokedAccess.status() === 401, "A banned player's existing browser session remained active");

    const blockedLogin = await playerClient.post("/api/auth/login", { data: { email: player.email, password } });
    const blockedLoginBody = await json(blockedLogin);
    assert(blockedLogin.status() === 403 && blockedLoginBody.code === "ACCOUNT_BANNED", "A banned player could log in");

    const poolBefore = (await prisma.server.findUniqueOrThrow({ where: { id: rewardServer.id } })).pointPool;
    const heartbeat = await signedHeartbeat(rewardServer.id);
    assert(heartbeat.response.ok && heartbeat.body.rewardState === "ACCOUNT_BANNED", `Banned heartbeat was not safely paused: ${JSON.stringify(heartbeat.body)}`);
    assert(heartbeat.body.earned === 0, "A banned player earned heartbeat points");
    const poolAfter = (await prisma.server.findUniqueOrThrow({ where: { id: rewardServer.id } })).pointPool;
    assert(poolAfter === poolBefore, "A banned heartbeat consumed campaign credits");

    const search = await adminClient.get(`/api/admin/users/search?q=${encodeURIComponent(player.email)}`);
    const searchBody = await json(search);
    assert(search.ok() && searchBody.accounts?.[0]?.banActive, "Admin search did not expose the active ban state");

    const unbanPlayer = await adminClient.delete(`/api/admin/users/${player.id}/ban`, {
      data: { reason: "Automated suspension audit completed" }
    });
    assert(unbanPlayer.ok(), `Player unban failed: ${unbanPlayer.status()} ${JSON.stringify(await json(unbanPlayer))}`);
    const restoredLogin = await playerClient.post("/api/auth/login", { data: { email: player.email, password } });
    assert(restoredLogin.ok(), "An unbanned player could not log in");

    const browser = await chromium.launch({ headless: true });
    try {
      const browserContext = await browser.newContext({
        storageState: await adminClient.storageState(),
        viewport: { width: 1440, height: 1000 }
      });
      const page = await browserContext.newPage();
      const browserErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(message.text());
      });
      page.on("pageerror", (error) => browserErrors.push(error.message));

      await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
      const accessPanel = page.locator("#account-access");
      await accessPanel.getByRole("searchbox", { name: "Search account to ban or unban" }).fill(player.email);
      await accessPanel.getByRole("option").first().click();
      assert(await accessPanel.getByRole("button", { name: "Ban account" }).isVisible(), "Ban control is not reachable in the admin UI");

      await page.setViewportSize({ width: 390, height: 844 });
      assert(await accessPanel.getByRole("button", { name: "Ban account" }).isVisible(), "Ban control disappeared on mobile");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      assert(!overflow, "Account moderation panel causes horizontal mobile overflow");
      assert(browserErrors.length === 0, `Admin moderation UI emitted browser errors: ${browserErrors.join(" | ")}`);
      await browserContext.close();
    } finally {
      await browser.close();
    }

    const banOwner = await adminClient.post(`/api/admin/users/${owner.id}/ban`, {
      data: { reason: "Automated owner safety audit", durationHours: null }
    });
    const banOwnerBody = await json(banOwner);
    assert(banOwner.ok() && banOwnerBody.pausedServers === 1, `Owner ban did not pause one active server: ${JSON.stringify(banOwnerBody)}`);
    const pausedServer = await prisma.server.findUniqueOrThrow({ where: { id: ownerServer.id } });
    assert(pausedServer.status === "PAUSED", "Banned owner's server remained active");
    const closedSessions = await prisma.serverSession.count({ where: { serverId: ownerServer.id, status: "ACTIVE" } });
    assert(closedSessions === 0, "Active sessions on a banned owner's server remained open");
    const revokedOwner = await ownerClient.get("/api/account/sessions");
    assert(revokedOwner.status() === 401, "Banned owner's browser session remained active");

    const unbanOwner = await adminClient.delete(`/api/admin/users/${owner.id}/ban`, {
      data: { reason: "Owner audit completed; server requires review" }
    });
    assert(unbanOwner.ok(), "Owner unban failed");
    const stillPaused = await prisma.server.findUniqueOrThrow({ where: { id: ownerServer.id } });
    assert(stillPaused.status === "PAUSED", "Unbanning automatically republished an owner's server");

    const expiredLogin = await expiredClient.post("/api/auth/login", { data: { email: expired.email, password } });
    assert(expiredLogin.ok(), `Expired timed ban still blocked login: ${expiredLogin.status()} ${JSON.stringify(await json(expiredLogin))}`);
    const expiredState = await prisma.user.findUniqueOrThrow({ where: { id: expired.id } });
    assert(!expiredState.bannedAt && !expiredState.bannedUntil && !expiredState.banReason, "Expired ban state was not cleaned after login");

    const actions = await prisma.userModerationAction.findMany({ where: { userId: { in: [player.id, owner.id] } } });
    assert(actions.filter((entry) => entry.type === "BAN").length === 2, "Ban audit entries are incomplete");
    assert(actions.filter((entry) => entry.type === "UNBAN").length === 2, "Unban audit entries are incomplete");

    console.log(JSON.stringify({
      ok: true,
      checks: {
        adminAuthorization: true,
        adminLockoutPrevention: true,
        sessionRevocation: true,
        loginBlocked: true,
        pluginRewardsBlocked: true,
        campaignPoolPreserved: true,
        adminSearchStatus: true,
        adminUiDesktopAndMobile: true,
        unbanRestoresLogin: true,
        ownerServersPaused: true,
        activePlayClosed: true,
        unbanRequiresServerReview: true,
        timedBanExpiry: true,
        moderationAuditTrail: true
      }
    }, null, 2));
  } finally {
    await Promise.all([adminClient.dispose(), playerClient.dispose(), ordinaryClient.dispose(), ownerClient.dispose(), expiredClient.dispose()]);
  }
}

async function run() {
  try {
    await main();
  } finally {
    if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

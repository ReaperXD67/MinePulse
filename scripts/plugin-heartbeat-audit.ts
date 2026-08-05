import crypto from "node:crypto";
import { createScriptPrisma } from "./database-client";
import { protectPluginSecret } from "../lib/plugin-credentials";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const prisma = createScriptPrisma();
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const serverId = `heartbeat-audit-${stamp}`;
const ownerEmail = `heartbeat-owner-${stamp}@example.test`;
const playerEmail = `heartbeat-player-${stamp}@example.test`;
const blockerEmail = `heartbeat-blocker-${stamp}@example.test`;
const playerUuid = crypto.randomUUID();
const secret = crypto.randomBytes(32).toString("hex");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function requestSignature(path: string, timestamp: number, nonce: string, body: string, key = secret) {
  const canonical = ["POST", path, serverId, timestamp, nonce, sha256(body)].join("\n");
  return crypto.createHmac("sha256", key).update(canonical).digest("hex");
}

function verifyResponse(response: Response, requestNonce: string, body: string) {
  const timestamp = response.headers.get("x-karixmc-timestamp") || "";
  const nonce = response.headers.get("x-karixmc-nonce") || "";
  const signature = response.headers.get("x-karixmc-signature") || "";
  assert(response.headers.get("x-karixmc-protocol") === "2", "Signed response protocol header is missing");
  assert(Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) <= 90, "Signed response timestamp is stale");
  const canonical = ["RESPONSE", requestNonce, timestamp, nonce, response.status, sha256(body)].join("\n");
  const expected = crypto.createHmac("sha256", secret).update(canonical).digest();
  const received = Buffer.from(signature, "hex");
  assert(received.length === expected.length && crypto.timingSafeEqual(received, expected), "Response signature is invalid");
}

async function signedPost(path: string, payload: unknown, options: {
  nonce?: string;
  rawBody?: string;
  signBody?: string;
  key?: string;
  expectSigned?: boolean;
} = {}) {
  const body = options.rawBody ?? JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = options.nonce || crypto.randomUUID();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-karixmc-protocol": "2",
      "x-karixmc-server-id": serverId,
      "x-karixmc-timestamp": String(timestamp),
      "x-karixmc-nonce": nonce,
      "x-karixmc-signature": requestSignature(path, timestamp, nonce, options.signBody ?? body, options.key)
    },
    body
  });
  const responseBody = await response.text();
  if (options.expectSigned !== false) verifyResponse(response, nonce, responseBody);
  return { response, body: responseBody ? JSON.parse(responseBody) : {} };
}

function heartbeatPayload(overrides: Record<string, unknown> = {}) {
  return {
    serverId,
    minecraftUuid: playerUuid,
    minecraftName: "HeartbeatAudit",
    afk: false,
    movementScore: 1000,
    activityEvents: 1,
    reportedSeconds: 20,
    pluginVersion: "0.6.0-audit",
    ...overrides
  };
}

async function agePlayerSession(seconds = 20) {
  await prisma.serverSession.updateMany({
    where: { serverId, user: { minecraftUuid: playerUuid }, status: "ACTIVE" },
    data: { lastHeartbeatAt: new Date(Date.now() - seconds * 1000) }
  });
}

async function agePlayerActivity(seconds: number) {
  await prisma.serverSession.updateMany({
    where: { serverId, user: { minecraftUuid: playerUuid }, status: "ACTIVE" },
    data: { lastActivityAt: new Date(Date.now() - seconds * 1000) }
  });
}

async function main() {
  const owner = await prisma.user.create({ data: { email: ownerEmail, username: "Heartbeat Owner", passwordHash: "audit" } });
  const player = await prisma.user.create({
    data: { email: playerEmail, username: "Heartbeat Player", passwordHash: "audit", minecraftUuid: playerUuid, minecraftName: "HeartbeatAudit" }
  });
  const blocker = await prisma.user.create({ data: { email: blockerEmail, username: "Heartbeat Blocker", passwordHash: "audit" } });
  await prisma.server.create({
    data: {
      id: serverId,
      ownerId: owner.id,
      slug: serverId,
      name: "Heartbeat Audit",
      host: `${stamp}.example.test`,
      port: 25565,
      version: "1.21.11",
      description: "Temporary signed heartbeat audit server.",
      region: "GLOBAL",
      tags: "Test",
      pluginSecret: protectPluginSecret(secret),
      pointPool: 1000,
      rewardRatePerSecond: 1.5,
      maxPaidPlayers: 2,
      challengeEnabled: false
    }
  });
  await prisma.serverSession.createMany({
    data: [
      {
        serverId,
        userId: blocker.id,
        minecraftName: "SlotHolder",
        startedAt: new Date(Date.now() - 30_000),
        lastHeartbeatAt: new Date()
      },
      {
        serverId,
        userId: player.id,
        minecraftName: "HeartbeatAudit",
        startedAt: new Date(Date.now() - 20_000),
        lastHeartbeatAt: new Date(Date.now() - 20_000)
      }
    ]
  });

  const earning = await signedPost("/api/plugin/heartbeat", heartbeatPayload());
  assert(earning.response.ok, `Earning heartbeat failed: ${earning.response.status} ${JSON.stringify(earning.body)}`);
  assert(earning.body.rewardState === "EARNING" && earning.body.earned === 30, `Expected 30 EARNING points: ${JSON.stringify(earning.body)}`);

  const rapidClaim = await signedPost("/api/plugin/heartbeat", heartbeatPayload({ reportedSeconds: 60 }));
  assert(rapidClaim.response.ok && rapidClaim.body.earned === 0, "A rapid modified-plugin request claimed unelapsed time");

  await agePlayerSession();
  await prisma.server.update({ where: { id: serverId }, data: { rewardRatePerSecond: 9 } });
  const cappedRate = await signedPost("/api/plugin/heartbeat", heartbeatPayload());
  assert(cappedRate.body.earned === 60 && cappedRate.body.rewardMessage.includes("3 point(s) per second"), "Server-side reward cap failed");

  await agePlayerSession();
  await prisma.server.update({ where: { id: serverId }, data: { rewardRatePerSecond: 1.5 } });
  const quietWithinAfkWindow = await signedPost(
    "/api/plugin/heartbeat",
    heartbeatPayload({ movementScore: 0, activityEvents: 0 })
  );
  assert(
    quietWithinAfkWindow.body.rewardState === "EARNING" && quietWithinAfkWindow.body.earned === 30,
    `A quiet heartbeat inside the AFK window was incorrectly paused: ${JSON.stringify(quietWithinAfkWindow.body)}`
  );

  await agePlayerSession();
  await agePlayerActivity(301);
  const activityTimeout = await signedPost(
    "/api/plugin/heartbeat",
    heartbeatPayload({ afk: false, movementScore: 0, activityEvents: 0 })
  );
  assert(
    activityTimeout.body.rewardState === "AFK" && activityTimeout.body.earned === 0,
    `The server-side AFK window did not pause rewards: ${JSON.stringify(activityTimeout.body)}`
  );

  await agePlayerSession();
  const afk = await signedPost("/api/plugin/heartbeat", heartbeatPayload({ afk: true, movementScore: 0, activityEvents: 0 }));
  assert(afk.body.rewardState === "AFK" && afk.body.earned === 0, "AFK heartbeat earned points");

  const replayNonce = crypto.randomUUID();
  const replayPayload = heartbeatPayload({ afk: true, movementScore: 0, activityEvents: 0 });
  const firstReplayUse = await signedPost("/api/plugin/heartbeat", replayPayload, { nonce: replayNonce });
  assert(firstReplayUse.response.ok, "First nonce use failed");
  const replay = await signedPost("/api/plugin/heartbeat", replayPayload, { nonce: replayNonce, expectSigned: false });
  assert(replay.response.status === 409, `Replayed nonce returned ${replay.response.status}`);

  const validBody = JSON.stringify(heartbeatPayload());
  const tamperedBody = JSON.stringify(heartbeatPayload({ minecraftName: "TamperedName" }));
  const tampered = await signedPost("/api/plugin/heartbeat", {}, { rawBody: tamperedBody, signBody: validBody, expectSigned: false });
  assert(tampered.response.status === 401, `Tampered signed body returned ${tampered.response.status}`);

  const wrongSecret = await signedPost("/api/plugin/heartbeat", heartbeatPayload(), {
    key: crypto.randomBytes(32).toString("hex"),
    expectSigned: false
  });
  assert(wrongSecret.response.status === 401, `Wrong secret returned ${wrongSecret.response.status}`);

  await agePlayerSession();
  const batch = await signedPost("/api/plugin/heartbeat/batch", {
    serverId,
    pluginVersion: "0.6.0-audit",
    heartbeats: [{
      minecraftUuid: playerUuid,
      minecraftName: "HeartbeatAudit",
      afk: false,
      movementScore: 1000,
      activityEvents: 1,
      reportedSeconds: 20
    }]
  });
  assert(batch.response.ok && batch.body.results?.[0]?.earned === 30, `Signed batch failed: ${JSON.stringify(batch.body)}`);

  const storedSession = await prisma.serverSession.findFirstOrThrow({ where: { serverId, userId: player.id, status: "ACTIVE" } });
  const storedPlayer = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
  assert(!("ipHash" in storedSession), "Server sessions must not expose an IP field");
  assert(storedPlayer.walletPoints === 150, `Expected wallet 150, received ${storedPlayer.walletPoints}`);

  console.log(JSON.stringify({
    ok: true,
    checks: {
      signedRequestAndResponse: true,
      persistentReplayRejection: true,
      tamperRejection: true,
      wrongSecretRejection: true,
      serverElapsedTimeAuthority: true,
      rewardRateCap: true,
      quietHeartbeatGrace: true,
      serverSideAfkTimeout: true,
      afkBlocking: true,
      batchedHeartbeat: true,
      playerIpNotCollected: true,
      walletPoints: storedPlayer.walletPoints
    }
  }, null, 2));
}

async function run() {
  try {
    await main();
  } finally {
    await prisma.server.deleteMany({ where: { id: serverId } });
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, playerEmail, blockerEmail] } } });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

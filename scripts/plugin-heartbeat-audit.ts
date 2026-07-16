import crypto from "node:crypto";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db"
});
const prisma = new PrismaClient({ adapter });
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const serverId = `heartbeat-audit-${stamp}`;
const ownerEmail = `heartbeat-owner-${stamp}@example.test`;
const playerEmail = `heartbeat-player-${stamp}@example.test`;
const blockerEmail = `heartbeat-blocker-${stamp}@example.test`;
const playerUuid = crypto.randomUUID();
const secret = crypto.randomBytes(32).toString("hex");

type HeartbeatInput = {
  serverId: string;
  timestamp: number;
  nonce: string;
  minecraftUuid: string;
  minecraftName: string;
  afk: boolean;
  movementScore: number;
  activityEvents: number;
  reportedSeconds: number;
  pluginVersion: string;
};

function signaturePayload(input: HeartbeatInput) {
  return [
    input.serverId,
    input.timestamp,
    input.nonce,
    input.minecraftUuid,
    input.minecraftName,
    input.afk,
    input.movementScore,
    input.activityEvents,
    "none",
    "none",
    "none",
    input.reportedSeconds,
    input.pluginVersion
  ].join("\n");
}

async function heartbeat(overrides: Partial<HeartbeatInput>) {
  const input: HeartbeatInput = {
    serverId,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: crypto.randomUUID(),
    minecraftUuid: playerUuid,
    minecraftName: "HeartbeatAudit",
    afk: false,
    movementScore: 1000,
    activityEvents: 1,
    reportedSeconds: 20,
    pluginVersion: "0.5.1-audit",
    ...overrides
  };
  const signature = crypto.createHmac("sha256", secret).update(signaturePayload(input)).digest("hex");
  const response = await fetch(`${baseUrl}/api/plugin/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, signature, ip: "127.0.0.1" })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Heartbeat failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const owner = await prisma.user.create({
    data: { email: ownerEmail, username: "Heartbeat Owner", passwordHash: "audit" }
  });
  const player = await prisma.user.create({
    data: {
      email: playerEmail,
      username: "Heartbeat Player",
      passwordHash: "audit",
      minecraftUuid: playerUuid,
      minecraftName: "HeartbeatAudit"
    }
  });
  const blocker = await prisma.user.create({
    data: { email: blockerEmail, username: "Heartbeat Blocker", passwordHash: "audit" }
  });
  await prisma.server.create({
    data: {
      id: serverId,
      ownerId: owner.id,
      slug: serverId,
      name: "Heartbeat Audit",
      host: `${stamp}.example.test`,
      port: 25565,
      version: "1.21.x",
      description: "Temporary signed heartbeat audit server.",
      region: "TEST",
      tags: "Test",
      pluginSecret: secret,
      pointPool: 1000,
      rewardRatePerSecond: 1.5,
      maxPaidPlayers: 2,
      challengeEnabled: false
    }
  });
  const configuredServer = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  assert(
    configuredServer.rewardRatePerSecond === 1.5,
    `Audit setup stored reward rate ${configuredServer.rewardRatePerSecond} instead of 1.5`
  );
  await prisma.serverSession.create({
    data: {
      serverId,
      userId: blocker.id,
      minecraftName: "SlotHolder",
      ipHash: "audit",
      startedAt: new Date(Date.now() - 10_000)
    }
  });

  const earning = await heartbeat({});
  assert(earning.rewardState === "EARNING", `Expected EARNING, received ${earning.rewardState}`);
  assert(earning.earned === 30, `Expected 30 points, received ${JSON.stringify(earning)}`);

  const afk = await heartbeat({ afk: true, movementScore: 0, activityEvents: 0 });
  assert(afk.rewardState === "AFK", `Expected AFK, received ${afk.rewardState}`);
  assert(afk.earned === 0, `AFK heartbeat unexpectedly earned ${afk.earned}`);

  await prisma.server.update({ where: { id: serverId }, data: { pointPool: 0 } });
  const emptyPool = await heartbeat({});
  assert(emptyPool.rewardState === "EMPTY_POOL", `Expected EMPTY_POOL, received ${emptyPool.rewardState}`);
  assert(emptyPool.earned === 0, `Empty pool heartbeat unexpectedly earned ${emptyPool.earned}`);

  await prisma.server.update({
    where: { id: serverId },
    data: { pointPool: 1000, maxPaidPlayers: 1 }
  });
  const paidCap = await heartbeat({});
  assert(paidCap.rewardState === "PAID_CAP", `Expected PAID_CAP, received ${paidCap.rewardState}`);
  assert(paidCap.earned === 0, `Paid-cap heartbeat unexpectedly earned ${paidCap.earned}`);

  const storedPlayer = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
  assert(storedPlayer.walletPoints === 30, `Expected wallet balance 30, received ${storedPlayer.walletPoints}`);

  console.log(JSON.stringify({
    ok: true,
    checks: {
      earning: { state: earning.rewardState, earned: earning.earned },
      afk: { state: afk.rewardState, earned: afk.earned },
      emptyPool: { state: emptyPool.rewardState, earned: emptyPool.earned },
      paidCap: { state: paidCap.rewardState, earned: paidCap.earned },
      walletPoints: storedPlayer.walletPoints
    }
  }, null, 2));
}

async function run() {
  try {
    await main();
  } finally {
    await prisma.server.deleteMany({ where: { id: serverId } });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, playerEmail, blockerEmail] } }
    });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

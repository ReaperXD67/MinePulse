import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { getServerPresence } from "../lib/server-presence-query";
import { summarizeServerPresence } from "../lib/server-presence";

const databaseHost = new URL(process.env.DATABASE_URL || "http://missing").hostname;
assert(["localhost", "127.0.0.1", "[::1]"].includes(databaseHost), "Presence audit only runs against a local test database");
const now = Date.now();
const recent = new Date(now - 20_000);
const old = new Date(now - 10 * 60_000);
const stamp = randomUUID();
const users: string[] = [];

async function main() {
  const owner = await prisma.user.create({ data: { email: `presence-owner-${stamp}@example.test`, username: "Presence audit" } });
  users.push(owner.id);
  const serverData = {
    ownerId: owner.id, name: "Presence audit", host: "presence.example.test", version: "1.21.11",
    description: "Presence audit fixtures", region: "EU", tags: "Audit", pluginSecret: "audit-only", isOfficialShowcase: true,
    lastConfigSyncAt: recent, onlinePlayerCount: 12, onlinePlayerCountAt: recent
  };
  const server = await prisma.server.create({ data: { ...serverData, slug: `presence-${stamp}` } });
  const other = await prisma.server.create({ data: { ...serverData, host: "presence-other.example.test", slug: `presence-other-${stamp}` } });
  for (let index = 0; index < 6; index += 1) {
    const user = await prisma.user.create({ data: {
      email: `presence-${index}-${stamp}@example.test`, username: `Presence ${index}`,
      ...(index === 4 ? { bannedAt: recent } : {})
    } });
    users.push(user.id);
  }
  const [, earning, unpaid, stale, closed, banned, elsewhere] = users;
  await prisma.serverSession.createMany({ data: [
    { serverId: server.id, userId: earning, minecraftName: "Earner", lastHeartbeatAt: old, status: "CLOSED", endedAt: old, integrityVerified: true },
    { serverId: server.id, userId: earning, minecraftName: "Earner", lastHeartbeatAt: recent, integrityVerified: true },
    { serverId: server.id, userId: unpaid, minecraftName: "Unpaid", lastHeartbeatAt: recent, integrityVerified: true },
    { serverId: server.id, userId: stale, minecraftName: "Stale", lastHeartbeatAt: old, integrityVerified: true },
    { serverId: server.id, userId: closed, minecraftName: "Closed", lastHeartbeatAt: recent, status: "CLOSED", endedAt: recent, integrityVerified: true },
    { serverId: server.id, userId: banned, minecraftName: "Banned", lastHeartbeatAt: recent, integrityVerified: true },
    { serverId: other.id, userId: elsewhere, minecraftName: "Elsewhere", lastHeartbeatAt: recent, integrityVerified: true }
  ] });
  await prisma.pointLedger.createMany({ data: [
    { userId: earning, serverId: server.id, type: "PLAYER_REWARD", amountPoints: 10, createdAt: recent, note: "audit" },
    { userId: earning, serverId: server.id, type: "PLAYER_REWARD", amountPoints: 10, createdAt: recent, note: "audit duplicate reward" },
    { userId: unpaid, serverId: server.id, type: "LEVEL_REWARD", amountPoints: 10, createdAt: recent, note: "not server play earnings" },
    { userId: stale, serverId: server.id, type: "PLAYER_REWARD", amountPoints: 10, createdAt: recent, note: "no fresh session" },
    { userId: closed, serverId: server.id, type: "PLAYER_REWARD", amountPoints: 10, createdAt: recent, note: "closed session" },
    { userId: banned, serverId: server.id, type: "PLAYER_REWARD", amountPoints: 10, createdAt: recent, note: "banned account" },
    { userId: elsewhere, serverId: other.id, type: "PLAYER_REWARD", amountPoints: 10, createdAt: recent, note: "different server" }
  ] });

  const result = (await getServerPresence([server, other], now)).get(server.id)!;
  assert.equal(result.onlinePlayers, 12, "all-player count comes from plugin, independent of account linking");
  assert.equal(result.playingPlayers, 2, "fresh sessions exclude closed, stale, banned and other-server players, deduplicated by account");
  assert.equal(result.earningPlayers, 1, "recent rewards require a live session and are deduplicated; level rewards do not count");
  assert.equal(result.registeredPlayers, 5, "only distinct accounts with this server's history count as registered here");

  const counts = { registeredPlayers: 5, playingPlayers: 2, earningPlayers: 1 };
  const legacy = summarizeServerPresence({ ...server, onlinePlayerCount: null, onlinePlayerCountAt: null }, counts, now);
  assert.equal(legacy.onlineSource, "linked");
  assert.equal(legacy.onlinePlayers, 2, "old bridges expose explicitly labeled linked-player counts");
  const empty = summarizeServerPresence({ ...server, onlinePlayerCount: 0 }, { ...counts, playingPlayers: 0, earningPlayers: 0 }, now);
  assert.equal(empty.onlinePlayers, 0, "a measured zero is retained");
  const offline = summarizeServerPresence({ ...server, lastConfigSyncAt: old, lastHeartbeatAt: old }, counts, now);
  assert.equal(offline.onlinePlayers, null, "disconnection cannot masquerade as a measured zero");
  assert.equal(offline.playingPlayers, null);
  assert.equal(offline.earningPlayers, null);
  assert.equal(offline.registeredPlayers, 5, "historic membership remains available when offline");
  const staleTelemetry = summarizeServerPresence({ ...server, onlinePlayerCountAt: old }, counts, now);
  assert.equal(staleTelemetry.onlineSource, "linked", "a fresh config ping never revives an old player count");
  console.log("Presence audit passed: server-scoped totals, deduplication, rewards, expiry, legacy bridge and measured zero.");
}

main().finally(async () => {
  if (users.length) {
    await prisma.pointLedger.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
  await prisma.$disconnect();
}).catch((error) => { console.error(error); process.exitCode = 1; });

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { BRIDGE_ONLINE_WINDOW_MS } from "@/lib/server-liveness";
import { summarizeServerPresence, type PresenceServer, type ServerPresence } from "@/lib/server-presence";

export async function getServerPresence(servers: PresenceServer[], now = Date.now()) {
  const presence = new Map<string, ServerPresence>();
  if (!servers.length) return presence;
  const ids = Prisma.join(servers.map((server) => server.id));
  const cutoff = new Date(now - BRIDGE_ONLINE_WINDOW_MS);
  const counts = await prisma.$queryRaw<Array<{
    serverId: string;
    registeredPlayers: bigint;
    playingPlayers: bigint;
    earningPlayers: bigint;
  }>>(Prisma.sql`
    WITH members AS (
      SELECT s."serverId", s."userId",
        BOOL_OR(s.status = 'ACTIVE' AND s."endedAt" IS NULL
          AND s."lastHeartbeatAt" >= ${cutoff} AND s."integrityVerified"
          AND (u."bannedAt" IS NULL OR (u."bannedUntil" IS NOT NULL AND u."bannedUntil" <= ${new Date(now)}))) AS playing
      FROM "ServerSession" s JOIN "User" u ON u.id = s."userId"
      WHERE s."serverId" IN (${ids})
      GROUP BY s."serverId", s."userId"
    ), rewarded AS (
      SELECT DISTINCT "serverId", "userId" FROM "PointLedger"
      WHERE "serverId" IN (${ids}) AND type = 'PLAYER_REWARD'
        AND "amountPoints" > 0 AND "createdAt" >= ${cutoff}
    )
    SELECT m."serverId", COUNT(*) AS "registeredPlayers",
      COUNT(*) FILTER (WHERE m.playing) AS "playingPlayers",
      COUNT(*) FILTER (WHERE m.playing AND r."userId" IS NOT NULL) AS "earningPlayers"
    FROM members m LEFT JOIN rewarded r ON r."serverId" = m."serverId" AND r."userId" = m."userId"
    GROUP BY m."serverId"
  `);
  const byServer = new Map(counts.map((row) => [row.serverId, row]));
  for (const server of servers) {
    const row = byServer.get(server.id);
    presence.set(server.id, summarizeServerPresence(server, {
      registeredPlayers: Number(row?.registeredPlayers ?? 0),
      playingPlayers: Number(row?.playingPlayers ?? 0),
      earningPlayers: Number(row?.earningPlayers ?? 0)
    }, now));
  }
  return presence;
}

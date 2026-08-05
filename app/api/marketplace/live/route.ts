import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bridgeIsOnline } from "@/lib/server-liveness";
import { readSharedJson, writeSharedJson } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cachedResult: { expiresAt: number; serverIds: string[] } | null = null;

async function liveServerIds(now: number) {
  if (cachedResult && cachedResult.expiresAt > now) return cachedResult.serverIds;
  const shared = await readSharedJson<string[]>("marketplace:live-server-ids");
  if (shared) {
    cachedResult = { expiresAt: now + 2_000, serverIds: shared };
    return shared;
  }

  const servers = await prisma.server.findMany({
    where: {
      status: "ACTIVE",
      trustStatus: { in: ["VERIFIED", "WATCHLIST"] },
      pointPool: { gt: 0 }
    },
    select: { id: true, lastHeartbeatAt: true, lastConfigSyncAt: true }
  });
  const serverIds = servers
    .filter((server) => bridgeIsOnline(server, now))
    .map((server) => server.id)
    .sort();

  cachedResult = { expiresAt: now + 5_000, serverIds };
  await writeSharedJson("marketplace:live-server-ids", serverIds, 5);
  return serverIds;
}

export async function GET() {
  const now = Date.now();
  return NextResponse.json(
    { serverIds: await liveServerIds(now), checkedAt: new Date(now).toISOString() },
    { headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=5" } }
  );
}

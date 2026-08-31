import "server-only";
import { prisma } from "@/lib/prisma";
import { activePremiumPlan } from "@/lib/premium";
import { readSharedJson, writeSharedJson } from "@/lib/redis";
import { safeMediaPath } from "@/lib/server-profile";
import { bridgeStateAt } from "@/lib/server-liveness";

type MarketplaceSnapshot = Awaited<ReturnType<typeof createMarketplaceSnapshot>>;

let localSnapshot: { expiresAt: number; value: MarketplaceSnapshot } | null = null;

async function createMarketplaceSnapshot() {
  const now = new Date();
  const [servers, usersCount, pools, purchaseCount, playtime, pointPackages, premiumTiers] = await Promise.all([
    prisma.server.findMany({
      where: {
        status: "ACTIVE",
        trustStatus: { in: ["VERIFIED", "WATCHLIST"] },
        pointPool: { gt: 0 }
      },
      select: {
        id: true,
        slug: true,
        name: true,
        host: true,
        port: true,
        version: true,
        region: true,
        tags: true,
        description: true,
        bannerImage: true,
        isOfficialShowcase: true,
        pointPool: true,
        rewardRatePerSecond: true,
        maxPaidPlayers: true,
        premiumPlan: true,
        premiumUntil: true,
        trustStatus: true,
        lastHeartbeatAt: true,
        lastConfigSyncAt: true,
        items: {
          where: { status: "ACTIVE" },
          orderBy: { pricePoints: "asc" },
          take: 3,
          select: { id: true, name: true, description: true, pricePoints: true }
        },
        hourlyStats: {
          orderBy: { hourStart: "desc" },
          take: 1,
          select: { sampleCount: true, onlinePlayerTotal: true }
        },
        _count: { select: { likes: true, favorites: true, comments: true } }
      }
    }),
    prisma.user.count({ where: { bannedAt: null } }),
    prisma.server.aggregate({
      where: { status: "ACTIVE", trustStatus: { in: ["VERIFIED", "WATCHLIST"] } },
      _sum: { pointPool: true }
    }),
    prisma.purchase.count({ where: { status: "PENDING" } }),
    prisma.serverSession.aggregate({
      where: { user: { bannedAt: null }, server: { status: "ACTIVE" } },
      _sum: { activeSeconds: true }
    }),
    prisma.pointPackage.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true, points: true, priceCents: true }
    }),
    prisma.premiumTier.findMany({
      where: { active: true },
      orderBy: { priority: "desc" },
      select: { id: true, code: true, priority: true, priceCents: true, durationDays: true }
    })
  ]);

  return {
    servers: servers
      .map((server) => {
        const premiumPlan = activePremiumPlan(server.premiumPlan, server.premiumUntil, now);
        return {
          id: server.id,
          slug: server.slug,
          name: server.name,
          host: server.host,
          port: server.port,
          version: server.version,
          region: server.region,
          tags: server.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          description: server.description,
          bannerImage: safeMediaPath(server.bannerImage) || "/voxel-network.png",
          isOfficialShowcase: server.isOfficialShowcase,
          pointPool: server.pointPool,
          rewardRatePerSecond: server.rewardRatePerSecond,
          maxPaidPlayers: server.maxPaidPlayers,
          averageOnline: server.hourlyStats[0]?.sampleCount
            ? Math.round(server.hourlyStats[0].onlinePlayerTotal / server.hourlyStats[0].sampleCount)
            : 0,
          premiumPlan,
          premiumUntil: premiumPlan === "NONE" ? null : server.premiumUntil?.toISOString() ?? null,
          trustStatus: server.trustStatus,
          bridgeState: bridgeStateAt(server, now.getTime()),
          likes: server._count.likes,
          favorites: server._count.favorites,
          comments: server._count.comments,
          items: server.items
        };
      })
      .filter((server) => server.bridgeState === "online"),
    platform: {
      usersCount,
      pointPool: pools._sum.pointPool ?? 0,
      pendingPurchases: purchaseCount,
      activeSeconds: playtime._sum.activeSeconds ?? 0
    },
    pointPackages,
    premiumTiers
  };
}

export async function getMarketplaceSnapshot() {
  const now = Date.now();
  if (localSnapshot && localSnapshot.expiresAt > now) return localSnapshot.value;

  const shared = await readSharedJson<MarketplaceSnapshot>("marketplace:snapshot:v2");
  if (shared) {
    localSnapshot = { expiresAt: now + 2_000, value: shared };
    return shared;
  }

  const value = await createMarketplaceSnapshot();
  localSnapshot = { expiresAt: now + 5_000, value };
  await writeSharedJson("marketplace:snapshot:v2", value, 5);
  return value;
}

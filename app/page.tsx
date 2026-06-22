import { Coins, Crosshair, RadioTower, RefreshCw, Server, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import Link from "next/link";
import { ServerCard, type MarketplaceServer } from "@/components/ServerCard";
import { VoxelHeroScene } from "@/components/VoxelHeroScene";
import { currentUser } from "@/lib/auth";
import { compact, money, points } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { shuffle } from "@/lib/random";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const user = await currentUser();
  const now = new Date();

  const [servers, platform, pointPackages, premiumTiers] = await Promise.all([
    prisma.server.findMany({
      where: {
        status: "ACTIVE",
        trustStatus: { in: ["VERIFIED", "WATCHLIST"] },
        pointPool: { gt: 0 }
      },
      include: {
        items: {
          where: { status: "ACTIVE" },
          orderBy: { pricePoints: "asc" },
          take: 3
        },
        _count: {
          select: {
            likes: true,
            favorites: true,
            comments: true
          }
        },
        likes: { where: { userId: user?.id || "__guest__" } },
        favorites: { where: { userId: user?.id || "__guest__" } }
      }
    }),
    Promise.all([
      prisma.user.count(),
      prisma.server.aggregate({ _sum: { pointPool: true } }),
      prisma.purchase.count(),
      prisma.serverSession.aggregate({ _sum: { activeSeconds: true } })
    ]),
    prisma.pointPackage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.premiumTier.findMany({ where: { active: true }, orderBy: { priority: "desc" } })
  ]);

  const visibleServers = servers.map<MarketplaceServer>((server) => ({
    id: server.id,
    slug: server.slug,
    name: server.name,
    host: server.host,
    port: server.port,
    version: server.version,
    region: server.region,
    tags: server.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    description: server.description,
    bannerImage: server.bannerImage || "/voxel-network.png",
    pointPool: server.pointPool,
    rewardRatePerSecond: server.rewardRatePerSecond,
    maxPaidPlayers: server.maxPaidPlayers,
    premiumPlan: server.premiumPlan,
    premiumUntil: server.premiumUntil?.toISOString() ?? null,
    trustStatus: server.trustStatus,
    bridgeState: !server.lastHeartbeatAt
      ? "offline"
      : now.getTime() - server.lastHeartbeatAt.getTime() <= 120000
        ? "online"
        : now.getTime() - server.lastHeartbeatAt.getTime() <= 900000
          ? "stale"
          : "offline",
    likes: server._count.likes,
    favorites: server._count.favorites,
    comments: server._count.comments,
    liked: Boolean(server.likes?.length),
    favorited: Boolean(server.favorites?.length),
    items: server.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      pricePoints: item.pricePoints
    }))
  }));

  const premium = shuffle(
    visibleServers.filter(
      (server) =>
        server.premiumPlan !== "NONE" &&
        server.premiumUntil &&
        new Date(server.premiumUntil).getTime() > now.getTime()
    )
  );
  const regular = shuffle(visibleServers.filter((server) => !premium.some((p) => p.id === server.id)));
  const sortedServers = [...premium, ...regular];
  const [usersCount, pools, purchaseCount, playtime] = platform;
  const cheapestPackage = pointPackages[0];
  const topPremium = premiumTiers[0];
  const canManageServers = Boolean(user);

  return (
    <main>
      <section className="arena-hero">
        <VoxelHeroScene />
        <div className="hero-noise" aria-hidden="true" />
        <div className="container arena-layer">
          <div className="headline-copy">
            <p className="eyebrow">
              <ShieldCheck size={15} /> Verified playtime economy
            </p>
            <h1>Play servers. Earn points. Spend rewards anywhere.</h1>
            <p className="lead">
              MinePulse turns real Minecraft playtime into a cross-server economy. Owners fund rewards
              to grow communities; players earn without buying ranks with cash.
            </p>
            <div className="command-strip">
              <Link className="solid-button" href="#servers">
                <Crosshair size={16} /> Browse servers
              </Link>
              <Link className="ghost-button" href="/account">
                <WalletCards size={16} /> Open wallet
              </Link>
              {canManageServers ? (
                <Link className="ghost-button" href="/account#servers">
                  <Server size={16} /> Creator studio
                </Link>
              ) : (
                <Link className="ghost-button" href="/login">
                  <RadioTower size={16} /> List a server
                </Link>
              )}
            </div>
          </div>

          <aside className="hero-hud" aria-label="Platform snapshot">
            <div className="hud-tile" style={{ "--accent": "var(--lime)" } as React.CSSProperties}>
              <span>Reward pools</span>
              <strong>{points(pools._sum.pointPool ?? 0)}</strong>
            </div>
            <div className="hud-tile" style={{ "--accent": "var(--cyan)" } as React.CSSProperties}>
              <span>Members</span>
              <strong>{usersCount}</strong>
            </div>
            <div className="hud-tile" style={{ "--accent": "var(--gold)" } as React.CSSProperties}>
              <span>Queued perks</span>
              <strong>{purchaseCount}</strong>
            </div>
            <div className="hud-tile" style={{ "--accent": "var(--rose)" } as React.CSSProperties}>
              <span>Verified play</span>
              <strong>{compact(playtime._sum.activeSeconds ?? 0)}s</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="container market-pulse" aria-label="Trust signals">
        <div className="pulse-item">
          <Sparkles size={18} />
          <span>Premium boosts shuffle first, never burying normal servers forever.</span>
        </div>
        <div className="pulse-item">
          <Coins size={18} />
          <span>When a server pool hits zero, it disappears until the owner funds it again.</span>
        </div>
        <div className="pulse-item">
          <ShieldCheck size={18} />
          <span>Plugin heartbeats reward movement, activity, and challenge-passed sessions only.</span>
        </div>
      </section>

      <section className="container" id="servers">
        <div className="section-bar">
          <div>
            <h2>Live server list</h2>
            <p>Premium servers shuffle first. Regular listings reshuffle every refresh. Empty pools are hidden.</p>
          </div>
          <Link className="ghost-button" href="/">
            <RefreshCw size={16} /> Refresh list
          </Link>
        </div>

        {sortedServers.length ? (
          <div className="server-grid">
            {sortedServers.map((server) => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        ) : (
          <div className="empty-state">No funded servers are currently visible.</div>
        )}
      </section>

      <section className="container dashboard-grid economy-band" style={{ paddingBottom: 56 }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Owner pricing</h2>
              <p>Members fund campaign credits with real money, then choose how quickly verified players earn them.</p>
            </div>
          </div>
          <div className="metrics-row">
            {pointPackages.map((pack) => (
              <div className="mini-metric" key={pack.id}>
                <span className="metric-label">{pack.label}</span>
                <strong>{compact(pack.points)} pts</strong>
                <p className="toast-line">{money(pack.priceCents)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Premium lane</h2>
              <p>Gold and Diamond stay above the randomized public list for their active duration.</p>
            </div>
          </div>
          <div className="metrics-row">
            {premiumTiers.map((tier) => (
              <div className="mini-metric" key={tier.id}>
                <span className="metric-label">{tier.name}</span>
                <strong>{money(tier.priceCents)}</strong>
                <p className="toast-line">
                  {tier.durationDays} days - priority {tier.priority}
                </p>
              </div>
            ))}
            {topPremium ? (
              <div className="mini-metric">
                <span className="metric-label">Top offer</span>
                <strong>{topPremium.name}</strong>
                <p className="toast-line">{money(topPremium.priceCents)}</p>
              </div>
            ) : null}
            {cheapestPackage ? (
              <div className="mini-metric">
                <span className="metric-label">Entry</span>
                <strong>{compact(cheapestPackage.points)}</strong>
                <p className="toast-line">{money(cheapestPackage.priceCents)}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

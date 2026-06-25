import { Coins, Crosshair, RadioTower, RefreshCw, Server, ShieldCheck, WalletCards } from "lucide-react";
import Link from "next/link";
import { ServerCard, type MarketplaceServer } from "@/components/ServerCard";
import { VoxelHeroScene } from "@/components/VoxelHeroScene";
import { currentUser } from "@/lib/auth";
import { compact, money, points } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { shuffle } from "@/lib/random";

export const dynamic = "force-dynamic";

export default async function MarketplacePage({
  searchParams
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const user = await currentUser();
  const now = new Date();
  const { tag } = await searchParams;
  const selectedTag = typeof tag === "string" ? tag.trim() : "";

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
        hourlyStats: {
          orderBy: { hourStart: "desc" },
          take: 1
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
    averageOnline: server.hourlyStats[0]?.sampleCount
      ? Math.round(server.hourlyStats[0].onlinePlayerTotal / server.hourlyStats[0].sampleCount)
      : 0,
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

  const availableTags = Array.from(
    new Set(visibleServers.flatMap((server) => server.tags.map((serverTag) => serverTag.trim()).filter(Boolean)))
  ).sort((left, right) => left.localeCompare(right));
  const selectedTagLower = selectedTag.toLowerCase();
  const filteredServers = selectedTag
    ? visibleServers.filter((server) => server.tags.some((serverTag) => serverTag.toLowerCase() === selectedTagLower))
    : visibleServers;
  const premium = shuffle(
    filteredServers.filter(
      (server) =>
        server.premiumPlan !== "NONE" &&
        server.premiumUntil &&
        new Date(server.premiumUntil).getTime() > now.getTime()
    )
  );
  const regular = shuffle(filteredServers.filter((server) => !premium.some((p) => p.id === server.id)));
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
              <ShieldCheck size={15} /> Minecraft time, converted
            </p>
            <h1>Minecraft playtime, rewarded.</h1>
            <p className="lead">
              Enter funded worlds, play for real, and carry what you earn across the network. No cash ranks required.
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

          <aside className="network-beacon" aria-label="Live network signal">
            <div className="beacon-orbit" aria-hidden="true"><i /><i /><i /><strong>LIVE</strong></div>
            <div className="beacon-readout">
              <p>Network telemetry</p>
              <div><span>Campaign signal</span><strong>{points(pools._sum.pointPool ?? 0)}</strong></div>
              <div><span>Linked members</span><strong>{usersCount}</strong></div>
              <div><span>Verified play</span><strong>{compact(playtime._sum.activeSeconds ?? 0)}s</strong></div>
              <div><span>Queued perks</span><strong>{purchaseCount}</strong></div>
            </div>
          </aside>
        </div>
      </section>

      <section className="container network-rules" aria-label="Network rules">
        <div><b>01</b><span>Premium worlds shuffle first. Tag filters keep the same fair draw.</span></div>
        <div><b>02</b><span>Empty campaign pools leave the atlas until the owner funds them again.</span></div>
        <div><b>03</b><span>Signed bridge activity, movement, and challenges decide every reward.</span></div>
      </section>

      <section className="container" id="servers">
        <div className="section-bar">
          <div>
            <p className="eyebrow"><RadioTower size={14} /> Live directory</p>
            <h2>Worlds transmitting now</h2>
            <p>Use a tag to focus the atlas, or refresh to deal the funded worlds again.</p>
          </div>
          <Link className="ghost-button" href="/">
            <RefreshCw size={16} /> Refresh list
          </Link>
        </div>

        <div className="tag-filter-row" aria-label="Server tag filters">
          <Link className={`tag-filter ${!selectedTag ? "active" : ""}`} href="/">All worlds</Link>
          {availableTags.map((serverTag) => (
            <Link
              className={`tag-filter ${serverTag.toLowerCase() === selectedTagLower ? "active" : ""}`}
              href={`/?tag=${encodeURIComponent(serverTag)}#servers`}
              key={serverTag}
            >
              {serverTag}
            </Link>
          ))}
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

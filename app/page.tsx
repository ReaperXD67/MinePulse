import { Coins, Crosshair, LayoutGrid, RadioTower, RefreshCw, Search, Server, ShieldCheck, Star, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { ServerCard, type MarketplaceServer } from "@/components/ServerCard";
import { VoxelHeroScene } from "@/components/VoxelHeroScene";
import { currentUser } from "@/lib/auth";
import { compact, money, points } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { shuffle } from "@/lib/random";
import { activePremiumPlan } from "@/lib/premium";

export const dynamic = "force-dynamic";

export default async function MarketplacePage({
  searchParams
}: {
  searchParams: Promise<{ tag?: string; q?: string; view?: string; shuffle?: string }>;
}) {
  const user = await currentUser();
  const now = new Date();
  const { tag, q, view } = await searchParams;
  const selectedTag = typeof tag === "string" ? tag.trim() : "";
  const query = typeof q === "string" ? q.trim().slice(0, 80) : "";
  const favoritesOnly = view === "favorites" && Boolean(user);

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

  const visibleServers = servers.map<MarketplaceServer>((server) => {
    const premiumPlan = activePremiumPlan(server.premiumPlan, server.premiumUntil, now);
    const bridgeSignalAt = [server.lastHeartbeatAt, server.lastConfigSyncAt]
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => right.getTime() - left.getTime())[0];

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
      bannerImage: server.bannerImage || "/voxel-network.png",
      pointPool: server.pointPool,
      rewardRatePerSecond: server.rewardRatePerSecond,
      maxPaidPlayers: server.maxPaidPlayers,
      averageOnline: server.hourlyStats[0]?.sampleCount
        ? Math.round(server.hourlyStats[0].onlinePlayerTotal / server.hourlyStats[0].sampleCount)
        : 0,
      premiumPlan,
      premiumUntil: premiumPlan === "NONE" ? null : server.premiumUntil?.toISOString() ?? null,
      trustStatus: server.trustStatus,
      bridgeState: !bridgeSignalAt
        ? "offline"
        : now.getTime() - bridgeSignalAt.getTime() <= 120000
          ? "online"
          : now.getTime() - bridgeSignalAt.getTime() <= 900000
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
    };
  });

  const availableTags = Array.from(
    new Set(visibleServers.flatMap((server) => server.tags.map((serverTag) => serverTag.trim()).filter(Boolean)))
  ).sort((left, right) => left.localeCompare(right));
  const selectedTagLower = selectedTag.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const filteredServers = visibleServers.filter((server) => {
    const matchesTag = !selectedTag || server.tags.some((serverTag) => serverTag.toLowerCase() === selectedTagLower);
    const matchesFavorite = !favoritesOnly || server.favorited;
    const searchableText = [
      server.name,
      server.host,
      `${server.host}:${server.port}`,
      server.version,
      server.region,
      server.description,
      ...server.tags,
      ...server.items.flatMap((item) => [item.name, item.description])
    ].join(" ").toLowerCase();
    const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);
    return matchesTag && matchesFavorite && matchesQuery;
  });
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
  const favoriteCount = visibleServers.filter((server) => server.favorited).length;

  function directoryHref(next: { tag?: string; query?: string; favorites?: boolean; shuffle?: boolean }) {
    const params = new URLSearchParams();
    if (next.tag) params.set("tag", next.tag);
    if (next.query) params.set("q", next.query);
    if (next.favorites) params.set("view", "favorites");
    if (next.shuffle) params.set("shuffle", Date.now().toString());
    const value = params.toString();
    return `${value ? `/?${value}` : "/"}#servers`;
  }

  return (
    <main>
      <section className="arena-hero">
        <VoxelHeroScene />
        <div className="hero-noise" aria-hidden="true" />
        <div className="container arena-layer">
          <div className="headline-copy">
            <p className="eyebrow">
              <ShieldCheck size={15} /> Verified Minecraft reward network
            </p>
            <h1 className="karix-wordmark"><span>Karix</span><em>MC</em></h1>
            <p className="hero-manifesto"><span>Play any world.</span><strong>Earn on one network.</strong></p>
            <p className="lead">
              Real play becomes a portable balance. Discover funded servers, earn while active, and unlock ranks or items across the network without paying cash.
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
            <div className="beacon-orbit" aria-hidden="true"><i /><i /><i /><strong>KX</strong></div>
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
            <p>{favoritesOnly ? "Your saved worlds, ready for another session." : "Funded worlds and their live reward stores."}</p>
          </div>
          <Link className="ghost-button" href={directoryHref({ tag: selectedTag, query, favorites: favoritesOnly, shuffle: true })}>
            <RefreshCw size={16} /> Refresh list
          </Link>
        </div>

        <div className="directory-toolbar">
          <form className={`server-search-form ${query ? "has-query" : ""}`} action="/#servers" method="get" role="search">
            <div className="server-search-field">
              <Search size={18} aria-hidden="true" />
              <input
                className="field"
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search worlds, addresses, tags or rewards"
                aria-label="Search servers and rewards"
              />
            </div>
            {selectedTag ? <input type="hidden" name="tag" value={selectedTag} /> : null}
            {favoritesOnly ? <input type="hidden" name="view" value="favorites" /> : null}
            <button className="solid-button directory-search-button" type="submit"><Search size={16} /> Search</button>
            {query ? (
              <Link
                className="icon-button directory-clear-button"
                href={directoryHref({ tag: selectedTag, favorites: favoritesOnly })}
                aria-label="Clear server search"
                title="Clear search"
              >
                <X size={17} />
              </Link>
            ) : null}
          </form>

          <div className="directory-view-tabs" aria-label="Directory view">
            <Link
              className={`directory-view-link ${!favoritesOnly ? "active" : ""}`}
              href={directoryHref({ tag: selectedTag, query })}
            >
              <LayoutGrid size={16} /> All <span>{visibleServers.length}</span>
            </Link>
            <Link
              className={`directory-view-link ${favoritesOnly ? "active" : ""}`}
              href={user ? directoryHref({ tag: selectedTag, query, favorites: true }) : "/login"}
            >
              <Star size={16} fill={favoritesOnly ? "currentColor" : "none"} /> Favorites <span>{favoriteCount}</span>
            </Link>
          </div>
        </div>

        <div className="tag-filter-row" aria-label="Server tag filters">
          <Link
            className={`tag-filter ${!selectedTag ? "active" : ""}`}
            href={directoryHref({ query, favorites: favoritesOnly })}
          >
            All worlds
          </Link>
          {availableTags.map((serverTag) => (
            <Link
              className={`tag-filter ${serverTag.toLowerCase() === selectedTagLower ? "active" : ""}`}
              href={directoryHref({ tag: serverTag, query, favorites: favoritesOnly })}
              key={serverTag}
            >
              {serverTag}
            </Link>
          ))}
        </div>

        {sortedServers.length ? (
          <>
            <div className="directory-result-line" aria-live="polite">
              <strong>{sortedServers.length}</strong>
              <span>{favoritesOnly ? "favorite" : "matching"} {sortedServers.length === 1 ? "world" : "worlds"}</span>
              {query ? <small>for &ldquo;{query}&rdquo;</small> : null}
            </div>
            <div className="server-grid">
              {sortedServers.map((server) => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state directory-empty-state">
            <Search size={24} />
            <strong>{favoritesOnly ? "No favorite worlds match" : "No funded worlds match"}</strong>
            <span>Try another name, address, tag, or reward.</span>
            {(query || selectedTag || favoritesOnly) ? <Link className="ghost-button" href="/#servers">Reset directory</Link> : null}
          </div>
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

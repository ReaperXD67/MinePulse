import { Coins, Crosshair, LayoutGrid, RadioTower, RefreshCw, Search, Server, ShieldCheck, Star, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { ServerCard, type MarketplaceServer } from "@/components/ServerCard";
import { MarketplaceLiveSync } from "@/components/MarketplaceLiveSync";
import { DirectoryShuffleButton } from "@/components/DirectoryShuffleButton";
import { VoxelHeroScene } from "@/components/VoxelHeroScene";
import { currentUser } from "@/lib/auth";
import { FIRST_POSITION_CHANCES, orderDirectory } from "@/lib/directory-order";
import { DEFAULT_DIRECTORY_SEED, DIRECTORY_SEED_COOKIE } from "@/lib/directory-seed";
import { compact, minutesLabel, money, points } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { activePremiumPlan } from "@/lib/premium";
import { safeMediaPath } from "@/lib/server-profile";
import { bridgeStateAt } from "@/lib/server-liveness";
import { createSeededRandom } from "@/lib/random";

export const dynamic = "force-dynamic";

export default async function MarketplacePage({
  searchParams
}: {
  searchParams: Promise<{ tag?: string; q?: string; view?: string }>;
}) {
  const user = await currentUser();
  const cookieStore = await cookies();
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
      prisma.purchase.count({ where: { status: "PENDING" } }),
      prisma.serverSession.aggregate({ _sum: { activeSeconds: true } })
    ]),
    prisma.pointPackage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.premiumTier.findMany({ where: { active: true }, orderBy: { priority: "desc" } })
  ]);

  const visibleServers = servers.map<MarketplaceServer>((server) => {
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
      liked: Boolean(server.likes?.length),
      favorited: Boolean(server.favorites?.length),
      items: server.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        pricePoints: item.pricePoints
      }))
    };
  }).filter((server) => server.bridgeState === "online");

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
  const premiumWeightByPlan = new Map(
    premiumTiers.map((tier) => [tier.code, Math.max(1, tier.priority)])
  );
  const stableFilteredServers = [...filteredServers].sort((left, right) => left.id.localeCompare(right.id));
  const premiumCandidates = stableFilteredServers.filter(
      (server) =>
        server.premiumPlan !== "NONE" &&
        server.premiumUntil &&
        new Date(server.premiumUntil).getTime() > now.getTime()
  );
  const standardCandidates = stableFilteredServers.filter(
    (server) => !premiumCandidates.some((premiumServer) => premiumServer.id === server.id)
  );
  const directorySeed = cookieStore.get(DIRECTORY_SEED_COOKIE)?.value || user?.id || DEFAULT_DIRECTORY_SEED;
  const { servers: sortedServers } = orderDirectory({
    premium: premiumCandidates,
    standard: standardCandidates,
    premiumWeightFor: (server) => premiumWeightByPlan.get(server.premiumPlan) ?? 1,
    premiumTierFor: (server) => server.premiumPlan === "DIAMOND" ? "DIAMOND" : "GOLD",
    random: createSeededRandom(directorySeed)
  });
  const [usersCount, pools, purchaseCount, playtime] = platform;
  const goldTier = premiumTiers.find((tier) => tier.code === "GOLD");
  const diamondTier = premiumTiers.find((tier) => tier.code === "DIAMOND");
  const diamondFirstPercent = FIRST_POSITION_CHANCES.DIAMOND * 100;
  const goldFirstPercent = FIRST_POSITION_CHANCES.GOLD * 100;
  const standardFirstPercent = FIRST_POSITION_CHANCES.STANDARD * 100;
  const canManageServers = Boolean(user);
  const favoriteCount = visibleServers.filter((server) => server.favorited).length;

  function directoryHref(next: { tag?: string; query?: string; favorites?: boolean }) {
    const params = new URLSearchParams();
    if (next.tag) params.set("tag", next.tag);
    if (next.query) params.set("q", next.query);
    if (next.favorites) params.set("view", "favorites");
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
              <div title="Campaign credits currently available to reward players across all servers"><span>Reward pools</span><strong>{points(pools._sum.pointPool ?? 0)} pts</strong><small>available for play rewards</small></div>
              <div title="Registered KarixMC accounts"><span>Member accounts</span><strong>{usersCount}</strong><small>registered profiles</small></div>
              <div title="Total active playtime accepted by the KarixMC verification service"><span>Verified playtime</span><strong>{minutesLabel(playtime._sum.activeSeconds ?? 0)}</strong><small>AFK time excluded</small></div>
              <div title="Purchased server items waiting for an in-game delivery confirmation"><span>Pending deliveries</span><strong>{purchaseCount}</strong><small>items awaiting the plugin</small></div>
            </div>
          </aside>
        </div>
      </section>

      <section className="container network-rules" aria-label="Network rules">
        <div><b>01</b><span>Top signal draw: Diamond {diamondFirstPercent}%, Gold {goldFirstPercent}%, standard {standardFirstPercent}%. Likes and favorites balance worlds inside each lane.</span></div>
        <div><b>02</b><span>Empty campaign pools leave the atlas until the owner funds them again.</span></div>
        <div><b>03</b><span>Signed bridge activity, movement, and challenges decide every reward.</span></div>
      </section>

      <section className="container" id="servers">
        <MarketplaceLiveSync serverIds={visibleServers.map((server) => server.id)} />
        <div className="section-bar">
          <div>
            <p className="eyebrow"><RadioTower size={14} /> Live directory</p>
            <h2>Worlds transmitting now</h2>
            <p>{favoritesOnly ? "Your saved worlds, ready for another session." : "Funded worlds and their live reward stores."}</p>
          </div>
          <DirectoryShuffleButton />
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
            <strong>{favoritesOnly ? "No favorite worlds are online" : "No live funded worlds match"}</strong>
            <span>Try another name, address, tag, or check back when a server reconnects.</span>
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
              <h2>Visibility balance</h2>
              <p>Premium keeps a strong advantage, while a community spotlight gives standard servers a real path to the first position.</p>
            </div>
          </div>
          <div className="premium-benefit-grid">
            <div className="premium-benefit diamond">
              <span>Diamond visibility</span>
              <strong>{diamondFirstPercent}% chance at #1</strong>
              <div className="premium-chance-track" aria-hidden="true"><i /></div>
              <p>{diamondTier ? `${money(diamondTier.priceCents)} for ${diamondTier.durationDays} days` : "Top premium placement"}</p>
              <small>The strongest top-slot signal, with engagement balancing Diamond servers against each other.</small>
            </div>
            <div className="premium-benefit gold">
              <span>Gold visibility</span>
              <strong>{goldFirstPercent}% chance at #1</strong>
              <div className="premium-chance-track" aria-hidden="true"><i /></div>
              <p>{goldTier ? `${money(goldTier.priceCents)} for ${goldTier.durationDays} days` : "Premium placement"}</p>
              <small>A clear visibility advantage while leaving room for Diamond and community discovery.</small>
            </div>
            <div className="premium-benefit standard">
              <span>Community spotlight</span>
              <strong>{standardFirstPercent}% chance at #1</strong>
              <div className="premium-chance-track" aria-hidden="true"><i /></div>
              <p>A standard server can still lead the directory on every refresh.</p>
              <small>Every standard server gets a base chance; genuine engagement adds a limited boost.</small>
            </div>
          </div>
          <div className="premium-example">
            <RefreshCw size={18} />
            <div>
              <strong>Simple example: one Diamond, one Gold, and one standard server</strong>
              <p>Across 100 refreshes, Diamond leads about {diamondFirstPercent} times, Gold about {goldFirstPercent}, and standard about {standardFirstPercent}. Every refresh is a new chance, not a fixed rotation.</p>
            </div>
          </div>
          <p className="premium-fineprint">
            <ShieldCheck size={15} /> Standard worlds start with 100 visibility points. Likes add up to 30, favorites up to 40, and comments up to 10. Popularity helps, but the capped 180 maximum stops one server from owning the list.
          </p>
        </div>
      </section>
    </main>
  );
}

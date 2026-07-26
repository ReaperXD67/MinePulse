import { ArrowDownRight, LayoutGrid, RadioTower, RefreshCw, Search, ShieldCheck, Star, X } from "lucide-react";
import Link from "next/link";
import { CinematicHero } from "@/components/CinematicHero";
import { ServerCard, type MarketplaceServer } from "@/components/ServerCard";
import { currentUser } from "@/lib/auth";
import { ORGANIC_SPOTLIGHT_CHANCE, orderDirectory } from "@/lib/directory-order";
import { compact, money } from "@/lib/format";
import { prisma } from "@/lib/prisma";
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
  const premiumCandidates = filteredServers.filter(
      (server) =>
        server.premiumPlan !== "NONE" &&
        server.premiumUntil &&
        new Date(server.premiumUntil).getTime() > now.getTime()
  );
  const standardCandidates = filteredServers.filter(
    (server) => !premiumCandidates.some((premiumServer) => premiumServer.id === server.id)
  );
  const { servers: sortedServers } = orderDirectory({
    premium: premiumCandidates,
    standard: standardCandidates,
    premiumWeightFor: (server) => premiumWeightByPlan.get(server.premiumPlan) ?? 1
  });
  const [usersCount, pools, purchaseCount, playtime] = platform;
  const goldTier = premiumTiers.find((tier) => tier.code === "GOLD");
  const diamondTier = premiumTiers.find((tier) => tier.code === "DIAMOND");
  const goldWeight = Math.max(1, goldTier?.priority ?? 1);
  const diamondWeight = Math.max(1, diamondTier?.priority ?? 2);
  const headToHeadTotal = goldWeight + diamondWeight;
  const diamondHeadToHeadChance = (diamondWeight / headToHeadTotal) * 100;
  const goldHeadToHeadChance = (goldWeight / headToHeadTotal) * 100;
  const organicSpotlightPercent = ORGANIC_SPOTLIGHT_CHANCE * 100;
  const premiumLeadPercent = 100 - organicSpotlightPercent;
  const diamondOverallPerHundred = Math.round((premiumLeadPercent * diamondHeadToHeadChance) / 100);
  const goldOverallPerHundred = Math.round((premiumLeadPercent * goldHeadToHeadChance) / 100);
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
      <CinematicHero
        liveWorlds={visibleServers.length}
        campaignPoints={pools._sum.pointPool ?? 0}
        members={usersCount}
        verifiedSeconds={playtime._sum.activeSeconds ?? 0}
        queuedPerks={purchaseCount}
        canManageServers={canManageServers}
      />

      <section className="network-protocol" aria-label="Network rules">
        <div className="protocol-rail" aria-hidden="true">
          <span>KX PROTOCOL</span><i /><span>VERIFIED TIME IS THE CURRENCY</span><i /><span>KX PROTOCOL</span><i /><span>VERIFIED TIME IS THE CURRENCY</span>
        </div>
        <div className="container protocol-grid">
          <p><b>01 / DISCOVERY</b><span>{premiumLeadPercent}% premium-led. {organicSpotlightPercent}% still gives community worlds a clean shot at the first signal.</span></p>
          <p><b>02 / ECONOMY</b><span>Empty campaign pools disappear from the atlas until their owner transmits value again.</span></p>
          <p><b>03 / PROOF</b><span>Signed bridge activity, movement, and challenges decide every reward.</span></p>
        </div>
      </section>

      <section className="world-atlas" id="servers">
        <div className="container atlas-heading">
          <div className="atlas-index">02 / WORLD ATLAS <i /></div>
          <div className="atlas-title-lockup">
            <h2>CHOOSE YOUR<br /><em>NEXT OBSESSION.</em></h2>
            <p>Every signal below is live, funded, and connected to KarixMC. Pick a world for the game. Stay because your time has value.</p>
          </div>
        </div>

        <div className="container section-bar atlas-commandbar">
          <div>
            <p className="eyebrow"><RadioTower size={14} /> Live directory</p>
            <strong>{favoritesOnly ? "Your saved transmissions" : `${sortedServers.length} worlds transmitting now`}</strong>
          </div>
          <Link className="ghost-button" href={directoryHref({ tag: selectedTag, query, favorites: favoritesOnly, shuffle: true })}>
            <RefreshCw size={16} /> Refresh list
          </Link>
        </div>

        <div className="container directory-toolbar atlas-toolbar">
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

        <div className="container tag-filter-row" aria-label="Server tag filters">
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
            <div className="container directory-result-line" aria-live="polite">
              <strong>{sortedServers.length}</strong>
              <span>{favoritesOnly ? "favorite" : "matching"} {sortedServers.length === 1 ? "world" : "worlds"}</span>
              {query ? <small>for &ldquo;{query}&rdquo;</small> : null}
            </div>
            <div className="container server-grid broadcast-grid">
              {sortedServers.map((server, index) => (
                <ServerCard key={server.id} server={server} featured={index === 0} />
              ))}
            </div>
          </>
        ) : (
          <div className="container empty-state directory-empty-state">
            <Search size={24} />
            <strong>{favoritesOnly ? "No favorite worlds are online" : "No live funded worlds match"}</strong>
            <span>Try another name, address, tag, or check back when a server reconnects.</span>
            {(query || selectedTag || favoritesOnly) ? <Link className="ghost-button" href="/#servers">Reset directory</Link> : null}
          </div>
        )}
        <div className="atlas-exit container">
          <span>THE ATLAS NEVER RANKS BY POPULARITY ALONE.</span>
          <Link href="/plugin">How the bridge proves play <ArrowDownRight size={17} /></Link>
        </div>
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
              <strong>{diamondHeadToHeadChance.toFixed(1)}% to lead premium</strong>
              <div className="premium-chance-track" aria-hidden="true"><i /></div>
              <p>{diamondTier ? `${money(diamondTier.priceCents)} for ${diamondTier.durationDays} days` : "Top premium placement"}</p>
              <small>Gets {diamondWeight} chances for each {goldWeight} Gold chance inside the premium lane.</small>
            </div>
            <div className="premium-benefit gold">
              <span>Gold visibility</span>
              <strong>{goldHeadToHeadChance.toFixed(1)}% to lead premium</strong>
              <div className="premium-chance-track" aria-hidden="true"><i /></div>
              <p>{goldTier ? `${money(goldTier.priceCents)} for ${goldTier.durationDays} days` : "Premium placement"}</p>
              <small>Still appears before the standard lane on {premiumLeadPercent}% of refreshes.</small>
            </div>
            <div className="premium-benefit standard">
              <span>Community spotlight</span>
              <strong>{organicSpotlightPercent}% chance at #1</strong>
              <div className="premium-chance-track" aria-hidden="true"><i /></div>
              <p>One standard server moves above premium when the spotlight activates.</p>
              <small>Every standard server gets a base chance; genuine engagement adds a limited boost.</small>
            </div>
          </div>
          <div className="premium-example">
            <RefreshCw size={18} />
            <div>
              <strong>Simple example: one Diamond, one Gold, and one standard server</strong>
              <p>Across 100 refreshes, the standard server reaches #1 about {organicSpotlightPercent} times. Of the other {premiumLeadPercent}, Diamond leads about {diamondOverallPerHundred} and Gold about {goldOverallPerHundred}. Every refresh is a new chance, not a fixed rotation.</p>
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

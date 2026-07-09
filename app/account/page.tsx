import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins, ExternalLink, Heart, RadioTower, ReceiptText, Server, ShieldCheck, Timer } from "lucide-react";
import { OwnerConsole } from "@/components/OwnerConsole";
import { ProfileForm } from "@/components/ProfileForm";
import { MinecraftLinkPanel } from "@/components/MinecraftLinkPanel";
import { FriendPanel } from "@/components/FriendPanel";
import { DailyRewardPanel } from "@/components/DailyRewardPanel";
import { currentUser } from "@/lib/auth";
import { minutesLabel, money, points, shortDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const [profile, purchases, sessions, favorites, ledger, servers, pointPackages, premiumTiers, billing, tickets, friendships] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: user.id } }),
      prisma.purchase.findMany({
        where: { buyerId: user.id },
        include: { server: true, item: true },
        orderBy: { createdAt: "desc" },
        take: 8
      }),
      prisma.serverSession.findMany({
        where: { userId: user.id },
        include: { server: true },
        orderBy: { lastHeartbeatAt: "desc" },
        take: 8
      }),
      prisma.favorite.findMany({
        where: { userId: user.id },
        include: { server: true },
        orderBy: { createdAt: "desc" },
        take: 8
      }),
      prisma.pointLedger.findMany({
        where: { userId: user.id },
        include: { server: true },
        orderBy: { createdAt: "desc" },
        take: 10
      }),
      prisma.server.findMany({
        where: { ownerId: user.id },
        include: {
          items: { orderBy: { createdAt: "desc" } },
          supportTickets: {
            include: { requester: { select: { username: true } } },
            orderBy: { updatedAt: "desc" },
            take: 12
          },
          _count: { select: { reports: true, favorites: true, likes: true } }
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.pointPackage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      prisma.premiumTier.findMany({ where: { active: true }, orderBy: { priority: "desc" } }),
      prisma.billingLedger.aggregate({ where: { ownerId: user.id }, _sum: { moneyCents: true, bonusPoints: true } }),
      prisma.supportTicket.findMany({
        where: { requesterId: user.id },
        include: { server: true },
        orderBy: { updatedAt: "desc" },
        take: 8
      }),
      prisma.friendship.findMany({
        where: { userId: user.id },
        include: {
          friend: {
            select: {
              id: true,
              username: true,
              minecraftName: true,
              avatarUrl: true,
              sessions: {
                include: { server: { select: { name: true, slug: true } } },
                orderBy: { lastHeartbeatAt: "desc" },
                take: 1
              }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      })
    ]);

  const totalPlay = sessions.reduce((sum, session) => sum + session.activeSeconds, 0);
  const campaignCredits = servers.reduce((sum, server) => sum + server.pointPool, 0);
  const friendRows = friendships.map((link) => {
    const latest = link.friend.sessions[0];
    const online = Boolean(
      latest?.status === "ACTIVE" && Date.now() - latest.lastHeartbeatAt.getTime() <= 120000
    );

    return {
      id: link.friend.id,
      username: link.friend.username,
      minecraftName: link.friend.minecraftName,
      avatarUrl: link.friend.avatarUrl,
      online,
      lastSeenAt: latest?.lastHeartbeatAt.toISOString() ?? null,
      serverName: latest?.server.name ?? null,
      serverSlug: latest?.server.slug ?? null
    };
  });
  const initials = (profile?.username || user.username)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="container dashboard account-page">
      <section className="account-hero">
        <div className="profile-avatar" style={profile?.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})` } : undefined}>
          {!profile?.avatarUrl ? initials : null}
        </div>
        <div className="account-identity">
          <p className="eyebrow"><ShieldCheck size={14} /> Unified member profile</p>
          <h1>{profile?.username || user.username}</h1>
          <p>{profile?.bio || "Play, earn, build a community, or launch your own server from one account."}</p>
          <div className="inline-actions">
            <span className="badge"><Coins size={13} /> {points(profile?.walletPoints ?? 0)} earned</span>
            <span className="badge"><RadioTower size={13} /> {points(campaignCredits)} campaign credits</span>
            <Link className="ghost-button" href={`/members/${user.id}`}><ExternalLink size={15} /> Public profile</Link>
          </div>
        </div>
        <nav className="account-nav" aria-label="Account sections">
          <a href="#overview">Overview</a>
          <a href="#friends">Friends</a>
          <a href="#servers">Servers</a>
          <a href="#support">Support</a>
        </nav>
      </section>

      <section className="metrics-row" id="overview">
        <div className="stat-tile" style={{ "--accent": "var(--lime)" } as React.CSSProperties}>
          <span>Earned points</span>
          <strong>{points(profile?.walletPoints ?? 0)}</strong>
          <small>Spend only on server items</small>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--cyan)" } as React.CSSProperties}>
          <span>Campaign credits</span>
          <strong>{points(campaignCredits)}</strong>
          <small>Fund player rewards only</small>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--gold)" } as React.CSSProperties}>
          <span>Verified play</span>
          <strong>{minutesLabel(totalPlay)}</strong>
          <small>AFK time excluded</small>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--rose)" } as React.CSSProperties}>
          <span>Your servers</span>
          <strong>{servers.length}</strong>
          <small>{money(billing._sum.moneyCents ?? 0)} funded</small>
        </div>
      </section>

      <DailyRewardPanel
        walletPoints={profile?.walletPoints ?? 0}
        level={profile?.level ?? 0}
        lifetimeEarnedPoints={profile?.lifetimeEarnedPoints ?? 0}
        lastDailyClaimAt={profile?.lastDailyClaimAt?.toISOString() ?? null}
      />

      <section className="dashboard-grid account-overview-grid">
        <div className="panel">
          <div className="panel-header compact-heading">
            <div><p className="eyebrow"><ReceiptText size={14} /> Activity</p><h2>Recent purchases</h2></div>
          </div>
          <div className="activity-list">
            {purchases.map((purchase) => (
              <div className="activity-row" key={purchase.id}>
                <div><strong>{purchase.item.name}</strong><span>{purchase.server.name} · {shortDate(purchase.createdAt)}</span></div>
                <span className={`status-pill status-${purchase.status.toLowerCase()}`}>{purchase.status}</span>
              </div>
            ))}
            {!purchases.length ? <div className="empty-state compact-empty">Your item purchases will appear here.</div> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header compact-heading">
            <div><p className="eyebrow"><Coins size={14} /> Earned wallet</p><h2>Point ledger</h2></div>
          </div>
          <div className="activity-list">
            {ledger.map((entry) => (
              <div className="activity-row" key={entry.id}>
                <div><strong>{entry.note}</strong><span>{entry.server?.name || "MinePulse"} · {shortDate(entry.createdAt)}</span></div>
                <span className={entry.amountPoints >= 0 ? "amount-positive" : "amount-negative"}>
                  {entry.amountPoints > 0 ? "+" : ""}{points(entry.amountPoints)}
                </span>
              </div>
            ))}
            {!ledger.length ? <div className="empty-state compact-empty">Verified rewards will build your ledger.</div> : null}
          </div>
        </div>
      </section>

      <section className="dashboard-grid account-overview-grid">
        <div className="panel">
          <div className="panel-header compact-heading">
            <div><p className="eyebrow"><Timer size={14} /> Verification</p><h2>Recent play</h2></div>
          </div>
          <div className="activity-list">
            {sessions.map((session) => (
              <div className="activity-row" key={session.id}>
                <div><strong>{session.server.name}</strong><span>{minutesLabel(session.activeSeconds)} active · {minutesLabel(session.afkSeconds)} AFK</span></div>
                <span className="amount-positive">+{points(session.rewardedPoints)}</span>
              </div>
            ))}
            {!sessions.length ? <div className="empty-state compact-empty">Connect Minecraft to begin verified play.</div> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header compact-heading">
            <div><p className="eyebrow"><Heart size={14} /> Saved</p><h2>Favorite servers</h2></div>
          </div>
          <div className="activity-list">
            {favorites.map((favorite) => (
              <Link className="activity-row" href={`/servers/${favorite.server.slug}`} key={favorite.id}>
                <div><strong>{favorite.server.name}</strong><span className="mono">{favorite.server.host}:{favorite.server.port}</span></div>
                <ExternalLink size={16} />
              </Link>
            ))}
            {!favorites.length ? <div className="empty-state compact-empty">Favorite a server to keep it close.</div> : null}
          </div>
        </div>
      </section>

      <section className="panel profile-editor-panel">
        <ProfileForm
          username={profile?.username || user.username}
          minecraftName={profile?.minecraftName || null}
          friendsPrivate={profile?.friendsPrivate ?? false}
          bio={profile?.bio || ""}
          avatarUrl={profile?.avatarUrl || null}
        />
        <MinecraftLinkPanel minecraftName={profile?.minecraftName || null} isLinked={Boolean(profile?.minecraftUuid)} />
      </section>

      <section id="friends">
        <FriendPanel friends={friendRows} />
      </section>

      <section id="servers" className="section-heading-block">
        <div><p className="eyebrow"><Server size={14} /> Creator studio</p><h2>Your servers</h2></div>
        <p>Any member can publish a server. Campaign credits and earned points remain separate.</p>
      </section>

      <OwnerConsole
        servers={servers.map((server) => ({
          id: server.id,
          slug: server.slug,
          name: server.name,
          host: server.host,
          port: server.port,
          version: server.version,
          region: server.region,
          tags: server.tags,
          description: server.description,
          longDescription: server.longDescription,
          rules: server.rules,
          galleryImages: server.galleryImages,
          websiteUrl: server.websiteUrl,
          discordUrl: server.discordUrl,
          supportUrl: server.supportUrl,
          status: server.status,
          trustStatus: server.trustStatus,
          riskScore: server.riskScore,
          pointPool: server.pointPool,
          rewardRatePerSecond: server.rewardRatePerSecond,
          maxPaidPlayers: server.maxPaidPlayers,
          minPlaySecondsForComment: server.minPlaySecondsForComment,
          premiumPlan: server.premiumPlan,
          premiumUntil: server.premiumUntil?.toISOString() ?? null,
          lastHeartbeatAt: server.lastHeartbeatAt?.toISOString() ?? null,
          lastPluginVersion: server.lastPluginVersion,
          pluginSecret: server.pluginSecret,
          pluginConfigRevision: server.pluginConfigRevision,
          heartbeatIntervalSeconds: server.heartbeatIntervalSeconds,
          purchasePollSeconds: server.purchasePollSeconds,
          afkTimeoutSeconds: server.afkTimeoutSeconds,
          challengeEnabled: server.challengeEnabled,
          challengeIntervalSeconds: server.challengeIntervalSeconds,
          challengeAnswerWindowSeconds: server.challengeAnswerWindowSeconds,
          challengeRequired: server.challengeRequired,
          minimumMovementDistance: server.minimumMovementDistance,
          minimumActivityEvents: server.minimumActivityEvents,
          botProtectionLevel: server.botProtectionLevel,
          lastConfigSyncAt: server.lastConfigSyncAt?.toISOString() ?? null,
          reportCount: server._count.reports,
          favoriteCount: server._count.favorites,
          likeCount: server._count.likes,
          items: server.items.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            pricePoints: item.pricePoints,
            command: item.command,
            requiresOnline: item.requiresOnline,
            status: item.status
          })),
          supportTickets: server.supportTickets.map((ticket) => ({
            id: ticket.id,
            requester: ticket.requester.username,
            subject: ticket.subject,
            body: ticket.body,
            status: ticket.status,
            ownerNote: ticket.ownerNote
          }))
        }))}
        pointPackages={pointPackages.map((pack) => ({ id: pack.id, label: pack.label, points: pack.points, priceCents: pack.priceCents }))}
        premiumTiers={premiumTiers.map((tier) => ({ id: tier.id, name: tier.name, priceCents: tier.priceCents, durationDays: tier.durationDays, priority: tier.priority }))}
      />

      <section className="panel" id="support">
        <div className="panel-header compact-heading">
          <div><p className="eyebrow"><RadioTower size={14} /> Support</p><h2>Your requests</h2></div>
          <span className="badge">{tickets.length} recent</span>
        </div>
        <div className="activity-list">
          {tickets.map((ticket) => (
            <div className="activity-row" key={ticket.id}>
              <div><strong>{ticket.subject}</strong><span>{ticket.server.name} · {ticket.ownerNote || "Waiting for server staff"}</span></div>
              <span className={`status-pill status-${ticket.status.toLowerCase()}`}>{ticket.status.replace("_", " ")}</span>
            </div>
          ))}
          {!tickets.length ? <div className="empty-state compact-empty">Support requests from server profiles will appear here.</div> : null}
        </div>
      </section>
    </main>
  );
}

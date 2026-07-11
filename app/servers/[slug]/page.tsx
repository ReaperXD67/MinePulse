import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Coins,
  ExternalLink,
  Gamepad2,
  Globe2,
  Heart,
  MessageSquare,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  Star,
  Users,
  Zap
} from "lucide-react";
import { ServerProfileActions } from "@/components/ServerProfileActions";
import { currentUser } from "@/lib/auth";
import { compact, daysLeft, minutesLabel, points, shortDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { activePremiumPlan } from "@/lib/premium";
import { serverJoinAddress } from "@/lib/server-address";

export const dynamic = "force-dynamic";

export default async function ServerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await currentUser();
  const server = await prisma.server.findUnique({
    where: { slug },
    include: {
      owner: { select: { id: true, username: true, bio: true, avatarUrl: true, createdAt: true } },
      items: { where: { status: "ACTIVE" }, orderBy: { pricePoints: "asc" } },
      comments: {
        include: { user: { select: { username: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
        take: 20
      },
      hourlyStats: {
        orderBy: { hourStart: "desc" },
        take: 12
      },
      likes: { where: { userId: user?.id || "__guest__" } },
      favorites: { where: { userId: user?.id || "__guest__" } },
      _count: { select: { likes: true, favorites: true, comments: true, reports: true, sessions: true } }
    }
  });

  if (!server || server.status === "REMOVED" || server.trustStatus === "BLACKLISTED") {
    notFound();
  }

  const [sessionTotals, deliveredPurchases] = await Promise.all([
    prisma.serverSession.aggregate({
      where: { serverId: server.id },
      _sum: { activeSeconds: true, rewardedPoints: true, suspiciousScore: true }
    }),
    prisma.purchase.count({ where: { serverId: server.id, status: "DELIVERED" } })
  ]);

  const bridgeSignalAt = [server.lastHeartbeatAt, server.lastConfigSyncAt]
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const heartbeatAge = bridgeSignalAt ? Date.now() - bridgeSignalAt.getTime() : Number.POSITIVE_INFINITY;
  const bridgeState = heartbeatAge <= 120000 ? "online" : heartbeatAge <= 900000 ? "stale" : "offline";
  const premiumPlan = activePremiumPlan(server.premiumPlan, server.premiumUntil);
  const gallery = server.galleryImages.split(",").map((image) => image.trim()).filter(Boolean).slice(0, 5);
  const rules = server.rules.split("\n").map((rule) => rule.trim()).filter(Boolean);
  const ownerInitials = server.owner.username.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <main className="server-profile-page">
      <section className="server-profile-hero" style={{ "--profile-image": `url(${server.bannerImage || "/voxel-network.png"})` } as React.CSSProperties}>
        <div className="container server-profile-hero-inner">
          <div className="profile-breadcrumbs"><Link href="/">Servers</Link><span>/</span><span>{server.name}</span></div>
          <div className="server-profile-title-row">
            <div>
              <div className="inline-actions">
                <span className={`status-pill trust-${server.trustStatus.toLowerCase()}`}><ShieldCheck size={13} /> {server.trustStatus}</span>
                <span className={`status-pill bridge-${bridgeState}`}><RadioTower size={13} /> Bridge {bridgeState}</span>
                {premiumPlan !== "NONE" ? <span className={`status-pill trust-${premiumPlan.toLowerCase()}`}><Zap size={13} /> {premiumPlan} / {daysLeft(server.premiumUntil)}</span> : null}
              </div>
              <h1>{server.name}</h1>
              <p>{server.description}</p>
            </div>
            <div className="server-connect-panel">
              <span>Join address</span>
              <code>{serverJoinAddress(server.host, server.port)}</code>
              <div className="tag-row"><span className="tag">{server.version}</span><span className="tag">{server.region}</span>{server.tags.split(",").map((tag) => <span className="tag" key={tag}>{tag.trim()}</span>)}</div>
            </div>
          </div>
          <div className="profile-metrics-strip">
            <div><Coins size={17} /><span>Campaign pool</span><strong>{compact(server.pointPool)}</strong></div>
            <div><Zap size={17} /><span>Earn rate</span><strong>{server.rewardRatePerSecond}/s</strong></div>
            <div><Users size={17} /><span>Paid cap</span><strong>{server.maxPaidPlayers}</strong></div>
            <div><Gamepad2 size={17} /><span>Verified play</span><strong>{minutesLabel(sessionTotals._sum.activeSeconds ?? 0)}</strong></div>
            <div><CheckCircle2 size={17} /><span>Delivered perks</span><strong>{deliveredPurchases}</strong></div>
          </div>
        </div>
      </section>

      <div className="container profile-content-grid">
        <div className="profile-main-column">
          <section className="panel profile-about-section">
            <div className="panel-header compact-heading"><div><p className="eyebrow"><Globe2 size={14} /> About</p><h2>The server story</h2></div></div>
            <p className="profile-long-copy">{server.longDescription || server.description}</p>
            <div className="inline-actions external-links">
              {server.websiteUrl ? <a className="ghost-button" href={server.websiteUrl} target="_blank" rel="noreferrer"><Globe2 size={15} /> Website</a> : null}
              {server.discordUrl ? <a className="ghost-button" href={server.discordUrl} target="_blank" rel="noreferrer"><MessageSquare size={15} /> Discord</a> : null}
              {server.supportUrl ? <a className="ghost-button" href={server.supportUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> External support</a> : null}
            </div>
          </section>

          {gallery.length ? (
            <section className="profile-gallery" aria-label={`${server.name} screenshots`}>
              {gallery.map((image, index) => <div className="gallery-image" key={`${image}-${index}`} style={{ backgroundImage: `url(${image})` }}><span>View {index + 1}</span></div>)}
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-header compact-heading"><div><p className="eyebrow"><Coins size={14} /> Store</p><h2>Spend earned points</h2><p>Campaign credits cannot be used here. Only points earned by playing can buy these items.</p></div></div>
            <ServerProfileActions
              serverId={server.id}
              authenticated={Boolean(user)}
              liked={Boolean(server.likes.length)}
              favorited={Boolean(server.favorites.length)}
              likes={server._count.likes}
              favorites={server._count.favorites}
              items={server.items.map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description,
                pricePoints: item.pricePoints,
                requiresOnline: item.requiresOnline
              }))}
            />
          </section>

          <section className="panel">
            <div className="panel-header compact-heading"><div><p className="eyebrow"><MessageSquare size={14} /> Community</p><h2>Verified player reviews</h2><p>Players must meet this server&apos;s {minutesLabel(server.minPlaySecondsForComment)} verified-play requirement before posting.</p></div><span className="badge">{server._count.comments}</span></div>
            <div className="review-list">
              {server.comments.map((comment) => {
                const initials = comment.user.username.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
                return <article className="review-card" key={comment.id}><div className="mini-avatar" style={comment.user.avatarUrl ? { backgroundImage: `url(${comment.user.avatarUrl})` } : undefined}>{!comment.user.avatarUrl ? initials : null}</div><div><div><strong>{comment.user.username}</strong><span>{shortDate(comment.createdAt)}</span></div><p>{comment.body}</p></div></article>;
              })}
              {!server.comments.length ? <div className="empty-state compact-empty">No verified reviews yet.</div> : null}
            </div>
          </section>
        </div>

        <aside className="profile-side-column">
          <section className="panel owner-profile-card">
            <div className="profile-avatar small" style={server.owner.avatarUrl ? { backgroundImage: `url(${server.owner.avatarUrl})` } : undefined}>{!server.owner.avatarUrl ? ownerInitials : null}</div>
            <p className="eyebrow">Server creator</p>
            <h3>{server.owner.username}</h3>
            <p>{server.owner.bio || "KarixMC community creator."}</p>
            <span>Member since {shortDate(server.owner.createdAt)}</span>
            <Link className="ghost-button" href={`/members/${server.owner.id}`}><ExternalLink size={15} /> View member profile</Link>
          </section>

          <section className="panel trust-panel">
            <div className="panel-header compact-heading"><div><p className="eyebrow"><ShieldCheck size={14} /> Integrity</p><h3>Reward protection</h3></div></div>
            <div className="trust-check-list">
              <div><ShieldCheck size={17} /><span><strong>Signed bridge</strong><small>{server.lastPluginVersion || "No version reported"}</small></span></div>
              <div><Clock3 size={17} /><span><strong>Plugin connection</strong><small>{server.lastConfigSyncAt ? shortDate(server.lastConfigSyncAt) : "Not connected"}</small></span></div>
              <div><RadioTower size={17} /><span><strong>Last player activity</strong><small>{server.lastHeartbeatAt ? shortDate(server.lastHeartbeatAt) : "Waiting for an online player"}</small></span></div>
              <div><Coins size={17} /><span><strong>Rewards issued</strong><small>{points(sessionTotals._sum.rewardedPoints ?? 0)} earned points</small></span></div>
              <div><ShieldAlert size={17} /><span><strong>Open reports</strong><small>{server._count.reports} submitted</small></span></div>
            </div>
            <p className="supporting-copy">KarixMC calculates rewards server-side. Reports and signed heartbeat history help moderators detect missing or suspicious activity.</p>
          </section>

          <section className="panel">
            <div className="panel-header compact-heading"><div><p className="eyebrow"><Users size={14} /> Activity</p><h3>Hourly averages</h3></div></div>
            <div className="hourly-stat-list">
              {server.hourlyStats.map((stat) => {
                const average = stat.sampleCount ? Math.round(stat.onlinePlayerTotal / stat.sampleCount) : 0;
                return (
                  <div key={stat.id}>
                    <span>{shortDate(stat.hourStart)}</span>
                    <strong>{average} avg</strong>
                    <small>{stat.peakOnline} peak</small>
                  </div>
                );
              })}
              {!server.hourlyStats.length ? <div className="empty-state compact-empty">Hourly samples appear after plugin heartbeats.</div> : null}
            </div>
          </section>

          <section className="panel rules-panel">
            <div className="panel-header compact-heading"><div><p className="eyebrow"><ShieldCheck size={14} /> Rules</p><h3>Before you join</h3></div></div>
            <ol>{rules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
            {!rules.length ? <p className="supporting-copy">The owner has not published server rules yet.</p> : null}
          </section>

          <section className="profile-social-proof">
            <div><Heart size={16} /><strong>{server._count.likes}</strong><span>likes</span></div>
            <div><Star size={16} /><strong>{server._count.favorites}</strong><span>favorites</span></div>
            <div><Users size={16} /><strong>{server._count.sessions}</strong><span>sessions</span></div>
          </section>
        </aside>
      </div>
    </main>
  );
}

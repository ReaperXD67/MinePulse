import Link from "next/link";
import { notFound } from "next/navigation";
import { Coins, ExternalLink, Gamepad2, RadioTower, ShieldCheck } from "lucide-react";
import { minutesLabel, points, shortDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await prisma.user.findUnique({
    where: { id },
    include: {
      ownedServers: {
        where: { status: "ACTIVE", trustStatus: { not: "BLACKLISTED" } },
        orderBy: { createdAt: "desc" }
      },
      sessions: { select: { activeSeconds: true, rewardedPoints: true } }
    }
  });

  if (!member) {
    notFound();
  }

  const initials = member.username.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const activeSeconds = member.sessions.reduce((sum, session) => sum + session.activeSeconds, 0);

  return (
    <main className="container dashboard member-profile-page">
      <section className="member-profile-hero">
        <div className="profile-avatar large" style={member.avatarUrl ? { backgroundImage: `url(${member.avatarUrl})` } : undefined}>{!member.avatarUrl ? initials : null}</div>
        <div>
          <p className="eyebrow"><Gamepad2 size={14} /> MinePulse member</p>
          <h1>{member.username}</h1>
          <p>{member.bio || "Player and community creator on MinePulse."}</p>
          <span>Joined {shortDate(member.createdAt)}</span>
        </div>
      </section>

      <section className="metrics-row">
        <div className="stat-tile"><span>Public servers</span><strong>{member.ownedServers.length}</strong></div>
        <div className="stat-tile"><span>Player level</span><strong>{member.level}</strong></div>
        <div className="stat-tile"><span>Verified play</span><strong>{minutesLabel(activeSeconds)}</strong></div>
        <div className="stat-tile"><span>Lifetime earned</span><strong>{points(member.lifetimeEarnedPoints)}</strong></div>
      </section>

      <section className="panel">
        <div className="panel-header compact-heading"><div><p className="eyebrow"><RadioTower size={14} /> Communities</p><h2>Published servers</h2></div></div>
        <div className="member-server-list">
          {member.ownedServers.map((server) => (
            <Link className="member-server-row" href={`/servers/${server.slug}`} key={server.id}>
              <div><span className={`status-pill trust-${server.trustStatus.toLowerCase()}`}><ShieldCheck size={13} /> {server.trustStatus}</span><h3>{server.name}</h3><p>{server.description}</p></div>
              <div><span><Coins size={14} /> {points(server.pointPool)}</span><ExternalLink size={17} /></div>
            </Link>
          ))}
          {!member.ownedServers.length ? <div className="empty-state compact-empty">This member has no public servers yet.</div> : null}
        </div>
      </section>
    </main>
  );
}

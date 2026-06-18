import { redirect } from "next/navigation";
import Link from "next/link";
import { Coins, Heart, ReceiptText, Timer, Trophy } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { minutesLabel, points } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PlayerPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const [profile, purchases, sessions, favorites, ledger] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.purchase.findMany({
      where: { buyerId: user.id },
      include: { server: true, item: true },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.serverSession.findMany({
      where: { userId: user.id },
      include: { server: true },
      orderBy: { lastHeartbeatAt: "desc" },
      take: 12
    }),
    prisma.favorite.findMany({
      where: { userId: user.id },
      include: { server: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.pointLedger.findMany({
      where: { userId: user.id },
      include: { server: true },
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  const totalEarned = ledger
    .filter((entry) => entry.amountPoints > 0)
    .reduce((sum, entry) => sum + entry.amountPoints, 0);
  const totalSpent = Math.abs(
    ledger.filter((entry) => entry.amountPoints < 0).reduce((sum, entry) => sum + entry.amountPoints, 0)
  );
  const totalPlay = sessions.reduce((sum, session) => sum + session.activeSeconds, 0);

  return (
    <main className="container dashboard">
      <section className="section-bar">
        <div>
          <p className="eyebrow">Player wallet</p>
          <h1>Earn anywhere. Spend where you care.</h1>
          <p>
            {profile?.minecraftName || profile?.username} can use points across every server that accepts MinePulse purchases.
          </p>
        </div>
        <Link className="solid-button" href="/">
          <Trophy size={16} /> Find servers
        </Link>
      </section>

      <section className="metrics-row">
        <div className="stat-tile" style={{ "--accent": "var(--lime)" } as React.CSSProperties}>
          <span>Wallet</span>
          <strong>{points(profile?.walletPoints ?? 0)}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--cyan)" } as React.CSSProperties}>
          <span>Earned</span>
          <strong>{points(totalEarned)}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--gold)" } as React.CSSProperties}>
          <span>Spent</span>
          <strong>{points(totalSpent)}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--rose)" } as React.CSSProperties}>
          <span>Verified play</span>
          <strong>{minutesLabel(totalPlay)}</strong>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Purchases</h2>
              <p>Pending purchases are waiting for the server plugin to deliver the command.</p>
            </div>
            <ReceiptText size={22} />
          </div>
          <div className="table-shell">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Server</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{purchase.item.name}</td>
                    <td>{purchase.server.name}</td>
                    <td>{purchase.status}</td>
                    <td>{purchase.createdAt.toLocaleString()}</td>
                  </tr>
                ))}
                {!purchases.length ? (
                  <tr>
                    <td colSpan={4}>No purchases yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Point ledger</h2>
              <p>Every reward, spend, and refund writes here.</p>
            </div>
            <Coins size={22} />
          </div>
          <div className="split-list">
            {ledger.map((entry) => (
              <div className="shop-card" key={entry.id}>
                <div>
                  <strong>{entry.note}</strong>
                  <p>{entry.server?.name || "Platform"} · {entry.createdAt.toLocaleString()}</p>
                </div>
                <span className="badge">{entry.amountPoints > 0 ? "+" : ""}{points(entry.amountPoints)}</span>
              </div>
            ))}
            {!ledger.length ? <div className="empty-state">No point activity yet.</div> : null}
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Verified sessions</h2>
              <p>AFK seconds do not earn rewards. Active seconds unlock comments.</p>
            </div>
            <Timer size={22} />
          </div>
          <div className="table-shell">
            <table className="table">
              <thead>
                <tr>
                  <th>Server</th>
                  <th>Active</th>
                  <th>AFK</th>
                  <th>Rewarded</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>{session.server.name}</td>
                    <td>{minutesLabel(session.activeSeconds)}</td>
                    <td>{minutesLabel(session.afkSeconds)}</td>
                    <td>{points(session.rewardedPoints)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Favorites</h2>
              <p>Saved servers stay here even when the public list reshuffles.</p>
            </div>
            <Heart size={22} />
          </div>
          <div className="split-list">
            {favorites.map((favorite) => (
              <div className="shop-card" key={favorite.id}>
                <div>
                  <strong>{favorite.server.name}</strong>
                  <p className="mono">{favorite.server.host}:{favorite.server.port}</p>
                </div>
                <span className="badge">{favorite.server.status}</span>
              </div>
            ))}
            {!favorites.length ? <div className="empty-state">No favorite servers yet.</div> : null}
          </div>
        </div>
      </section>
    </main>
  );
}

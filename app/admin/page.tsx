import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminConsole } from "@/components/AdminConsole";
import { AdminSafetyConsole } from "@/components/AdminSafetyConsole";
import { StatsChart } from "@/components/StatsChart";
import { Boxes, Crown, Flag, PackageCheck, RadioTower, ShieldAlert, UserPlus, WalletCards } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { UserRole } from "@/lib/generated/prisma/client";
import { money, points } from "@/lib/format";
import { platformStats } from "@/lib/stats";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ buyers?: string }>;
}) {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== UserRole.ADMIN) {
    return (
      <main className="container dashboard">
        <div className="empty-state">Admin access is required.</div>
      </main>
    );
  }

  const { buyers } = await searchParams;
  const buyerWindow = buyers === "all" ? "all" : Number(buyers || 5);
  const buyerDays = buyerWindow === "all" || ![5, 14, 30].includes(buyerWindow) ? 5 : buyerWindow;
  const buyerSince = buyers === "all" ? null : new Date(Date.now() - buyerDays * 24 * 60 * 60 * 1000);

  const [stats, pointPackages, premiumTiers, servers, billing, promos, reports, enforcement, grantUsers, buyerUsers] = await Promise.all([
    platformStats(),
    prisma.pointPackage.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.premiumTier.findMany({ orderBy: { priority: "desc" } }),
    prisma.server.findMany({
      include: { owner: { select: { username: true } } },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.billingLedger.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { server: true, owner: true } }),
    prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.serverReport.findMany({
      include: { server: true, reporter: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    prisma.enforcementAction.findMany({
      include: { server: { select: { name: true } }, admin: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.user.findMany({
      select: { id: true, username: true, email: true, minecraftName: true, walletPoints: true },
      orderBy: { updatedAt: "desc" },
      take: 50
    }),
    prisma.user.findMany({
      where: buyerSince ? { purchases: { some: { createdAt: { gte: buyerSince } } } } : { purchases: { some: {} } },
      select: {
        id: true,
        username: true,
        email: true,
        minecraftName: true,
        walletPoints: true,
        createdAt: true,
        purchases: {
          where: buyerSince ? { createdAt: { gte: buyerSince } } : undefined,
          include: {
            item: { select: { name: true, pricePoints: true } },
            server: { select: { name: true } }
          },
          orderBy: { createdAt: "desc" },
          take: 8
        },
        _count: { select: { purchases: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    })
  ]);

  const buyerWindowLabel = buyers === "all" ? "all time" : `${buyerDays} days`;
  const bridgeOnlineCutoff = Date.now() - 2 * 60 * 1000;

  return (
    <main className="container dashboard">
      <section className="section-bar">
        <div>
          <p className="eyebrow">Admin control plane</p>
          <h1>Price the economy, moderate servers, read the pulse.</h1>
          <p>Every visible server must be active and funded. Admin changes write to billing and point ledgers.</p>
        </div>
      </section>

      <section className="metrics-row">
        <div className="stat-tile" style={{ "--accent": "var(--lime)" } as React.CSSProperties}>
          <span>Accounts created</span>
          <strong>{stats.users}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--cyan)" } as React.CSSProperties}>
          <span>Players online now</span>
          <strong>{stats.onlinePlayersNow}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--gold)" } as React.CSSProperties}>
          <span>Active funded servers</span>
          <strong>{stats.activeServers}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--rose)" } as React.CSSProperties}>
          <span>Revenue</span>
          <strong>{money(stats.revenueCents)}</strong>
        </div>
      </section>

      <section className="panel admin-ops-panel">
        <div className="panel-header compact-heading">
          <div>
            <p className="eyebrow">Live operations</p>
            <h2>Network health at a glance</h2>
            <p>Connection, moderation, delivery, and economy signals for the whole fleet.</p>
          </div>
        </div>
        <div className="admin-ops-grid">
          <div><Boxes size={18} /><span><small>Listed fleet</small><strong>{stats.totalServers}</strong></span></div>
          <div><RadioTower size={18} /><span><small>Bridges online</small><strong>{stats.bridgeOnlineServers} / {stats.totalServers}</strong></span></div>
          <div><Crown size={18} /><span><small>Live premium</small><strong>{stats.activePremiumServers}</strong></span></div>
          <div><PackageCheck size={18} /><span><small>Pending deliveries</small><strong>{stats.pendingPurchases}</strong></span></div>
          <div><ShieldAlert size={18} /><span><small>Open reports</small><strong>{stats.openReports}</strong></span></div>
          <div><Flag size={18} /><span><small>Flagged sessions</small><strong>{stats.flaggedSessions}</strong></span></div>
          <div><WalletCards size={18} /><span><small>Campaign reserves</small><strong>{points(stats.serverPools)}</strong></span></div>
          <div><WalletCards size={18} /><span><small>Player wallet supply</small><strong>{points(stats.walletTotals)}</strong></span></div>
          <div><UserPlus size={18} /><span><small>New accounts / 24h</small><strong>{stats.newUsers24Hours}</strong></span></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Seven-day point flow</h2>
            <p>Earned points paid to players and spent on server items.</p>
          </div>
        </div>
        <StatsChart data={stats.chart} />
      </section>

      <AdminSafetyConsole
        promos={promos.map((promo) => ({
          id: promo.id,
          code: promo.code,
          bonusPercent: promo.bonusPercent,
          active: promo.active,
          maxRedemptions: promo.maxRedemptions,
          redemptionCount: promo.redemptionCount,
          expiresAt: promo.expiresAt?.toISOString() ?? null
        }))}
        reports={reports.map((report) => ({
          id: report.id,
          serverId: report.serverId,
          serverName: report.server.name,
          reporter: report.reporter.username,
          reason: report.reason,
          details: report.details,
          evidenceUrl: report.evidenceUrl,
          status: report.status,
          adminNote: report.adminNote,
          createdAt: report.createdAt.toISOString(),
          trustStatus: report.server.trustStatus,
          serverStatus: report.server.status,
          pointPool: report.server.pointPool
        }))}
      />

      <AdminConsole
        pointPackages={pointPackages.map((pack) => ({
          id: pack.id,
          kind: "pointPackage",
          label: pack.label,
          points: pack.points,
          priceCents: pack.priceCents,
          active: pack.active
        }))}
        premiumTiers={premiumTiers.map((tier) => ({
          id: tier.id,
          kind: "premiumTier",
          name: tier.name,
          priceCents: tier.priceCents,
          durationDays: tier.durationDays,
          active: tier.active,
          priority: tier.priority
        }))}
        servers={servers.map((server) => ({
          id: server.id,
          name: server.name,
          owner: server.owner.username,
          host: server.host,
          port: server.port,
          tags: server.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          status: server.status,
          pointPool: server.pointPool,
          premiumPlan: server.premiumPlan,
          premiumUntil: server.premiumUntil?.toISOString() ?? null,
          trustStatus: server.trustStatus,
          bridgeOnline: Boolean(
            (server.lastConfigSyncAt?.getTime() ?? 0) >= bridgeOnlineCutoff ||
            (server.lastHeartbeatAt?.getTime() ?? 0) >= bridgeOnlineCutoff
          ),
          lastConfigSyncAt: server.lastConfigSyncAt?.toISOString() ?? null,
          lastPluginVersion: server.lastPluginVersion,
          riskScore: server.riskScore,
          integrityFailures: server.integrityFailures,
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
          botProtectionLevel: server.botProtectionLevel
        }))}
        users={grantUsers.map((account) => ({
          id: account.id,
          username: account.username,
          email: account.email,
          minecraftName: account.minecraftName,
          walletPoints: account.walletPoints
        }))}
      />

      <section className="panel" id="buyers">
        <div className="panel-header">
          <div>
            <h2>Account intelligence</h2>
            <p>Filter item buyers, account creation date, and recent point spend.</p>
          </div>
          <div className="inline-actions">
            <Link className={`tag-filter ${buyers !== "14" && buyers !== "30" && buyers !== "all" ? "active" : ""}`} href="/admin?buyers=5#buyers">5 days</Link>
            <Link className={`tag-filter ${buyers === "14" ? "active" : ""}`} href="/admin?buyers=14#buyers">14 days</Link>
            <Link className={`tag-filter ${buyers === "30" ? "active" : ""}`} href="/admin?buyers=30#buyers">30 days</Link>
            <Link className={`tag-filter ${buyers === "all" ? "active" : ""}`} href="/admin?buyers=all#buyers">All</Link>
          </div>
        </div>
        <div className="table-shell">
          <table className="table buyer-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Created</th>
                <th>Window spend</th>
                <th>Purchases</th>
                <th>Latest items</th>
              </tr>
            </thead>
            <tbody>
              {buyerUsers.map((account) => {
                const windowSpend = account.purchases.reduce((sum, purchase) => sum + purchase.item.pricePoints, 0);
                return (
                  <tr key={account.id}>
                    <td>
                      <strong>{account.username}</strong>
                      <p>{account.minecraftName || account.email}</p>
                    </td>
                    <td>{account.createdAt.toLocaleString()}</td>
                    <td>{points(windowSpend)}</td>
                    <td>{account.purchases.length} in {buyerWindowLabel}<br /><span className="toast-line">{account._count.purchases} lifetime</span></td>
                    <td>
                      {account.purchases.length ? (
                        <div className="purchase-pill-list">
                          {account.purchases.map((purchase) => (
                            <span key={purchase.id}>
                              {purchase.item.name} - {points(purchase.item.pricePoints)} - {purchase.server.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "No purchases in window"
                      )}
                    </td>
                  </tr>
                );
              })}
              {!buyerUsers.length ? <tr><td colSpan={5}>No buyers found for this window.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header compact-heading"><div><h2>Enforcement history</h2><p>Warnings, pauses, blacklists, credit removals, and restorations.</p></div></div>
        <div className="table-shell"><table className="table"><thead><tr><th>When</th><th>Server</th><th>Action</th><th>Credits removed</th><th>Admin</th><th>Reason</th></tr></thead><tbody>
          {enforcement.map((action) => <tr key={action.id}><td>{action.createdAt.toLocaleString()}</td><td>{action.server.name}</td><td>{action.type}</td><td>{action.pointsRemoved}</td><td>{action.admin.username}</td><td>{action.reason}</td></tr>)}
          {!enforcement.length ? <tr><td colSpan={6}>No enforcement actions yet.</td></tr> : null}
        </tbody></table></div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Recent money events</h2>
            <p>Top-ups, premium buys, and admin adjustments.</p>
          </div>
        </div>
        <div className="table-shell">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Owner</th>
                <th>Server</th>
                <th>Kind</th>
                <th>Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {billing.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.createdAt.toLocaleString()}</td>
                  <td>{entry.owner.username}</td>
                  <td>{entry.server?.name || "Platform"}</td>
                  <td>{entry.kind}</td>
                  <td>{money(entry.moneyCents)}</td>
                  <td>{entry.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

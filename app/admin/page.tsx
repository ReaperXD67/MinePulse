import { redirect } from "next/navigation";
import { AdminConsole } from "@/components/AdminConsole";
import { AdminSafetyConsole } from "@/components/AdminSafetyConsole";
import { StatsChart } from "@/components/StatsChart";
import { currentUser } from "@/lib/auth";
import { UserRole } from "@/lib/generated/prisma/client";
import { money, points } from "@/lib/format";
import { platformStats } from "@/lib/stats";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
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

  const [stats, pointPackages, premiumTiers, servers, billing, promos, reports, enforcement] = await Promise.all([
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
    })
  ]);

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
          <span>Users</span>
          <strong>{stats.users}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--cyan)" } as React.CSSProperties}>
          <span>Active funded servers</span>
          <strong>{stats.activeServers}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--gold)" } as React.CSSProperties}>
          <span>Revenue</span>
          <strong>{money(stats.revenueCents)}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--rose)" } as React.CSSProperties}>
          <span>Server pools</span>
          <strong>{points(stats.serverPools)}</strong>
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
          status: server.status,
          pointPool: server.pointPool,
          premiumPlan: server.premiumPlan,
          premiumUntil: server.premiumUntil?.toISOString() ?? null,
          trustStatus: server.trustStatus
        }))}
      />

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

import Link from "next/link";
import { redirect } from "next/navigation";
import { OwnerConsole } from "@/components/OwnerConsole";
import { currentUser } from "@/lib/auth";
import { UserRole } from "@/lib/generated/prisma/client";
import { compact, money, points } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
    return (
      <main className="container dashboard">
        <div className="empty-state">
          Owner access is required. <Link href="/login">Switch account</Link>
        </div>
      </main>
    );
  }

  const [servers, pointPackages, premiumTiers, billing, rewards] = await Promise.all([
    prisma.server.findMany({
      where: user.role === UserRole.ADMIN ? {} : { ownerId: user.id },
      include: { items: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.pointPackage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.premiumTier.findMany({ where: { active: true }, orderBy: { priority: "desc" } }),
    prisma.billingLedger.aggregate({
      where: user.role === UserRole.ADMIN ? {} : { ownerId: user.id },
      _sum: { moneyCents: true, amountPoints: true }
    }),
    prisma.pointLedger.aggregate({
      where: {
        server: user.role === UserRole.ADMIN ? undefined : { ownerId: user.id },
        type: "PLAYER_REWARD"
      },
      _sum: { amountPoints: true }
    })
  ]);

  return (
    <main className="container dashboard">
      <section className="section-bar">
        <div>
          <p className="eyebrow">Owner cockpit</p>
          <h1>Fund growth, tune rewards, ship perks.</h1>
          <p>Server listings disappear when their pool hits zero. Premium buys top-lane visibility.</p>
        </div>
      </section>

      <section className="metrics-row">
        <div className="stat-tile" style={{ "--accent": "var(--lime)" } as React.CSSProperties}>
          <span>Total pool</span>
          <strong>{points(servers.reduce((sum, server) => sum + server.pointPool, 0))}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--cyan)" } as React.CSSProperties}>
          <span>Servers</span>
          <strong>{servers.length}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--gold)" } as React.CSSProperties}>
          <span>Real spend</span>
          <strong>{money(billing._sum.moneyCents ?? 0)}</strong>
        </div>
        <div className="stat-tile" style={{ "--accent": "var(--rose)" } as React.CSSProperties}>
          <span>Rewards paid</span>
          <strong>{compact(rewards._sum.amountPoints ?? 0)}</strong>
        </div>
      </section>

      <OwnerConsole
        servers={servers.map((server) => ({
          id: server.id,
          name: server.name,
          host: server.host,
          port: server.port,
          description: server.description,
          status: server.status,
          pointPool: server.pointPool,
          rewardRatePerSecond: server.rewardRatePerSecond,
          maxPaidPlayers: server.maxPaidPlayers,
          minPlaySecondsForComment: server.minPlaySecondsForComment,
          premiumPlan: server.premiumPlan,
          premiumUntil: server.premiumUntil?.toISOString() ?? null,
          pluginSecret: server.pluginSecret,
          items: server.items.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            pricePoints: item.pricePoints,
            command: item.command,
            status: item.status
          }))
        }))}
        pointPackages={pointPackages.map((pack) => ({
          id: pack.id,
          label: pack.label,
          points: pack.points,
          priceCents: pack.priceCents
        }))}
        premiumTiers={premiumTiers.map((tier) => ({
          id: tier.id,
          name: tier.name,
          priceCents: tier.priceCents,
          durationDays: tier.durationDays,
          priority: tier.priority
        }))}
      />
    </main>
  );
}

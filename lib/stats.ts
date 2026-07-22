import { LedgerType, PremiumPlanCode, PurchaseStatus, ReportStatus, ServerStatus, SessionStatus } from "@/lib/generated/prisma/client";
import { weekdayLabel } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type ChartPoint = {
  label: string;
  rewards: number;
  spend: number;
};

export async function platformStats() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const onlineCutoff = new Date(Date.now() - 2 * 60 * 1000);
  const [
    users,
    activeServers,
    onlinePlayersNow,
    purchases,
    billing,
    serverPools,
    walletTotals,
    ledgers,
    totalServers,
    bridgeOnlineServers,
    pendingPurchases,
    openReports,
    activePremiumServers,
    newUsers24Hours,
    flaggedSessions
  ] = await Promise.all([
    prisma.user.count(),
    prisma.server.count({ where: { status: "ACTIVE", pointPool: { gt: 0 } } }),
    prisma.serverSession.count({ where: { status: "ACTIVE", lastHeartbeatAt: { gte: onlineCutoff } } }),
    prisma.purchase.count(),
    prisma.billingLedger.aggregate({ _sum: { moneyCents: true } }),
    prisma.server.aggregate({ _sum: { pointPool: true } }),
    prisma.user.aggregate({ _sum: { walletPoints: true } }),
    prisma.pointLedger.findMany({
      where: {
        createdAt: { gte: since },
        type: { in: [LedgerType.PLAYER_REWARD, LedgerType.PLAYER_SPEND] }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.server.count({ where: { status: { not: ServerStatus.REMOVED } } }),
    prisma.server.count({
      where: {
        status: ServerStatus.ACTIVE,
        OR: [
          { lastConfigSyncAt: { gte: onlineCutoff } },
          { lastHeartbeatAt: { gte: onlineCutoff } }
        ]
      }
    }),
    prisma.purchase.count({ where: { status: PurchaseStatus.PENDING } }),
    prisma.serverReport.count({ where: { status: { in: [ReportStatus.OPEN, ReportStatus.REVIEWING] } } }),
    prisma.server.count({
      where: {
        status: ServerStatus.ACTIVE,
        premiumPlan: { not: PremiumPlanCode.NONE },
        premiumUntil: { gt: new Date() }
      }
    }),
    prisma.user.count({ where: { createdAt: { gte: since24Hours } } }),
    prisma.serverSession.count({ where: { status: SessionStatus.FLAGGED } })
  ]);

  return {
    users,
    activeServers,
    onlinePlayersNow,
    purchases,
    revenueCents: billing._sum.moneyCents ?? 0,
    serverPools: serverPools._sum.pointPool ?? 0,
    walletTotals: walletTotals._sum.walletPoints ?? 0,
    totalServers,
    bridgeOnlineServers,
    pendingPurchases,
    openReports,
    activePremiumServers,
    newUsers24Hours,
    flaggedSessions,
    chart: ledgerChart(ledgers)
  };
}

export function ledgerChart(
  ledgers: Array<{ createdAt: Date; type: LedgerType; amountPoints: number }>
): ChartPoint[] {
  const days = new Map<string, ChartPoint>();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    days.set(key, {
      label: weekdayLabel(date),
      rewards: 0,
      spend: 0
    });
  }

  for (const ledger of ledgers) {
    const key = ledger.createdAt.toISOString().slice(0, 10);
    const point = days.get(key);
    if (!point) {
      continue;
    }

    if (ledger.type === LedgerType.PLAYER_REWARD) {
      point.rewards += Math.abs(ledger.amountPoints);
    }

    if (ledger.type === LedgerType.PLAYER_SPEND) {
      point.spend += Math.abs(ledger.amountPoints);
    }
  }

  return Array.from(days.values());
}

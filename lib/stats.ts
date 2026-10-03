import { PremiumPlanCode, PurchaseStatus, ReportStatus, ServerStatus, SessionStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ledgerChart, POINT_FLOW_LEDGER_TYPES, pointFlowStart } from "@/lib/point-flow";

export { ledgerChart } from "@/lib/point-flow";
export type { ChartPoint } from "@/lib/point-flow";

export async function platformStats() {
  const now = new Date();
  const since = pointFlowStart(now);
  const since24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const onlineCutoff = new Date(Date.now() - 2 * 60 * 1000);
  const [
    users,
    activeServers,
    onlinePlayers,
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
    prisma.serverSession.findMany({
      where: { status: "ACTIVE", lastHeartbeatAt: { gte: onlineCutoff } },
      select: { userId: true },
      distinct: ["userId"]
    }),
    prisma.purchase.count(),
    prisma.billingLedger.aggregate({ _sum: { moneyCents: true } }),
    prisma.server.aggregate({ _sum: { pointPool: true } }),
    prisma.user.aggregate({ _sum: { walletPoints: true } }),
    prisma.pointLedger.findMany({
      where: {
        createdAt: { gte: since, lte: now },
        type: { in: POINT_FLOW_LEDGER_TYPES }
      },
      select: { createdAt: true, type: true, amountPoints: true },
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
    onlinePlayersNow: onlinePlayers.length,
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
    chart: ledgerChart(ledgers, now)
  };
}

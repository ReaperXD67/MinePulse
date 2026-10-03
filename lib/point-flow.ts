import { LedgerType } from "@/lib/generated/prisma/enums";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ChartPoint = {
  date: string;
  label: string;
  dateLabel: string;
  isToday: boolean;
  play: number;
  bonuses: number;
  spend: number;
};

export const POINT_FLOW_LEDGER_TYPES = [
  LedgerType.PLAYER_REWARD,
  LedgerType.LEVEL_REWARD,
  LedgerType.DAILY_REWARD,
  LedgerType.PLAYER_SPEND
];

/** Seven UTC calendar days, including the current (incomplete) day. */
export function pointFlowStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * DAY_MS);
}

export function ledgerChart(
  ledgers: Array<{ createdAt: Date; type: LedgerType; amountPoints: number }>,
  now = new Date()
): ChartPoint[] {
  const start = pointFlowStart(now);
  const today = now.toISOString().slice(0, 10);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
  const fullDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
  });
  const days = new Map<string, ChartPoint>();

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start.getTime() + offset * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    days.set(key, {
      date: key,
      label: weekday.format(date),
      dateLabel: fullDate.format(date),
      isToday: key === today,
      play: 0,
      bonuses: 0,
      spend: 0
    });
  }

  for (const ledger of ledgers) {
    if (ledger.createdAt.getTime() > now.getTime()) continue;
    const point = days.get(ledger.createdAt.toISOString().slice(0, 10));
    if (!point) continue;

    // Only earned credits count as earnings. Refunds and manual wallet changes
    // are not rewards; server campaign credits never entered player wallets.
    if (ledger.type === LedgerType.PLAYER_REWARD) {
      point.play += Math.max(0, ledger.amountPoints);
    } else if (ledger.type === LedgerType.LEVEL_REWARD || ledger.type === LedgerType.DAILY_REWARD) {
      point.bonuses += Math.max(0, ledger.amountPoints);
    } else if (ledger.type === LedgerType.PLAYER_SPEND) {
      point.spend += Math.max(0, -ledger.amountPoints);
    }
  }

  return Array.from(days.values());
}

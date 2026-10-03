import assert from "node:assert/strict";
import { LedgerType } from "../lib/generated/prisma/enums";
import { ledgerChart, pointFlowStart } from "../lib/point-flow";

const now = new Date("2026-10-03T12:30:00.000Z");
const entry = (createdAt: string, type: LedgerType, amountPoints: number) => ({
  createdAt: new Date(createdAt), type, amountPoints
});

assert.equal(pointFlowStart(now).toISOString(), "2026-09-27T00:00:00.000Z");
assert.equal(pointFlowStart(new Date("2026-01-02T00:00:00Z")).toISOString(), "2025-12-27T00:00:00.000Z");

const chart = ledgerChart([
  entry("2026-09-26T23:59:59.999Z", LedgerType.PLAYER_REWARD, 999),
  entry("2026-09-27T00:00:00.000Z", LedgerType.PLAYER_REWARD, 50),
  entry("2026-10-02T23:59:59.999Z", LedgerType.PLAYER_REWARD, 100),
  entry("2026-10-03T00:00:00.000Z", LedgerType.PLAYER_REWARD, 200),
  entry("2026-10-03T12:30:00.000Z", LedgerType.PLAYER_REWARD, 25),
  entry("2026-10-03T12:30:00.001Z", LedgerType.PLAYER_REWARD, 999),
  entry("2026-10-03T10:00:00.000Z", LedgerType.DAILY_REWARD, 7),
  entry("2026-10-03T10:00:00.000Z", LedgerType.LEVEL_REWARD, 20),
  entry("2026-10-03T10:00:00.000Z", LedgerType.PLAYER_SPEND, -80),
  // These affect other accounts or correct balances, and are not earned points.
  entry("2026-10-03T10:00:00.000Z", LedgerType.SERVER_TOPUP, 5000),
  entry("2026-10-03T10:00:00.000Z", LedgerType.PROMO_BONUS, 500),
  entry("2026-10-03T10:00:00.000Z", LedgerType.ADMIN_ADJUSTMENT, 1000),
  entry("2026-10-03T10:00:00.000Z", LedgerType.PURCHASE_REFUND, 80),
  // Invalid direction must not turn debits into earnings or credits into spending.
  entry("2026-10-03T10:00:00.000Z", LedgerType.PLAYER_REWARD, -5),
  entry("2026-10-03T10:00:00.000Z", LedgerType.DAILY_REWARD, -7),
  entry("2026-10-03T10:00:00.000Z", LedgerType.PLAYER_SPEND, 5)
], now);

assert.equal(chart.length, 7);
assert.deepEqual(chart.map((day) => day.date), ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]);
assert.equal(chart[0].play, 50, "First day includes the full UTC calendar day");
assert.equal(chart[5].play, 100, "Midnight divides earnings into separate days");
assert.deepEqual({ play: chart[6].play, bonuses: chart[6].bonuses, spend: chart[6].spend }, { play: 225, bonuses: 27, spend: 80 });
assert.deepEqual(chart.map((day) => day.isToday), [false, false, false, false, false, false, true]);
assert.equal(chart[6].dateLabel, "Sat, Oct 3, 2026");
assert.equal(chart[6].label, "Sat");
assert.deepEqual(chart.slice(1, 5).map(({ play, bonuses, spend }) => ({ play, bonuses, spend })), Array.from({ length: 4 }, () => ({ play: 0, bonuses: 0, spend: 0 })));

const empty = ledgerChart([], now);
assert.equal(empty.length, 7, "Empty datasets preserve all seven days");
assert.equal(empty.every((day) => day.play === 0 && day.bonuses === 0 && day.spend === 0), true);
console.log("Point flow audit passed: UTC boundaries, partial today, distinct reward sources, spend direction, exclusions, and zero-filled days.");

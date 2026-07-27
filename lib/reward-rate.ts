export const MIN_REWARD_RATE_PER_SECOND = 1;
export const MAX_REWARD_RATE_PER_SECOND = 3;
export const REWARD_RATE_STEP = 0.5;

export type RewardRateVisualTier = "standard" | "boosted" | "high" | "apex";

export function cappedRewardRate(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.min(MAX_REWARD_RATE_PER_SECOND, rate);
}

export function rewardRateVisualTier(rate: number): RewardRateVisualTier {
  if (rate >= 2.5) return "apex";
  if (rate >= 2) return "high";
  if (rate >= 1.5) return "boosted";
  return "standard";
}

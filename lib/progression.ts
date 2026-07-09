export const DAILY_REWARD_COOLDOWN_HOURS = 20;
export const DAILY_REWARD_MIN_POINTS = 1000;
export const DAILY_REWARD_MAX_POINTS = 5000;

export type LevelReward = {
  level: number;
  requiredPoints: number;
  rewardPoints: number;
};

export function levelRequiredPoints(level: number) {
  return Math.floor((level * (level + 1) * 1000) / 2);
}

export function levelRewardPoints(level: number) {
  return level * 500;
}

export function levelReward(level: number): LevelReward {
  return {
    level,
    requiredPoints: levelRequiredPoints(level),
    rewardPoints: levelRewardPoints(level)
  };
}

export function levelFromLifetimePoints(lifetimeEarnedPoints: number) {
  let level = 0;

  while (lifetimeEarnedPoints >= levelRequiredPoints(level + 1) && level < 500) {
    level += 1;
  }

  return level;
}

export function claimableLevelRewards(currentLevel: number, lifetimeEarnedPoints: number) {
  const targetLevel = levelFromLifetimePoints(lifetimeEarnedPoints);
  const rewards: LevelReward[] = [];

  for (let level = currentLevel + 1; level <= targetLevel; level += 1) {
    rewards.push(levelReward(level));
  }

  return rewards;
}

export function nextLevelProgress(currentLevel: number, lifetimeEarnedPoints: number) {
  const nextLevel = currentLevel + 1;
  const previousRequired = currentLevel > 0 ? levelRequiredPoints(currentLevel) : 0;
  const nextRequired = levelRequiredPoints(nextLevel);
  const span = Math.max(1, nextRequired - previousRequired);
  const gained = Math.max(0, lifetimeEarnedPoints - previousRequired);

  return {
    currentLevel,
    nextLevel,
    previousRequired,
    nextRequired,
    neededPoints: Math.max(0, nextRequired - lifetimeEarnedPoints),
    percent: Math.min(100, Math.round((gained / span) * 100)),
    nextRewardPoints: levelRewardPoints(nextLevel)
  };
}

export function nextDailyClaimAt(lastDailyClaimAt: Date | string | null | undefined) {
  if (!lastDailyClaimAt) {
    return null;
  }

  const last = typeof lastDailyClaimAt === "string" ? new Date(lastDailyClaimAt) : lastDailyClaimAt;
  return new Date(last.getTime() + DAILY_REWARD_COOLDOWN_HOURS * 60 * 60 * 1000);
}

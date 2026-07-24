import { weightedShuffle } from "@/lib/random";

export const ORGANIC_SPOTLIGHT_CHANCE = 0.15;

type VisibilitySignals = {
  likes: number;
  favorites: number;
  comments: number;
};

export function standardVisibilityWeight(server: VisibilitySignals) {
  const baseChance = 100;
  const likeBoost = Math.min(30, Math.max(0, server.likes));
  const favoriteBoost = Math.min(40, Math.max(0, server.favorites) * 2);
  const commentBoost = Math.min(10, Math.max(0, server.comments));
  return baseChance + likeBoost + favoriteBoost + commentBoost;
}

export function orderDirectory<T extends VisibilitySignals>({
  premium,
  standard,
  premiumWeightFor,
  random = Math.random
}: {
  premium: T[];
  standard: T[];
  premiumWeightFor: (server: T) => number;
  random?: () => number;
}) {
  const organicSpotlight = premium.length > 0 && standard.length > 0 && random() < ORGANIC_SPOTLIGHT_CHANCE;
  const orderedPremium = weightedShuffle(premium, premiumWeightFor, random);
  const orderedStandard = weightedShuffle(standard, standardVisibilityWeight, random);

  if (!organicSpotlight) {
    return { servers: [...orderedPremium, ...orderedStandard], organicSpotlight: false };
  }

  const [spotlight, ...remainingStandard] = orderedStandard;
  return {
    servers: [spotlight, ...orderedPremium, ...remainingStandard],
    organicSpotlight: true
  };
}

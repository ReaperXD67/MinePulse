import { weightedShuffle } from "@/lib/random";

export const FIRST_POSITION_CHANCES = {
  DIAMOND: 0.45,
  GOLD: 0.35,
  STANDARD: 0.2
} as const;

export type DirectoryLane = keyof typeof FIRST_POSITION_CHANCES;

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
  premiumTierFor,
  random = Math.random
}: {
  premium: T[];
  standard: T[];
  premiumWeightFor: (server: T) => number;
  premiumTierFor: (server: T) => Exclude<DirectoryLane, "STANDARD">;
  random?: () => number;
}) {
  const premiumVisibilityWeight = (server: T) =>
    premiumWeightFor(server) * standardVisibilityWeight(server);
  const orderedDiamond = weightedShuffle(
    premium.filter((server) => premiumTierFor(server) === "DIAMOND"),
    premiumVisibilityWeight,
    random
  );
  const orderedGold = weightedShuffle(
    premium.filter((server) => premiumTierFor(server) === "GOLD"),
    premiumVisibilityWeight,
    random
  );
  const orderedStandard = weightedShuffle(standard, standardVisibilityWeight, random);
  const availableLanes = [
    { lane: "DIAMOND" as const, chance: FIRST_POSITION_CHANCES.DIAMOND, servers: orderedDiamond },
    { lane: "GOLD" as const, chance: FIRST_POSITION_CHANCES.GOLD, servers: orderedGold },
    { lane: "STANDARD" as const, chance: FIRST_POSITION_CHANCES.STANDARD, servers: orderedStandard }
  ].filter((entry) => entry.servers.length > 0);

  if (!availableLanes.length) {
    return { servers: [], firstPositionLane: null, organicSpotlight: false };
  }

  const availableChance = availableLanes.reduce((total, entry) => total + entry.chance, 0);
  let roll = random() * availableChance;
  const selectedLane = availableLanes.find((entry) => {
    roll -= entry.chance;
    return roll < 0;
  }) ?? availableLanes[availableLanes.length - 1];
  const firstServer = selectedLane.servers[0];
  const remainingPremium = weightedShuffle(
    [...orderedDiamond, ...orderedGold].filter((server) => server !== firstServer),
    premiumVisibilityWeight,
    random
  );
  const remainingStandard = orderedStandard.filter((server) => server !== firstServer);

  return {
    servers: [firstServer, ...remainingPremium, ...remainingStandard],
    firstPositionLane: selectedLane.lane,
    organicSpotlight: selectedLane.lane === "STANDARD"
  };
}

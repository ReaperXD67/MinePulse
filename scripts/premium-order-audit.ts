import assert from "node:assert/strict";
import {
  FIRST_POSITION_CHANCES,
  orderDirectory,
  standardVisibilityWeight
} from "../lib/directory-order";
import { createSeededRandom } from "../lib/random";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

type AuditServer = {
  name: string;
  tier: "DIAMOND" | "GOLD" | "STANDARD";
  weight: number;
  likes: number;
  favorites: number;
  comments: number;
};

const competitors: AuditServer[] = [
  { name: "Diamond", tier: "DIAMOND", weight: 2, likes: 0, favorites: 0, comments: 0 },
  { name: "Gold", tier: "GOLD", weight: 1, likes: 0, favorites: 0, comments: 0 }
];
const standard: AuditServer = { name: "Standard", tier: "STANDARD", weight: 0, likes: 0, favorites: 0, comments: 0 };
const random = seededRandom(0x4b415249);
const draws = 90000;
let diamondFirst = 0;
let goldFirst = 0;
let standardFirst = 0;

for (let draw = 0; draw < draws; draw += 1) {
  const result = orderDirectory({
    premium: competitors,
    standard: [standard],
    premiumWeightFor: (entry) => entry.weight,
    premiumTierFor: (entry) => entry.tier === "DIAMOND" ? "DIAMOND" : "GOLD",
    random
  }).servers;
  assert.deepEqual(result.map((entry) => entry.name).sort(), ["Diamond", "Gold", "Standard"]);
  if (result[0].name === "Diamond") diamondFirst += 1;
  if (result[0].name === "Gold") goldFirst += 1;
  if (result[0].name === "Standard") standardFirst += 1;
}

const observedDiamondChance = diamondFirst / draws;
const observedGoldChance = goldFirst / draws;
const observedStandardChance = standardFirst / draws;
assert.ok(
  observedDiamondChance > 0.44 && observedDiamondChance < 0.46,
  `Expected Diamond near 45% overall, observed ${(observedDiamondChance * 100).toFixed(2)}%`
);
assert.ok(observedGoldChance > 0.34 && observedGoldChance < 0.36);
assert.ok(observedStandardChance > 0.19 && observedStandardChance < 0.21);

const newServer = { likes: 0, favorites: 0, comments: 0 };
const popularServer = { likes: 999, favorites: 999, comments: 999 };
assert.equal(standardVisibilityWeight(newServer), 100);
assert.equal(standardVisibilityWeight(popularServer), 180);

const stableDirectoryInput = {
  premium: competitors,
  standard: [standard],
  premiumWeightFor: (entry: AuditServer) => entry.weight,
  premiumTierFor: (entry: AuditServer) => entry.tier === "DIAMOND" ? "DIAMOND" as const : "GOLD" as const
};
const firstStableDraw = orderDirectory({
  ...stableDirectoryInput,
  random: createSeededRandom("same-browser-seed")
}).servers.map((entry) => entry.name);
const secondStableDraw = orderDirectory({
  ...stableDirectoryInput,
  random: createSeededRandom("same-browser-seed")
}).servers.map((entry) => entry.name);
assert.deepEqual(firstStableDraw, secondStableDraw, "The same browser seed produced a different directory order");

console.log(JSON.stringify({
  ok: true,
  draws,
  observedFirstPlacePercent: {
    diamond: Number((observedDiamondChance * 100).toFixed(2)),
    gold: Number((observedGoldChance * 100).toFixed(2)),
    standard: Number((observedStandardChance * 100).toFixed(2))
  },
  expectedFirstPlacePercent: {
    diamond: FIRST_POSITION_CHANCES.DIAMOND * 100,
    gold: FIRST_POSITION_CHANCES.GOLD * 100,
    standard: FIRST_POSITION_CHANCES.STANDARD * 100
  },
  standardVisibilityWeight: { newServer: 100, cappedPopularServer: 180 },
  stableDraw: firstStableDraw,
  rule: "Diamond leads 45%, Gold leads 35%, and a balanced standard server leads 20%; one browser seed stays stable until an explicit shuffle."
}, null, 2));

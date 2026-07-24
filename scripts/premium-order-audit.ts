import assert from "node:assert/strict";
import {
  ORGANIC_SPOTLIGHT_CHANCE,
  orderDirectory,
  standardVisibilityWeight
} from "../lib/directory-order";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const competitors = [
  { name: "Diamond", weight: 2, likes: 0, favorites: 0, comments: 0 },
  { name: "Gold", weight: 1, likes: 0, favorites: 0, comments: 0 }
];
const standard = { name: "Standard", weight: 0, likes: 0, favorites: 0, comments: 0 };
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
  observedDiamondChance > 0.55 && observedDiamondChance < 0.585,
  `Expected Diamond near 56.7% overall, observed ${(observedDiamondChance * 100).toFixed(2)}%`
);
assert.ok(observedGoldChance > 0.27 && observedGoldChance < 0.30);
assert.ok(observedStandardChance > 0.14 && observedStandardChance < 0.16);

const newServer = { likes: 0, favorites: 0, comments: 0 };
const popularServer = { likes: 999, favorites: 999, comments: 999 };
assert.equal(standardVisibilityWeight(newServer), 100);
assert.equal(standardVisibilityWeight(popularServer), 180);

console.log(JSON.stringify({
  ok: true,
  draws,
  observedFirstPlacePercent: {
    diamond: Number((observedDiamondChance * 100).toFixed(2)),
    gold: Number((observedGoldChance * 100).toFixed(2)),
    standard: Number((observedStandardChance * 100).toFixed(2))
  },
  expectedFirstPlacePercent: { diamond: 56.67, gold: 28.33, standard: ORGANIC_SPOTLIGHT_CHANCE * 100 },
  standardVisibilityWeight: { newServer: 100, cappedPopularServer: 180 },
  rule: "Premium leads 85% of refreshes; a balanced standard-server spotlight leads 15%."
}, null, 2));

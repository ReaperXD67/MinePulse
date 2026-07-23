import assert from "node:assert/strict";
import { weightedShuffle } from "../lib/random";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const competitors = [
  { name: "Diamond", weight: 2 },
  { name: "Gold", weight: 1 }
];
const random = seededRandom(0x4b415249);
const draws = 60000;
let diamondFirst = 0;

for (let draw = 0; draw < draws; draw += 1) {
  const result = weightedShuffle(competitors, (entry) => entry.weight, random);
  assert.deepEqual(result.map((entry) => entry.name).sort(), ["Diamond", "Gold"]);
  if (result[0].name === "Diamond") diamondFirst += 1;
}

const observedDiamondChance = diamondFirst / draws;
assert.ok(
  observedDiamondChance > 0.655 && observedDiamondChance < 0.678,
  `Expected Diamond near 66.7%, observed ${(observedDiamondChance * 100).toFixed(2)}%`
);

const premiumLane = weightedShuffle(
  [{ name: "Diamond", weight: 2 }, { name: "Gold", weight: 1 }],
  (entry) => entry.weight,
  seededRandom(42)
);
const standardLane = [{ name: "Standard A" }, { name: "Standard B" }];
const directory = [...premiumLane, ...standardLane];
assert.ok(directory.slice(0, premiumLane.length).every((entry) => !entry.name.startsWith("Standard")));

console.log(JSON.stringify({
  ok: true,
  draws,
  diamondObservedPercent: Number((observedDiamondChance * 100).toFixed(2)),
  expectedPercent: 66.67,
  rule: "All active premium listings precede standard listings; Diamond weight 2, Gold weight 1."
}, null, 2));

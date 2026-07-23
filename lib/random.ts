import crypto from "node:crypto";

export function shuffle<T>(items: T[], random: () => number = Math.random) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

export function weightedShuffle<T>(
  items: T[],
  weightFor: (item: T) => number,
  random: () => number = Math.random
) {
  const remaining = [...items];
  const result: T[] = [];

  while (remaining.length) {
    const weights = remaining.map((item) => Math.max(0, weightFor(item)));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    if (totalWeight <= 0) {
      result.push(...shuffle(remaining, random));
      break;
    }

    let ticket = random() * totalWeight;
    let selectedIndex = weights.length - 1;

    for (let index = 0; index < weights.length; index += 1) {
      ticket -= weights[index];
      if (ticket < 0) {
        selectedIndex = index;
        break;
      }
    }

    result.push(remaining[selectedIndex]);
    remaining.splice(selectedIndex, 1);
  }

  return result;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52);
}

export function makePluginSecret() {
  return crypto.randomBytes(24).toString("hex");
}

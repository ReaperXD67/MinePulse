export const BETA_MANUAL_PAYMENT = {
  beneficiary: "Damian Dawid Stoklosa",
  iban: "BE11967051660748",
  ibanDisplay: "BE11 9670 5166 0748",
  currency: "EUR",
  descriptionFormat: "<KarixMC username or account email> <package code>",
  descriptionExample: "Karixai GOLD"
} as const;

const pointOrderCodeByDatabaseCode = new Map<string, string>([
  ["POINTS_5M", "SMALL"],
  ["POINTS_10M", "MEDIUM"],
  ["POINTS_25M", "BIG"],
  ["POINTS_50M", "MAX"]
]);

const pointOrderCodeByAmount = new Map<number, string>([
  [5_000_000, "SMALL"],
  [10_000_000, "MEDIUM"],
  [25_000_000, "BIG"],
  [50_000_000, "MAX"]
]);

export function pointPackageOrderCode(databaseCode: string, amountPoints?: number) {
  if (amountPoints !== undefined) {
    const amountCode = pointOrderCodeByAmount.get(amountPoints);
    if (amountCode) return amountCode;
  }
  return pointOrderCodeByDatabaseCode.get(databaseCode) || databaseCode;
}

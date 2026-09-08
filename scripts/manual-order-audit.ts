import assert from "node:assert/strict";
import { money } from "../lib/format";
import { BETA_MANUAL_PAYMENT, pointPackageOrderCode } from "../lib/manual-orders";

assert.equal(BETA_MANUAL_PAYMENT.currency, "EUR");
assert.equal(money(500), "€5.00", "Prices must render in EUR without changing database cents");
assert.equal(pointPackageOrderCode("POINTS_5M"), "SMALL");
assert.equal(pointPackageOrderCode("POINTS_10M"), "MEDIUM");
assert.equal(pointPackageOrderCode("POINTS_25M"), "BIG");
assert.equal(pointPackageOrderCode("POINTS_50M"), "MAX");
assert.equal(pointPackageOrderCode("POINTS_250K", 5_000_000), "SMALL");
assert.equal(pointPackageOrderCode("POINTS_1M", 10_000_000), "MEDIUM");
assert.equal(pointPackageOrderCode("POINTS_5M", 25_000_000), "BIG");

const iban = BETA_MANUAL_PAYMENT.iban.replace(/\s/g, "").toUpperCase();
assert.match(iban, /^BE\d{14}$/);
const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
let remainder = 0n;
for (const character of rearranged) {
  const encoded = /\d/.test(character) ? character : String(character.charCodeAt(0) - 55);
  for (const digit of encoded) remainder = (remainder * 10n + BigInt(digit)) % 97n;
}
assert.equal(remainder, 1n, "Configured IBAN checksum is invalid");

console.log(JSON.stringify({
  ok: true,
  currency: BETA_MANUAL_PAYMENT.currency,
  databasePricingPreserved: true,
  ibanChecksumValid: true
}, null, 2));

import crypto from "node:crypto";
import { applyCryptoPaymentStatus, nowPaymentsSignature, verifyNowPaymentsSignature } from "../lib/crypto-payments";
import { CryptoPurchaseKind } from "../lib/generated/prisma/client";
import { prisma } from "../lib/prisma";

const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const email = `crypto-audit-${stamp}@example.test`;
const serverId = `crypto-audit-${stamp}`;
const packageCode = `CRYPTO_AUDIT_${stamp}`;
const promoCode = `AUDIT${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
let ownerId = "";
let packageId = "";
let promoId = "";
let paymentId = "";
let premiumPaymentId = "";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const owner = await prisma.user.create({
    data: { email, username: "Crypto Audit", passwordHash: "audit" }
  });
  ownerId = owner.id;
  const pointPackage = await prisma.pointPackage.create({
    data: { code: packageCode, label: "Crypto Audit Pack", points: 1000, priceCents: 500 }
  });
  packageId = pointPackage.id;
  const promo = await prisma.promoCode.create({
    data: { code: promoCode, bonusPercent: 10, active: true, maxRedemptions: 1 }
  });
  promoId = promo.id;
  await prisma.server.create({
    data: {
      id: serverId,
      ownerId,
      slug: serverId,
      name: "Crypto Audit Server",
      host: `${stamp}.example.test`,
      version: "1.21.x",
      description: "Temporary crypto settlement audit server.",
      region: "TEST",
      tags: "Test",
      pluginSecret: crypto.randomBytes(32).toString("hex")
    }
  });
  const payment = await prisma.cryptoPayment.create({
    data: {
      ownerId,
      serverId,
      pointPackageId: packageId,
      promoCodeId: promoId,
      providerInvoiceId: `invoice-${stamp}`,
      packageCode,
      packageLabel: pointPackage.label,
      priceCents: pointPackage.priceCents,
      basePoints: pointPackage.points,
      bonusPoints: 100,
      totalPoints: 1100
    }
  });
  paymentId = payment.id;

  const signaturePayload = {
    invoice_id: payment.providerInvoiceId,
    order_id: payment.id,
    payment_id: `provider-${stamp}`,
    payment_status: "finished"
  };
  const secret = crypto.randomBytes(32).toString("hex");
  process.env.NOWPAYMENTS_IPN_SECRET = secret;
  const signature = nowPaymentsSignature(signaturePayload, secret);
  assert(verifyNowPaymentsSignature(signaturePayload, signature), "Valid NOWPayments signature was rejected");
  assert(!verifyNowPaymentsSignature({ ...signaturePayload, payment_status: "failed" }, signature), "Tampered payload signature was accepted");

  const processing = await applyCryptoPaymentStatus(payment.id, "confirming", `provider-${stamp}`);
  assert(processing.payment.status === "PROCESSING", "Confirming payment did not become PROCESSING");
  assert(!processing.credited, "Processing payment credited the campaign pool");

  const firstSettlement = await applyCryptoPaymentStatus(payment.id, "finished", `provider-${stamp}`);
  const duplicateSettlement = await applyCryptoPaymentStatus(payment.id, "finished", `provider-${stamp}`);
  const lateExpired = await applyCryptoPaymentStatus(payment.id, "expired", `provider-${stamp}`);
  assert(firstSettlement.credited, "Finished payment did not credit the campaign pool");
  assert(!duplicateSettlement.credited, "Duplicate finished callback credited the pool twice");
  assert(lateExpired.payment.status === "PAID", "Late expired callback downgraded a paid order");

  const [server, storedPayment, billingCount, ledgers, redemptions] = await Promise.all([
    prisma.server.findUniqueOrThrow({ where: { id: serverId } }),
    prisma.cryptoPayment.findUniqueOrThrow({ where: { id: payment.id } }),
    prisma.billingLedger.count({ where: { serverId } }),
    prisma.pointLedger.findMany({ where: { serverId } }),
    prisma.promoRedemption.count({ where: { serverId } })
  ]);
  assert(server.pointPool === 1100, `Expected pool 1100, received ${server.pointPool}`);
  assert(storedPayment.status === "PAID" && storedPayment.totalPoints === 1100, "Stored payment was not settled correctly");
  assert(billingCount === 1, `Expected one billing record, received ${billingCount}`);
  assert(ledgers.length === 2, `Expected base and promo ledgers, received ${ledgers.length}`);
  assert(redemptions === 1, `Expected one promo redemption, received ${redemptions}`);

  const premiumPayment = await prisma.cryptoPayment.create({
    data: {
      ownerId,
      serverId,
      kind: CryptoPurchaseKind.PREMIUM,
      providerInvoiceId: `premium-invoice-${stamp}`,
      packageCode: "DIAMOND",
      packageLabel: "Diamond premium",
      priceCents: 1500,
      premiumPlan: "DIAMOND",
      premiumDays: 7
    }
  });
  premiumPaymentId = premiumPayment.id;
  const firstPremiumSettlement = await applyCryptoPaymentStatus(
    premiumPayment.id,
    "finished",
    `premium-provider-${stamp}`
  );
  const duplicatePremiumSettlement = await applyCryptoPaymentStatus(
    premiumPayment.id,
    "finished",
    `premium-provider-${stamp}`
  );
  const [premiumServer, premiumBillingCount, premiumLedgerCount] = await Promise.all([
    prisma.server.findUniqueOrThrow({ where: { id: serverId } }),
    prisma.billingLedger.count({ where: { serverId, kind: "PREMIUM" } }),
    prisma.pointLedger.count({ where: { serverId, type: "SERVER_PREMIUM" } })
  ]);
  assert(firstPremiumSettlement.credited, "Finished premium payment did not activate premium");
  assert(!duplicatePremiumSettlement.credited, "Duplicate premium callback extended premium twice");
  assert(premiumServer.premiumPlan === "DIAMOND", "Premium payment did not activate Diamond");
  assert(Boolean(premiumServer.premiumUntil && premiumServer.premiumUntil > new Date()), "Premium expiry was not extended");
  assert(premiumBillingCount === 1, `Expected one premium billing record, received ${premiumBillingCount}`);
  assert(premiumLedgerCount === 1, `Expected one premium ledger record, received ${premiumLedgerCount}`);

  console.log(JSON.stringify({
    ok: true,
    checks: {
      signedWebhook: true,
      processingDoesNotCredit: true,
      settledPoints: server.pointPool,
      duplicateIsIdempotent: true,
      lateStatusCannotDowngrade: true,
      billingRecords: billingCount,
      promoRedemptions: redemptions,
      premiumSettlement: premiumServer.premiumPlan,
      premiumDuplicateIsIdempotent: true
    }
  }, null, 2));
}

async function cleanup() {
  if (premiumPaymentId) await prisma.cryptoPayment.deleteMany({ where: { id: premiumPaymentId } });
  if (paymentId) await prisma.cryptoPayment.deleteMany({ where: { id: paymentId } });
  await prisma.promoRedemption.deleteMany({ where: { serverId } });
  await prisma.pointLedger.deleteMany({ where: { serverId } });
  await prisma.billingLedger.deleteMany({ where: { serverId } });
  await prisma.server.deleteMany({ where: { id: serverId } });
  if (promoId) await prisma.promoCode.deleteMany({ where: { id: promoId } });
  if (packageId) await prisma.pointPackage.deleteMany({ where: { id: packageId } });
  if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);

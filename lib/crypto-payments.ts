import crypto from "node:crypto";
import {
  BillingKind,
  CryptoPaymentStatus,
  CryptoPurchaseKind,
  LedgerType,
  PremiumPlanCode
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type CryptoPaymentMode = "test" | "nowpayments";

type NowPaymentsInvoice = {
  id: string | number;
  invoice_url: string;
};

type CreateInvoiceInput = {
  paymentId: string;
  priceCents: number;
  packageLabel: string;
  serverName: string;
};

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when crypto payments are enabled.`);
  return value;
}

export function cryptoPaymentMode(): CryptoPaymentMode {
  return process.env.CRYPTO_PAYMENTS_MODE?.toLowerCase() === "nowpayments" ? "nowpayments" : "test";
}

export function cryptoPaymentsAreLive() {
  return cryptoPaymentMode() === "nowpayments";
}

function applicationBaseUrl() {
  const value = requiredEnvironment("APP_BASE_URL").replace(/\/$/, "");
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use HTTPS before live crypto payments are enabled.");
  }
  return value;
}

export async function createNowPaymentsInvoice(input: CreateInvoiceInput) {
  const apiKey = requiredEnvironment("NOWPAYMENTS_API_KEY");
  requiredEnvironment("NOWPAYMENTS_IPN_SECRET");
  const baseUrl = applicationBaseUrl();
  const apiUrl = (process.env.NOWPAYMENTS_API_URL || "https://api.nowpayments.io/v1").replace(/\/$/, "");
  const response = await fetch(`${apiUrl}/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify({
      price_amount: (input.priceCents / 100).toFixed(2),
      price_currency: "usd",
      order_id: input.paymentId,
      order_description: `${input.packageLabel} for ${input.serverName}`,
      ipn_callback_url: `${baseUrl}/api/payments/nowpayments/webhook`,
      success_url: `${baseUrl}/account?payment=${input.paymentId}#crypto-payments`,
      cancel_url: `${baseUrl}/account?payment=${input.paymentId}&cancelled=1#crypto-payments`,
      is_fixed_rate: true,
      is_fee_paid_by_user: true
    }),
    signal: AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`NOWPayments invoice request failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  const invoice = payload as Partial<NowPaymentsInvoice>;
  if (!invoice.id || !invoice.invoice_url) {
    throw new Error("NOWPayments returned an invoice without an ID or checkout URL.");
  }

  return {
    providerInvoiceId: String(invoice.id),
    checkoutUrl: invoice.invoice_url
  };
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = sortObject((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

export function nowPaymentsSignature(payload: unknown, secret: string) {
  return crypto
    .createHmac("sha512", secret.trim())
    .update(JSON.stringify(sortObject(payload)))
    .digest("hex");
}

export function verifyNowPaymentsSignature(payload: unknown, receivedSignature: string | null) {
  if (!receivedSignature) return false;
  const secret = process.env.NOWPAYMENTS_IPN_SECRET?.trim();
  if (!secret) return false;

  const expected = Buffer.from(nowPaymentsSignature(payload, secret), "hex");
  const received = Buffer.from(receivedSignature, "hex");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export function paymentStatus(providerStatus: string) {
  const status = providerStatus.toLowerCase();
  if (status === "finished") return CryptoPaymentStatus.PAID;
  if (["failed", "refunded"].includes(status)) return CryptoPaymentStatus.FAILED;
  if (status === "expired") return CryptoPaymentStatus.EXPIRED;
  if (["confirming", "confirmed", "sending", "partially_paid"].includes(status)) {
    return CryptoPaymentStatus.PROCESSING;
  }
  return CryptoPaymentStatus.PENDING;
}

export async function applyCryptoPaymentStatus(
  paymentId: string,
  providerStatus: string,
  providerPaymentId?: string
) {
  const nextStatus = paymentStatus(providerStatus);

  if (nextStatus !== CryptoPaymentStatus.PAID) {
    const current = await prisma.cryptoPayment.findUnique({ where: { id: paymentId } });
    if (!current) throw new Response("Payment order not found", { status: 404 });
    const isTerminal = current.status === CryptoPaymentStatus.PAID ||
      current.status === CryptoPaymentStatus.EXPIRED ||
      current.status === CryptoPaymentStatus.FAILED;
    const shouldUpdate = !isTerminal && (
      nextStatus !== CryptoPaymentStatus.PENDING || current.status === CryptoPaymentStatus.PENDING
    );
    const payment = shouldUpdate
      ? await prisma.cryptoPayment.update({
          where: { id: paymentId },
          data: {
            status: nextStatus,
            providerStatus,
            providerPaymentId: providerPaymentId || undefined
          }
        })
      : current;
    return { credited: false, payment };
  }

  return prisma.$transaction(async (tx) => {
    const payment = await tx.cryptoPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Response("Payment order not found", { status: 404 });
    if (payment.status === CryptoPaymentStatus.PAID || payment.settledAt) {
      return { credited: false, payment };
    }
    if (!payment.serverId) throw new Response("Payment server no longer exists", { status: 409 });

    const settledAt = new Date();
    const claimed = await tx.cryptoPayment.updateMany({
      where: { id: payment.id, settledAt: null },
      data: { settledAt, providerStatus, providerPaymentId: providerPaymentId || undefined }
    });
    if (claimed.count !== 1) {
      const existing = await tx.cryptoPayment.findUniqueOrThrow({ where: { id: payment.id } });
      return { credited: false, payment: existing };
    }

    if (payment.kind === CryptoPurchaseKind.PREMIUM) {
      const premiumPlan = payment.premiumPlan === PremiumPlanCode.GOLD
        ? PremiumPlanCode.GOLD
        : payment.premiumPlan === PremiumPlanCode.DIAMOND
          ? PremiumPlanCode.DIAMOND
          : null;
      if (!premiumPlan || !payment.premiumDays) {
        throw new Response("Premium payment configuration is invalid", { status: 409 });
      }
      const server = await tx.server.findUniqueOrThrow({ where: { id: payment.serverId } });
      const now = new Date();
      const base = server.premiumUntil && server.premiumUntil > now ? server.premiumUntil : now;
      const premiumUntil = new Date(base.getTime() + payment.premiumDays * 24 * 60 * 60 * 1000);
      await tx.server.update({
        where: { id: payment.serverId },
        data: {
          premiumPlan,
          premiumUntil
        }
      });
      await tx.billingLedger.create({
        data: {
          ownerId: payment.ownerId,
          serverId: payment.serverId,
          kind: BillingKind.PREMIUM,
          moneyCents: payment.priceCents,
          planCode: premiumPlan,
          note: `Crypto payment settled for ${payment.packageLabel} until ${premiumUntil.toISOString()}`
        }
      });
      await tx.pointLedger.create({
        data: {
          serverId: payment.serverId,
          type: LedgerType.SERVER_PREMIUM,
          amountPoints: 0,
          note: `Crypto premium funding: ${payment.packageLabel}`
        }
      });
      const updated = await tx.cryptoPayment.update({
        where: { id: payment.id },
        data: {
          status: CryptoPaymentStatus.PAID,
          providerStatus,
          providerPaymentId: providerPaymentId || undefined,
          settledAt
        }
      });
      return { credited: true, payment: updated };
    }

    let bonusPoints = payment.bonusPoints;
    if (payment.promoCodeId && bonusPoints > 0) {
      const [existingRedemption, promo] = await Promise.all([
        tx.promoRedemption.findUnique({
          where: {
            promoCodeId_userId_serverId: {
              promoCodeId: payment.promoCodeId,
              userId: payment.ownerId,
              serverId: payment.serverId
            }
          }
        }),
        tx.promoCode.findUnique({ where: { id: payment.promoCodeId } })
      ]);
      if (
        existingRedemption ||
        !promo ||
        !promo.active ||
        (promo.expiresAt && promo.expiresAt <= new Date()) ||
        (promo.maxRedemptions !== null && promo.redemptionCount >= promo.maxRedemptions)
      ) {
        bonusPoints = 0;
      } else {
        await tx.promoRedemption.create({
          data: {
            promoCodeId: payment.promoCodeId,
            userId: payment.ownerId,
            serverId: payment.serverId,
            bonusPoints
          }
        });
        await tx.promoCode.update({
          where: { id: payment.promoCodeId },
          data: { redemptionCount: { increment: 1 } }
        });
      }
    }

    const totalPoints = payment.basePoints + bonusPoints;
    await tx.server.update({
      where: { id: payment.serverId },
      data: { pointPool: { increment: totalPoints } }
    });
    await tx.billingLedger.create({
      data: {
        ownerId: payment.ownerId,
        serverId: payment.serverId,
        kind: BillingKind.POINTS,
        amountPoints: totalPoints,
        moneyCents: payment.priceCents,
        bonusPoints,
        planCode: payment.packageCode,
        promoCodeId: bonusPoints > 0 ? payment.promoCodeId : null,
        note: `Crypto payment settled for ${payment.packageLabel}`
      }
    });
    await tx.pointLedger.create({
      data: {
        serverId: payment.serverId,
        type: LedgerType.SERVER_TOPUP,
        amountPoints: payment.basePoints,
        note: `Crypto campaign funding: ${payment.packageLabel}`
      }
    });
    if (bonusPoints > 0) {
      await tx.pointLedger.create({
        data: {
          serverId: payment.serverId,
          type: LedgerType.PROMO_BONUS,
          amountPoints: bonusPoints,
          note: `Crypto campaign promo bonus for ${payment.packageLabel}`
        }
      });
    }

    const updated = await tx.cryptoPayment.update({
      where: { id: payment.id },
      data: {
        status: CryptoPaymentStatus.PAID,
        providerStatus,
        providerPaymentId: providerPaymentId || undefined,
        bonusPoints,
        totalPoints,
        settledAt
      }
    });
    return { credited: true, payment: updated };
  });
}

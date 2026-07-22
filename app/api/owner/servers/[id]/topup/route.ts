import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingKind, CryptoPaymentStatus, CryptoPurchaseKind, LedgerType, UserRole } from "@/lib/generated/prisma/client";
import { requireMember } from "@/lib/auth";
import { createNowPaymentsInvoice, cryptoPaymentsAreLive } from "@/lib/crypto-payments";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  packageId: z.string().min(1),
  promoCode: z.string().trim().max(40).optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMember();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const [server, pointPackage] = await Promise.all([
      prisma.server.findUnique({ where: { id } }),
      prisma.pointPackage.findUnique({ where: { id: input.packageId } })
    ]);

    if (!server || (user.role !== UserRole.ADMIN && server.ownerId !== user.id)) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (!pointPackage || !pointPackage.active) {
      return NextResponse.json({ error: "Point package not available" }, { status: 404 });
    }

    if (!cryptoPaymentsAreLive()) {
      return NextResponse.json(
        { error: "Purchases are paused during controlled testing. Contact KarixMC support for campaign credits." },
        { status: 503 }
      );
    }

    const promoCodeValue = input.promoCode?.trim().toUpperCase();
    const promo = promoCodeValue
      ? await prisma.promoCode.findUnique({ where: { code: promoCodeValue } })
      : null;

    if (promoCodeValue && !promo) {
      return NextResponse.json({ error: "Promo code is not valid" }, { status: 400 });
    }

    if (
      promo &&
      (!promo.active ||
        (promo.expiresAt && promo.expiresAt <= new Date()) ||
        (promo.maxRedemptions !== null && promo.redemptionCount >= promo.maxRedemptions))
    ) {
      return NextResponse.json({ error: "Promo code is no longer available" }, { status: 400 });
    }

    if (promo) {
      const used = await prisma.promoRedemption.findUnique({
        where: {
          promoCodeId_userId_serverId: {
            promoCodeId: promo.id,
            userId: user.id,
            serverId: server.id
          }
        }
      });

      if (used) {
        return NextResponse.json({ error: "Promo code was already used for this server" }, { status: 409 });
      }
    }

    const bonusPoints = promo ? Math.floor((pointPackage.points * promo.bonusPercent) / 100) : 0;
    const fundedPoints = pointPackage.points + bonusPoints;

    if (cryptoPaymentsAreLive()) {
      const reusable = await prisma.cryptoPayment.findFirst({
        where: {
          ownerId: user.id,
          serverId: server.id,
          pointPackageId: pointPackage.id,
          kind: CryptoPurchaseKind.POINTS,
          promoCodeId: promo?.id ?? null,
          status: { in: [CryptoPaymentStatus.PENDING, CryptoPaymentStatus.PROCESSING] },
          checkoutUrl: { not: null },
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }
        },
        orderBy: { createdAt: "desc" }
      });
      if (reusable?.checkoutUrl) {
        return NextResponse.json({
          paymentId: reusable.id,
          checkoutUrl: reusable.checkoutUrl,
          message: "Resuming secure crypto checkout"
        });
      }

      const payment = await prisma.cryptoPayment.create({
        data: {
          ownerId: user.id,
          serverId: server.id,
          pointPackageId: pointPackage.id,
          promoCodeId: promo?.id,
          packageCode: pointPackage.code,
          packageLabel: pointPackage.label,
          priceCents: pointPackage.priceCents,
          basePoints: pointPackage.points,
          bonusPoints,
          totalPoints: fundedPoints
        }
      });

      try {
        const invoice = await createNowPaymentsInvoice({
          paymentId: payment.id,
          priceCents: pointPackage.priceCents,
          packageLabel: pointPackage.label,
          serverName: server.name
        });
        await prisma.cryptoPayment.update({
          where: { id: payment.id },
          data: {
            providerInvoiceId: invoice.providerInvoiceId,
            checkoutUrl: invoice.checkoutUrl
          }
        });
        return NextResponse.json({
          paymentId: payment.id,
          checkoutUrl: invoice.checkoutUrl,
          message: "Secure crypto checkout created"
        }, { status: 201 });
      } catch (error) {
        console.error("Crypto invoice creation failed", error);
        await prisma.cryptoPayment.update({
          where: { id: payment.id },
          data: { status: CryptoPaymentStatus.FAILED, providerStatus: "invoice_error" }
        });
        throw new Response("Crypto checkout could not be created. Contact KarixMC support.", { status: 502 });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.server.update({
        where: { id: server.id },
        data: { pointPool: { increment: fundedPoints } }
      });
      await tx.billingLedger.create({
        data: {
          ownerId: server.ownerId,
          serverId: server.id,
          kind: BillingKind.POINTS,
          amountPoints: fundedPoints,
          bonusPoints,
          moneyCents: pointPackage.priceCents,
          planCode: pointPackage.code,
          promoCodeId: promo?.id,
          note: promo
            ? `Bought ${pointPackage.label} with ${promo.code} (+${promo.bonusPercent}%)`
            : `Bought ${pointPackage.label}`
        }
      });
      await tx.pointLedger.create({
        data: {
          serverId: server.id,
          type: LedgerType.SERVER_TOPUP,
          amountPoints: pointPackage.points,
          note: `Owner topped up ${server.name}`
        }
      });

      if (promo) {
        await tx.promoRedemption.create({
          data: {
            promoCodeId: promo.id,
            userId: user.id,
            serverId: server.id,
            bonusPoints
          }
        });
        await tx.promoCode.update({
          where: { id: promo.id },
          data: { redemptionCount: { increment: 1 } }
        });
        await tx.pointLedger.create({
          data: {
            serverId: server.id,
            type: LedgerType.PROMO_BONUS,
            amountPoints: bonusPoints,
            note: `${promo.code} added ${promo.bonusPercent}% bonus campaign credits`
          }
        });
      }
    });

    return NextResponse.json({
      fundedPoints,
      bonusPoints,
      message: bonusPoints > 0 ? `Campaign funded with ${bonusPoints} bonus credits` : "Campaign funded"
    });
  } catch (error) {
    return routeError(error);
  }
}

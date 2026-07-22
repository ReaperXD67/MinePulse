import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BillingKind,
  CryptoPaymentStatus,
  CryptoPurchaseKind,
  LedgerType,
  UserRole
} from "@/lib/generated/prisma/client";
import { requireMember } from "@/lib/auth";
import { createNowPaymentsInvoice, cryptoPaymentsAreLive } from "@/lib/crypto-payments";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  tierId: z.string().min(1)
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMember();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const [server, tier] = await Promise.all([
      prisma.server.findUnique({ where: { id } }),
      prisma.premiumTier.findUnique({ where: { id: input.tierId } })
    ]);

    if (!server || (user.role !== UserRole.ADMIN && server.ownerId !== user.id)) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (!tier || !tier.active || tier.code === "NONE") {
      return NextResponse.json({ error: "Premium tier not available" }, { status: 404 });
    }

    if (!cryptoPaymentsAreLive()) {
      return NextResponse.json(
        { error: "Purchases are paused during controlled testing. Contact KarixMC support for premium access." },
        { status: 503 }
      );
    }

    if (cryptoPaymentsAreLive()) {
      const reusable = await prisma.cryptoPayment.findFirst({
        where: {
          ownerId: user.id,
          serverId: server.id,
          premiumTierId: tier.id,
          kind: CryptoPurchaseKind.PREMIUM,
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
          premiumTierId: tier.id,
          kind: CryptoPurchaseKind.PREMIUM,
          packageCode: tier.code,
          packageLabel: `${tier.name} premium`,
          priceCents: tier.priceCents,
          premiumPlan: tier.code,
          premiumDays: tier.durationDays
        }
      });

      try {
        const invoice = await createNowPaymentsInvoice({
          paymentId: payment.id,
          priceCents: tier.priceCents,
          packageLabel: `${tier.name} premium`,
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
        console.error("Crypto premium invoice creation failed", error);
        await prisma.cryptoPayment.update({
          where: { id: payment.id },
          data: { status: CryptoPaymentStatus.FAILED, providerStatus: "invoice_error" }
        });
        throw new Response("Crypto checkout could not be created. Contact KarixMC support.", { status: 502 });
      }
    }

    const base = server.premiumUntil && server.premiumUntil > new Date() ? server.premiumUntil : new Date();
    const premiumUntil = new Date(base.getTime() + tier.durationDays * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.server.update({
        where: { id: server.id },
        data: {
          premiumPlan: tier.code,
          premiumUntil
        }
      }),
      prisma.billingLedger.create({
        data: {
          ownerId: server.ownerId,
          serverId: server.id,
          kind: BillingKind.PREMIUM,
          moneyCents: tier.priceCents,
          planCode: tier.code,
          note: `${tier.name} premium until ${premiumUntil.toISOString()}`
        }
      }),
      prisma.pointLedger.create({
        data: {
          serverId: server.id,
          type: LedgerType.SERVER_PREMIUM,
          amountPoints: 0,
          note: `${server.name} bought ${tier.name} premium`
        }
      })
    ]);

    return NextResponse.json({ message: "Premium activated" });
  } catch (error) {
    return routeError(error);
  }
}

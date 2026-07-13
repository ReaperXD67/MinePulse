import { NextResponse } from "next/server";
import { z } from "zod";
import { applyCryptoPaymentStatus, verifyNowPaymentsSignature } from "@/lib/crypto-payments";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const webhookSchema = z.object({
  order_id: z.string().min(1),
  payment_status: z.string().min(1),
  payment_id: z.union([z.string(), z.number()]).optional(),
  invoice_id: z.union([z.string(), z.number()]).nullable().optional()
}).passthrough();

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    if (!verifyNowPaymentsSignature(payload, request.headers.get("x-nowpayments-sig"))) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 401 });
    }

    const input = webhookSchema.parse(payload);
    const payment = await prisma.cryptoPayment.findUnique({ where: { id: input.order_id } });
    if (!payment || payment.provider !== "NOWPAYMENTS") {
      return NextResponse.json({ error: "Payment order not found" }, { status: 404 });
    }

    const invoiceId = input.invoice_id === null || input.invoice_id === undefined
      ? null
      : String(input.invoice_id);
    if (payment.providerInvoiceId && invoiceId && payment.providerInvoiceId !== invoiceId) {
      return NextResponse.json({ error: "Payment invoice does not match" }, { status: 409 });
    }

    const result = await applyCryptoPaymentStatus(
      payment.id,
      input.payment_status,
      input.payment_id === undefined ? undefined : String(input.payment_id)
    );
    return NextResponse.json({
      ok: true,
      credited: result.credited,
      status: result.payment.status
    });
  } catch (error) {
    return routeError(error);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(3).max(40),
  bonusPercent: z.coerce.number().int().min(1).max(100),
  active: z.boolean(),
  maxRedemptions: z.coerce.number().int().min(1).max(1000000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional()
});

export async function POST(request: Request) {
  try {
    await requireUser([UserRole.ADMIN]);
    const input = schema.parse(await request.json());
    const promo = await prisma.promoCode.create({
      data: {
        code: input.code.toUpperCase(),
        bonusPercent: input.bonusPercent,
        active: input.active,
        maxRedemptions: input.maxRedemptions ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
      }
    });
    return NextResponse.json({ promoId: promo.id, message: "Promo code created" });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireUser([UserRole.ADMIN]);
    const input = schema.extend({ id: z.string().min(1) }).parse(await request.json());
    await prisma.promoCode.update({
      where: { id: input.id },
      data: {
        code: input.code.toUpperCase(),
        bonusPercent: input.bonusPercent,
        active: input.active,
        maxRedemptions: input.maxRedemptions ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
      }
    });
    return NextResponse.json({ message: "Promo code updated" });
  } catch (error) {
    return routeError(error);
  }
}

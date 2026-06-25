import { NextResponse } from "next/server";
import { z } from "zod";
import { LedgerType, UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().min(1),
  amountPoints: z.coerce.number().int().min(-100000000).max(100000000),
  description: z.string().trim().min(4).max(240)
});

export async function POST(request: Request) {
  try {
    const admin = await requireUser([UserRole.ADMIN]);
    const input = schema.parse(await request.json());

    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, username: true, walletPoints: true }
    });

    if (!target) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (target.walletPoints + input.amountPoints < 0) {
      return NextResponse.json({ error: "This adjustment would make the wallet negative" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id: target.id },
        data: { walletPoints: { increment: input.amountPoints } }
      });

      await tx.pointLedger.create({
        data: {
          userId: target.id,
          type: LedgerType.ADMIN_ADJUSTMENT,
          amountPoints: input.amountPoints,
          balanceAfter: nextUser.walletPoints,
          note: `${input.description} (admin: ${admin.username})`
        }
      });

      return nextUser;
    });

    return NextResponse.json({
      message: `${updated.username} wallet adjusted to ${updated.walletPoints} points`
    });
  } catch (error) {
    return routeError(error);
  }
}

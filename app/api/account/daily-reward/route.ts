import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { LedgerType } from "@/lib/generated/prisma/client";
import { requireMember } from "@/lib/auth";
import {
  DAILY_REWARD_MAX_POINTS,
  DAILY_REWARD_MIN_POINTS,
  nextDailyClaimAt
} from "@/lib/progression";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireMember();
    const now = new Date();
    const nextClaim = nextDailyClaimAt(user.lastDailyClaimAt);

    if (nextClaim && nextClaim.getTime() > now.getTime()) {
      return NextResponse.json(
        {
          error: "Daily reward is still cooling down",
          nextClaimAt: nextClaim.toISOString()
        },
        { status: 429 }
      );
    }

    const amountPoints = randomInt(DAILY_REWARD_MIN_POINTS, DAILY_REWARD_MAX_POINTS + 1);
    const updated = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id: user.id },
        data: {
          walletPoints: { increment: amountPoints },
          lastDailyClaimAt: now
        }
      });

      await tx.pointLedger.create({
        data: {
          userId: user.id,
          type: LedgerType.DAILY_REWARD,
          amountPoints,
          balanceAfter: nextUser.walletPoints,
          note: "20-hour network claim reward"
        }
      });

      return nextUser;
    });

    return NextResponse.json({
      message: `Claimed ${amountPoints} points`,
      amountPoints,
      balanceAfter: updated.walletPoints,
      nextClaimAt: nextDailyClaimAt(now)?.toISOString()
    });
  } catch (error) {
    return routeError(error);
  }
}

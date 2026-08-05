import { NextResponse } from "next/server";
import { z } from "zod";
import { AccountTokenKind } from "@/lib/generated/prisma/client";
import { accountTokenDigest } from "@/lib/account-email";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

const schema = z.object({ token: z.string().min(32).max(128) });

export async function POST(request: Request) {
  try {
    const { token } = schema.parse(await request.json());
    const now = new Date();
    const record = await prisma.accountToken.findUnique({ where: { tokenHash: accountTokenDigest(token) } });
    if (!record || record.kind !== AccountTokenKind.EMAIL_VERIFICATION || record.consumedAt || record.expiresAt <= now) {
      return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.accountToken.updateMany({
        where: {
          id: record.id,
          kind: AccountTokenKind.EMAIL_VERIFICATION,
          consumedAt: null,
          expiresAt: { gt: now }
        },
        data: { consumedAt: now }
      });
      if (claimed.count !== 1) throw new Response("This verification link is invalid or expired.", { status: 400 });

      await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: now } });
      await tx.accountToken.deleteMany({
        where: { userId: record.userId, kind: AccountTokenKind.EMAIL_VERIFICATION, id: { not: record.id } }
      });
    });
    return NextResponse.json({ message: "Email verified. You can now sign in." });
  } catch (error) {
    return routeError(error);
  }
}

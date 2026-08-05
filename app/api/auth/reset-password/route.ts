import { NextResponse } from "next/server";
import { z } from "zod";
import { AccountTokenKind } from "@/lib/generated/prisma/client";
import { accountTokenDigest } from "@/lib/account-email";
import { hashPassword } from "@/lib/auth";
import { passwordPolicy, passwordPolicyError } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

const schema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(passwordPolicy.minLength).max(passwordPolicy.maxLength)
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const now = new Date();
    const record = await prisma.accountToken.findUnique({
      where: { tokenHash: accountTokenDigest(input.token) },
      include: { user: { select: { id: true, username: true, email: true } } }
    });
    if (!record || record.kind !== AccountTokenKind.PASSWORD_RESET || record.consumedAt || record.expiresAt <= now) {
      return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 400 });
    }
    const passwordError = passwordPolicyError(input.password, [record.user.username, record.user.email.split("@")[0] || ""]);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

    const passwordHash = await hashPassword(input.password);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.accountToken.updateMany({
        where: {
          id: record.id,
          kind: AccountTokenKind.PASSWORD_RESET,
          consumedAt: null,
          expiresAt: { gt: now }
        },
        data: { consumedAt: now }
      });
      if (claimed.count !== 1) throw new Response("This reset link is invalid or expired.", { status: 400 });

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, passwordChangedAt: now }
      });
      await tx.authSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } });
    });
    return NextResponse.json({ message: "Password changed. Sign in again on your devices." });
  } catch (error) {
    return routeError(error);
  }
}

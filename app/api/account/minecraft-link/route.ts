import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { routeError } from "@/lib/api";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function createCode() {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function POST() {
  try {
    const user = await requireMember();
    const now = new Date();
    await prisma.minecraftLinkCode.deleteMany({
      where: { OR: [{ userId: user.id }, { expiresAt: { lt: now } }] }
    });

    let code = createCode();
    while (await prisma.minecraftLinkCode.findUnique({ where: { code }, select: { id: true } })) {
      code = createCode();
    }

    const link = await prisma.minecraftLinkCode.create({
      data: {
        code,
        userId: user.id,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000)
      }
    });

    return NextResponse.json({ code: link.code, expiresAt: link.expiresAt.toISOString() });
  } catch (error) {
    return routeError(error);
  }
}

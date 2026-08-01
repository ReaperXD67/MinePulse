import { NextResponse } from "next/server";
import { z } from "zod";
import { ServerStatus, SessionStatus, UserModerationType, UserRole } from "@/lib/generated/prisma/client";
import { accountBanIsActive } from "@/lib/account-ban";
import { routeError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const banSchema = z.object({
  reason: z.string().trim().min(4).max(240),
  durationHours: z.number().int().min(1).max(24 * 365).nullable()
});

const unbanSchema = z.object({
  reason: z.string().trim().min(4).max(240)
});

async function targetAccount(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      role: true,
      bannedAt: true,
      bannedUntil: true,
      banReason: true
    }
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUser([UserRole.ADMIN]);
    const { id } = await context.params;
    const input = banSchema.parse(await request.json());
    const target = await targetAccount(id);

    if (!target) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    if (target.id === admin.id || target.role === UserRole.ADMIN) {
      return NextResponse.json({ error: "Administrator accounts cannot be banned from this panel" }, { status: 400 });
    }
    if (accountBanIsActive(target)) {
      return NextResponse.json({ error: "This account is already banned. Unban it before applying a new term." }, { status: 409 });
    }

    const now = new Date();
    const bannedUntil = input.durationHours === null
      ? null
      : new Date(now.getTime() + input.durationHours * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const pausedServers = await tx.server.updateMany({
        where: { ownerId: target.id, status: ServerStatus.ACTIVE },
        data: { status: ServerStatus.PAUSED }
      });

      await tx.authSession.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: now }
      });

      await tx.serverSession.updateMany({
        where: {
          status: SessionStatus.ACTIVE,
          OR: [{ userId: target.id }, { server: { ownerId: target.id } }]
        },
        data: { status: SessionStatus.CLOSED, endedAt: now }
      });

      const account = await tx.user.update({
        where: { id: target.id },
        data: { bannedAt: now, bannedUntil, banReason: input.reason },
        select: { id: true, bannedAt: true, bannedUntil: true, banReason: true }
      });

      await tx.userModerationAction.create({
        data: {
          userId: target.id,
          adminId: admin.id,
          type: UserModerationType.BAN,
          reason: input.reason,
          expiresAt: bannedUntil
        }
      });

      return { account, pausedServers: pausedServers.count };
    });

    return NextResponse.json({
      message: `${target.username} was banned${bannedUntil ? ` until ${bannedUntil.toLocaleString()}` : " permanently"}. ${result.pausedServers} active server(s) were paused.`,
      account: { ...result.account, banActive: true },
      pausedServers: result.pausedServers
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUser([UserRole.ADMIN]);
    const { id } = await context.params;
    const input = unbanSchema.parse(await request.json());
    const target = await targetAccount(id);

    if (!target) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    if (target.id === admin.id || target.role === UserRole.ADMIN) {
      return NextResponse.json({ error: "Administrator accounts cannot be changed from this panel" }, { status: 400 });
    }
    if (!accountBanIsActive(target)) {
      return NextResponse.json({ error: "This account is not currently banned" }, { status: 409 });
    }

    const account = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: target.id },
        data: { bannedAt: null, bannedUntil: null, banReason: null },
        select: { id: true, bannedAt: true, bannedUntil: true, banReason: true }
      });

      await tx.userModerationAction.create({
        data: {
          userId: target.id,
          adminId: admin.id,
          type: UserModerationType.UNBAN,
          reason: input.reason
        }
      });

      return updated;
    });

    return NextResponse.json({
      message: `${target.username} was unbanned. Paused servers remain paused until an administrator reviews and restores them.`,
      account: { ...account, banActive: false }
    });
  } catch (error) {
    return routeError(error);
  }
}

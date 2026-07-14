import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingKind, LedgerType, UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const searchSchema = z.string().trim().min(2).max(100);
const grantSchema = z.object({
  userId: z.string().min(1),
  serverId: z.string().min(1),
  amountPoints: z.coerce.number().int().min(1).max(1_000_000_000),
  description: z.string().trim().min(4).max(240)
});

export async function GET(request: Request) {
  try {
    await requireUser([UserRole.ADMIN]);
    const query = searchSchema.parse(new URL(request.url).searchParams.get("q") || "");
    const accounts = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query } },
          { username: { contains: query } },
          { minecraftName: { contains: query } }
        ]
      },
      select: {
        id: true,
        username: true,
        email: true,
        minecraftName: true,
        ownedServers: {
          select: { id: true, name: true, pointPool: true, status: true },
          orderBy: { updatedAt: "desc" }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 12
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireUser([UserRole.ADMIN]);
    const input = grantSchema.parse(await request.json());
    const server = await prisma.server.findFirst({
      where: { id: input.serverId, ownerId: input.userId },
      include: { owner: { select: { username: true, email: true } } }
    });

    if (!server) {
      return NextResponse.json(
        { error: "That server does not belong to the selected account" },
        { status: 409 }
      );
    }
    if (server.pointPool + input.amountPoints > 2_000_000_000) {
      return NextResponse.json({ error: "Campaign pool cannot exceed 2 billion credits" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedServer = await tx.server.update({
        where: { id: server.id },
        data: { pointPool: { increment: input.amountPoints } }
      });
      const note = `${input.description} (admin: ${admin.username})`;

      await tx.pointLedger.create({
        data: {
          serverId: server.id,
          type: LedgerType.ADMIN_ADJUSTMENT,
          amountPoints: input.amountPoints,
          balanceAfter: updatedServer.pointPool,
          note
        }
      });
      await tx.billingLedger.create({
        data: {
          ownerId: server.ownerId,
          serverId: server.id,
          kind: BillingKind.ADMIN_ADJUSTMENT,
          amountPoints: input.amountPoints,
          note
        }
      });

      return updatedServer;
    });

    return NextResponse.json({
      message: `${input.amountPoints.toLocaleString()} campaign credits sent to ${server.name}`,
      server: {
        id: result.id,
        name: result.name,
        pointPool: result.pointPool,
        owner: server.owner.username,
        ownerEmail: server.owner.email
      }
    });
  } catch (error) {
    return routeError(error);
  }
}

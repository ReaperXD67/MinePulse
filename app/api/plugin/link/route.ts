import { NextResponse } from "next/server";
import { z } from "zod";
import { routeError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  secret: z.string().min(8),
  code: z.string().trim().min(6).max(12).transform((value) => value.toUpperCase()),
  minecraftUuid: z.string().trim().min(8).max(80),
  minecraftName: z.string().trim().min(2).max(32)
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const server = await prisma.server.findFirst({
      where: { id: input.serverId, pluginSecret: input.secret },
      select: { id: true }
    });
    if (!server) {
      return NextResponse.json({ error: "Invalid server credentials" }, { status: 401 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const link = await tx.minecraftLinkCode.findUnique({
        where: { code: input.code },
        include: { user: true }
      });
      if (!link || link.expiresAt.getTime() < Date.now()) {
        throw new Response("Link code is invalid or expired", { status: 400 });
      }
      if (link.user.minecraftUuid && link.user.minecraftUuid !== input.minecraftUuid) {
        throw new Response("This account is already linked to another Minecraft profile", { status: 409 });
      }

      const currentProfile = await tx.user.findUnique({ where: { minecraftUuid: input.minecraftUuid } });
      if (currentProfile && currentProfile.id !== link.userId) {
        const isUnclaimed = !currentProfile.passwordHash && currentProfile.email.endsWith("@players.minepulse.local");
        if (!isUnclaimed) {
          throw new Response("This Minecraft profile belongs to another account", { status: 409 });
        }

        await tx.serverSession.updateMany({ where: { userId: currentProfile.id }, data: { userId: link.userId } });
        await tx.pointLedger.updateMany({ where: { userId: currentProfile.id }, data: { userId: link.userId } });
        await tx.user.update({ where: { id: currentProfile.id }, data: { minecraftUuid: null } });
        await tx.user.update({
          where: { id: link.userId },
          data: { walletPoints: { increment: currentProfile.walletPoints } }
        });
        await tx.user.delete({ where: { id: currentProfile.id } });
      }

      const user = await tx.user.update({
        where: { id: link.userId },
        data: { minecraftUuid: input.minecraftUuid, minecraftName: input.minecraftName }
      });
      await tx.minecraftLinkCode.delete({ where: { id: link.id } });
      return user;
    });

    return NextResponse.json({
      message: `Linked ${input.minecraftName} to ${result.username}`,
      username: result.username,
      walletPoints: result.walletPoints
    });
  } catch (error) {
    return routeError(error);
  }
}

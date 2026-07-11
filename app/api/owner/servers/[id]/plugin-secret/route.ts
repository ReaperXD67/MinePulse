import { NextResponse } from "next/server";
import { UserRole } from "@/lib/generated/prisma/client";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makePluginSecret } from "@/lib/random";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMember();
    const { id } = await context.params;
    const server = await prisma.server.findUnique({ where: { id }, select: { ownerId: true } });

    if (!server || (user.role !== UserRole.ADMIN && server.ownerId !== user.id)) {
      throw new Response("Server not found", { status: 404 });
    }

    const updated = await prisma.server.update({
      where: { id },
      data: {
        pluginSecret: makePluginSecret(),
        lastConfigSyncAt: null,
        lastHeartbeatAt: null,
        pluginConfigRevision: { increment: 1 }
      },
      select: { pluginSecret: true }
    });

    return NextResponse.json({
      message: "Plugin secret rotated. Update config.yml and restart the Minecraft server.",
      pluginSecret: updated.pluginSecret
    });
  } catch (error) {
    return routeError(error);
  }
}

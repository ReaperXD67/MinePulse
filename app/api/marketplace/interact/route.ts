import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  serverId: z.string().min(1),
  type: z.enum(["like", "favorite", "comment"]),
  body: z.string().trim().max(240).optional()
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());

    const server = await prisma.server.findUnique({
      where: { id: input.serverId },
      select: { id: true, status: true, minPlaySecondsForComment: true }
    });

    if (!server || server.status !== "ACTIVE") {
      return NextResponse.json({ error: "Server is not available" }, { status: 404 });
    }

    if (input.type === "like") {
      const existing = await prisma.serverLike.findUnique({
        where: { serverId_userId: { serverId: server.id, userId: user.id } }
      });

      if (existing) {
        await prisma.serverLike.delete({ where: { id: existing.id } });
        return NextResponse.json({ message: "Like removed" });
      }

      await prisma.serverLike.create({ data: { serverId: server.id, userId: user.id } });
      return NextResponse.json({ message: "Liked" });
    }

    if (input.type === "favorite") {
      const existing = await prisma.favorite.findUnique({
        where: { serverId_userId: { serverId: server.id, userId: user.id } }
      });

      if (existing) {
        await prisma.favorite.delete({ where: { id: existing.id } });
        return NextResponse.json({ message: "Favorite removed" });
      }

      await prisma.favorite.create({ data: { serverId: server.id, userId: user.id } });
      return NextResponse.json({ message: "Added to favorites" });
    }

    const text = input.body?.trim() || "";
    if (text.length < 3) {
      return NextResponse.json({ error: "Comment is too short" }, { status: 400 });
    }

    const played = await prisma.serverSession.aggregate({
      where: { serverId: server.id, userId: user.id },
      _sum: { activeSeconds: true }
    });

    if ((played._sum.activeSeconds ?? 0) < server.minPlaySecondsForComment) {
      return NextResponse.json(
        { error: `You need ${server.minPlaySecondsForComment} verified seconds before commenting` },
        { status: 403 }
      );
    }

    await prisma.comment.create({ data: { serverId: server.id, userId: user.id, body: text } });
    return NextResponse.json({ message: "Comment posted" });
  } catch (error) {
    return routeError(error);
  }
}

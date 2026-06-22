import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  subject: z.string().trim().min(4).max(100),
  body: z.string().trim().min(12).max(1200)
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMember();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const server = await prisma.server.findUnique({ where: { id }, select: { id: true, ownerId: true } });

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (server.ownerId === user.id) {
      return NextResponse.json({ error: "Use your server console to manage support" }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        serverId: id,
        requesterId: user.id,
        subject: input.subject,
        body: input.body
      }
    });

    return NextResponse.json({ ticketId: ticket.id, message: "Support request sent" });
  } catch (error) {
    return routeError(error);
  }
}

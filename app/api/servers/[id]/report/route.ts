import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  reason: z.enum([
    "NO_REWARD",
    "PLUGIN_TAMPERING",
    "BOTS_OR_FAKE_PLAYERS",
    "SCAM_OR_FALSE_INFO",
    "ABUSIVE_CONTENT",
    "OTHER"
  ]),
  details: z.string().trim().min(20).max(1200),
  evidenceUrl: z.string().trim().url().or(z.literal("")).optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMember();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const server = await prisma.server.findUnique({ where: { id }, select: { id: true } });

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const existing = await prisma.serverReport.findFirst({
      where: {
        serverId: id,
        reporterId: user.id,
        status: { in: ["OPEN", "REVIEWING"] }
      }
    });

    if (existing) {
      return NextResponse.json({ error: "You already have an open report for this server" }, { status: 409 });
    }

    const report = await prisma.serverReport.create({
      data: {
        serverId: id,
        reporterId: user.id,
        reason: input.reason,
        details: input.details,
        evidenceUrl: input.evidenceUrl || null
      }
    });

    return NextResponse.json({ reportId: report.id, message: "Report sent to MinePulse safety" });
  } catch (error) {
    return routeError(error);
  }
}

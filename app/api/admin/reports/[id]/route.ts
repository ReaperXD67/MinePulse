import { NextResponse } from "next/server";
import { z } from "zod";
import { EnforcementType, LedgerType, UserRole } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"]),
  adminNote: z.string().trim().max(1200),
  enforcementType: z.enum(["NONE", "WARNING", "PAUSE", "BLACKLIST", "CREDIT_REMOVAL", "RESTORE"]),
  pointsRemoved: z.coerce.number().int().min(0).max(1000000000).default(0)
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUser([UserRole.ADMIN]);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const report = await prisma.serverReport.findUnique({
      where: { id },
      include: { server: true }
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const removed = Math.min(input.pointsRemoved, report.server.pointPool);

    await prisma.$transaction(async (tx) => {
      await tx.serverReport.update({
        where: { id },
        data: { status: input.status, adminNote: input.adminNote }
      });

      if (input.enforcementType === "NONE") {
        return;
      }

      const type = input.enforcementType as EnforcementType;
      const serverData =
        type === EnforcementType.WARNING
          ? { trustStatus: "WATCHLIST" as const, riskScore: { increment: 10 } }
          : type === EnforcementType.PAUSE
            ? { status: "PAUSED" as const, trustStatus: "SUSPENDED" as const, riskScore: { increment: 20 } }
            : type === EnforcementType.BLACKLIST
              ? { status: "REMOVED" as const, trustStatus: "BLACKLISTED" as const, riskScore: { increment: 50 } }
              : type === EnforcementType.CREDIT_REMOVAL
                ? { pointPool: { decrement: removed }, trustStatus: "WATCHLIST" as const, riskScore: { increment: 20 } }
                : { status: "ACTIVE" as const, trustStatus: "VERIFIED" as const, riskScore: 0 };

      await tx.server.update({ where: { id: report.serverId }, data: serverData });
      await tx.enforcementAction.create({
        data: {
          serverId: report.serverId,
          adminId: admin.id,
          type,
          pointsRemoved: removed,
          reason: input.adminNote || `Enforcement from report ${report.id}`
        }
      });

      if (removed > 0) {
        await tx.pointLedger.create({
          data: {
            serverId: report.serverId,
            type: LedgerType.SERVER_PENALTY,
            amountPoints: -removed,
            note: input.adminNote || "Campaign credits removed after a safety review"
          }
        });
      }
    });

    return NextResponse.json({ message: "Report review saved" });
  } catch (error) {
    return routeError(error);
  }
}

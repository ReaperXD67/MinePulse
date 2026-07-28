import { NextResponse } from "next/server";
import { listActiveSessions, requireAuthContext, revokeOtherSessions } from "@/lib/auth";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await requireAuthContext();
    const sessions = await listActiveSessions(context.user.id, context.sessionId);
    return NextResponse.json({ sessions });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE() {
  try {
    const context = await requireAuthContext();
    const result = await revokeOtherSessions(context.user.id, context.sessionId);
    return NextResponse.json({ message: "Other sessions signed out", revoked: result.count });
  } catch (error) {
    return routeError(error);
  }
}

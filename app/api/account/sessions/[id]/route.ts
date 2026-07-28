import { NextResponse } from "next/server";
import { clearSessionCookie, requireAuthContext, revokeSessionForUser } from "@/lib/auth";
import { routeError } from "@/lib/api";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext();
    const { id } = await context.params;
    const revoked = await revokeSessionForUser(auth.user.id, id);

    if (!revoked) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const response = NextResponse.json({ message: "Session signed out", current: id === auth.sessionId });
    if (id === auth.sessionId) clearSessionCookie(response);
    return response;
  } catch (error) {
    return routeError(error);
  }
}

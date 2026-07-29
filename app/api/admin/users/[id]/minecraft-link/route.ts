import { NextResponse } from "next/server";
import { UserRole } from "@/lib/generated/prisma/client";
import { routeError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { unlinkMinecraftIdentity } from "@/lib/minecraft-identity";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireUser([UserRole.ADMIN]);
    const { id } = await context.params;
    const unlinked = await unlinkMinecraftIdentity(id);

    if (!unlinked) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: unlinked.wasLinked
        ? `${unlinked.minecraftName || unlinked.username} was unlinked by ${admin.username}. The player may now link a different account.`
        : `${unlinked.username} was already unlinked.`
    });
  } catch (error) {
    return routeError(error);
  }
}

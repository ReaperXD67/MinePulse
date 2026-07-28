import { NextResponse } from "next/server";
import { clearSessionCookie, revokeCurrentSession } from "@/lib/auth";
import { publicUrl } from "@/lib/url";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await revokeCurrentSession();
  const response = NextResponse.redirect(publicUrl("/", request), { status: 303 });
  clearSessionCookie(response);
  return response;
}

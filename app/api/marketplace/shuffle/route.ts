import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { DIRECTORY_SEED_COOKIE } from "@/lib/directory-seed";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const source = new URL(request.url);
  const response = NextResponse.json({ message: "A new weighted directory order was drawn" });
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  response.cookies.set(DIRECTORY_SEED_COOKIE, crypto.randomBytes(16).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: forwardedProtocol === "https" || source.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}

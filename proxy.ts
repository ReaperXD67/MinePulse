import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function allowedBrowserOrigins(request: NextRequest) {
  const configured = process.env.APP_BASE_URL;
  const canonical = configured ? new URL(configured).origin : request.nextUrl.origin;
  const url = new URL(canonical);
  const origins = new Set([canonical]);

  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
    origins.add(url.origin);
  } else if (!url.hostname.includes(":")) {
    url.hostname = `www.${url.hostname}`;
    origins.add(url.origin);
  }

  return origins;
}

function crossSiteMutation(request: NextRequest) {
  if (!UNSAFE_METHODS.has(request.method) || !request.nextUrl.pathname.startsWith("/api/")) return false;
  if (request.nextUrl.pathname.startsWith("/api/plugin/")) return false;

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return true;

  const source = request.headers.get("origin") || request.headers.get("referer");
  if (!source) return false;

  try {
    return !allowedBrowserOrigins(request).has(new URL(source).origin);
  } catch {
    return true;
  }
}

function declaredBodyTooLarge(request: NextRequest) {
  if (!UNSAFE_METHODS.has(request.method) || !request.nextUrl.pathname.startsWith("/api/")) return false;
  const declared = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declared) || declared <= 0) return false;

  const maximum = request.nextUrl.pathname === "/api/account/media"
    ? 5 * 1024 * 1024
    : request.nextUrl.pathname === "/api/plugin/heartbeat/batch"
      ? 256 * 1024
      : 64 * 1024;
  return declared > maximum;
}

function contentSecurityPolicy(nonce: string) {
  const developmentScripts = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const developmentConnections = process.env.NODE_ENV === "development" ? " ws: wss:" : "";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self'",
    "font-src 'self' data:",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScripts}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self'${developmentConnections}`
  ].join("; ");
}

function securedJson(error: string, status: number, policy: string) {
  const response = NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);

  if (crossSiteMutation(request)) {
    return securedJson("Cross-site request blocked", 403, policy);
  }
  if (declaredBodyTooLarge(request)) {
    return securedJson("Request body is too large", 413, policy);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};

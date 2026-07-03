import "server-only";

export function publicUrl(path: string, request: Request) {
  const configuredBase = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (configuredBase) {
    return new URL(path, configuredBase);
  }

  const origin = request.headers.get("origin");
  if (origin) {
    return new URL(path, origin);
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return new URL(path, `${proto}://${host}`);
  }

  return new URL(path, request.url);
}

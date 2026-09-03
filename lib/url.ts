import "server-only";

export function publicUrl(path: string, request: Request) {
  const configuredBase = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (configuredBase) {
    const base = new URL(configuredBase);
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) {
      throw new Error("APP_BASE_URL must be an HTTP(S) origin without credentials");
    }
    return new URL(path, base.origin);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL is required to create public production links");
  }

  return new URL(path, new URL(request.url).origin);
}

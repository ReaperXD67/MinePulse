import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { revealPluginSecret } from "@/lib/plugin-credentials";
import { readJsonDocument } from "@/lib/request-body";
import type { Server } from "@/lib/generated/prisma/client";

const REQUEST_WINDOW_SECONDS = 90;
const NONCE_RETENTION_MS = 5 * 60 * 1000;
const buckets = new Map<string, { minute: number; count: number }>();
let lastNonceCleanupAt = 0;

export type PluginAuthContext = {
  body: unknown;
  nonce: string;
  path: string;
  secret: string;
  server: Server;
};

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function pluginRequestSignaturePayload(input: {
  method: string;
  path: string;
  serverId: string;
  timestamp: number;
  nonce: string;
  body: string;
}) {
  return [input.method.toUpperCase(), input.path, input.serverId, input.timestamp, input.nonce, sha256(input.body)].join("\n");
}

export function pluginResponseSignaturePayload(input: {
  requestNonce: string;
  timestamp: number;
  nonce: string;
  status: number;
  body: string;
}) {
  return ["RESPONSE", input.requestNonce, input.timestamp, input.nonce, input.status, sha256(input.body)].join("\n");
}

function validMac(received: string, payload: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  const candidate = Buffer.from(received, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function enforceRequestRate(serverId: string, path: string) {
  const minute = Math.floor(Date.now() / 60_000);
  const key = `${serverId}:${path}`;
  const current = buckets.get(key);
  const limit = path.endsWith("/heartbeat/batch") ? 20 : path.endsWith("/heartbeat") ? 240 : 120;
  const next = !current || current.minute !== minute ? { minute, count: 1 } : { minute, count: current.count + 1 };
  buckets.set(key, next);

  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.minute < minute) buckets.delete(bucketKey);
    }
  }

  if (next.count > limit) {
    throw new Response("Plugin request rate exceeded", { status: 429, headers: { "Retry-After": "60" } });
  }
}

async function consumeNonce(serverId: string, nonce: string) {
  const now = new Date();
  if (Date.now() - lastNonceCleanupAt > 60_000) {
    lastNonceCleanupAt = Date.now();
    await prisma.pluginRequestNonce.deleteMany({ where: { expiresAt: { lt: now } } });
  }

  try {
    await prisma.pluginRequestNonce.create({
      data: { serverId, nonce, expiresAt: new Date(now.getTime() + NONCE_RETENTION_MS) }
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      throw new Response("Plugin request replay rejected", { status: 409 });
    }
    throw error;
  }
}

export async function authenticatePluginRequest(request: Request, maximumBytes = 64 * 1024): Promise<PluginAuthContext> {
  const path = new URL(request.url).pathname;
  const serverId = request.headers.get("x-karixmc-server-id")?.trim() || "";
  const timestampText = request.headers.get("x-karixmc-timestamp")?.trim() || "";
  const nonce = request.headers.get("x-karixmc-nonce")?.trim() || "";
  const signature = request.headers.get("x-karixmc-signature")?.trim() || "";
  const protocol = request.headers.get("x-karixmc-protocol")?.trim() || "";
  const timestamp = Number(timestampText);

  if (protocol !== "2" || !serverId || !Number.isInteger(timestamp) || !/^[a-f0-9-]{20,80}$/i.test(nonce)) {
    throw new Response("Invalid plugin authentication", { status: 401 });
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > REQUEST_WINDOW_SECONDS) {
    throw new Response("Plugin request timestamp is stale", { status: 401 });
  }

  const { value: raw, text: body } = await readJsonDocument(request, maximumBytes);
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || (raw as { serverId?: unknown }).serverId !== serverId) {
    throw new Response("Plugin server ID does not match the signed request", { status: 401 });
  }

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server || server.status !== "ACTIVE" || ["SUSPENDED", "BLACKLISTED"].includes(server.trustStatus)) {
    throw new Response("Invalid plugin authentication", { status: 401 });
  }

  const secret = revealPluginSecret(server.pluginSecret);
  const payload = pluginRequestSignaturePayload({ method: request.method, path, serverId, timestamp, nonce, body });
  if (!validMac(signature, payload, secret)) {
    await prisma.server.update({ where: { id: server.id }, data: { integrityFailures: { increment: 1 } } });
    throw new Response("Invalid plugin authentication", { status: 401 });
  }

  enforceRequestRate(server.id, path);
  await consumeNonce(server.id, nonce);
  return { body: raw, nonce, path, secret, server };
}

export function pluginJson(context: PluginAuthContext, payload: unknown, status = 200) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const signature = crypto
    .createHmac("sha256", context.secret)
    .update(pluginResponseSignaturePayload({ requestNonce: context.nonce, timestamp, nonce, status, body }))
    .digest("hex");

  return new NextResponse(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-KarixMC-Protocol": "2",
      "X-KarixMC-Timestamp": String(timestamp),
      "X-KarixMC-Nonce": nonce,
      "X-KarixMC-Signature": signature
    }
  });
}

export async function pluginRouteError(context: PluginAuthContext | null, error: unknown) {
  let status = 500;
  let message = "Plugin request failed";

  if (error instanceof Response) {
    status = error.status || 500;
    message = (await error.text()).trim() || message;
  } else if (error instanceof ZodError) {
    status = 400;
    message = error.issues[0]?.message || "Invalid plugin request";
  } else if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    status = 409;
    message = "Plugin request replay rejected";
  } else {
    console.error("Plugin API failure", error);
  }

  return context
    ? pluginJson(context, { error: message }, status)
    : NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

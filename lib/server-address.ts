const HOST_WITH_PORT = /^\[([^\]]+)](?::(\d{1,5}))?$|^([^:]+?)(?::(\d{1,5}))?$/;

export function normalizeServerAddress(rawHost: string, rawPort: number) {
  const value = rawHost.trim().replace(/^minecraft:\/\//i, "").replace(/\/$/, "");

  if (/^https?:\/\//i.test(value) || /[/?#]/.test(value)) {
    throw new Response("Use only the Minecraft host or IP, without http, paths, or query text", { status: 400 });
  }

  const match = value.match(HOST_WITH_PORT);
  if (!match) {
    throw new Response("Enter a valid Minecraft host, such as play.example.com or play.example.com:25565", {
      status: 400
    });
  }

  const host = (match[1] || match[3] || "").trim().toLowerCase();
  const embeddedPort = match[2] || match[4];
  const port = embeddedPort ? Number(embeddedPort) : rawPort;

  if (!host || host.length > 120 || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Response("Enter a valid Minecraft host and port between 1 and 65535", { status: 400 });
  }

  return { host, port };
}

export function serverJoinAddress(rawHost: string, rawPort: number) {
  try {
    const { host, port } = normalizeServerAddress(rawHost, rawPort);
    return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
  } catch {
    return `${rawHost}:${rawPort}`;
  }
}

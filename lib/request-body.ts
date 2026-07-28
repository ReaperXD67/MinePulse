export async function readRequestBytes(request: Request, maximumBytes: number) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Response("Request body is too large", { status: 413 });
  }

  if (!request.body) throw new Response("Request body is required", { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new Response("Request body is too large", { status: 413 });
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJsonDocument(request: Request, maximumBytes = 64 * 1024): Promise<{ text: string; value: unknown }> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new Response("Content-Type must be application/json", { status: 415 });
  }

  const bytes = await readRequestBytes(request, maximumBytes);

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text, value: JSON.parse(text) };
  } catch {
    throw new Response("Request body must be valid UTF-8 JSON", { status: 400 });
  }
}

export async function readJsonBody(request: Request, maximumBytes = 64 * 1024): Promise<unknown> {
  return (await readJsonDocument(request, maximumBytes)).value;
}

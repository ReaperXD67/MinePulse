import { readFile, stat } from "node:fs/promises";
import { managedMediaFilePath } from "@/lib/media-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await context.params;
  const url = `/media/${segments.join("/")}`;
  const file = managedMediaFilePath(url);
  if (!file) return new Response("Not found", { status: 404 });

  try {
    const [bytes, details] = await Promise.all([readFile(file), stat(file)]);
    return new Response(bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(details.size),
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }
    return new Response("Could not read media", { status: 500 });
  }
}

export function normalizeServerTags(value: string) {
  const tags = Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 24))
    )
  );

  if (!tags.length) {
    throw new Response("Add at least one server tag", { status: 400 });
  }

  if (tags.length > 10) {
    throw new Response("A server can use a maximum of 10 tags", { status: 400 });
  }

  return tags.join(",");
}

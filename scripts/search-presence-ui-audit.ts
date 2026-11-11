import assert from "node:assert/strict";
import { chromium } from "playwright";
import { SITE_DESCRIPTION, SITE_ORIGIN, SITE_TITLE } from "../lib/site-metadata";

const baseUrl = new URL(process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001");
assert(baseUrl.protocol === "http:" && ["localhost", "127.0.0.1", "search-app"].includes(baseUrl.hostname),
  "Run this audit only against a local/disposable application, not production");
const publicSlug = process.env.SEARCH_AUDIT_PUBLIC_SLUG || "";
assert(publicSlug, "Set SEARCH_AUDIT_PUBLIC_SLUG to a public server in the disposable database");
const excludedSlugs = (process.env.SEARCH_AUDIT_EXCLUDED_SLUGS || "").split(",").filter(Boolean);
const hiddenSlugs = (process.env.SEARCH_AUDIT_HIDDEN_SLUGS || "").split(",").filter(Boolean);
const memberId = process.env.SEARCH_AUDIT_MEMBER_ID;
async function main() {
const browser = await chromium.launch({
  headless: true,
  ...(process.env.AUDIT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.AUDIT_CHROMIUM_EXECUTABLE } : {})
});
const context = await browser.newContext({ baseURL: baseUrl.toString() });
const blockedExternal: string[] = [];
await context.route("**/*", async (route) => {
  const target = new URL(route.request().url());
  if (["http:", "https:"].includes(target.protocol) && target.origin !== baseUrl.origin) {
    blockedExternal.push(target.origin);
    await route.abort();
  } else await route.continue();
});
try {
  const page = await context.newPage();
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /content security policy|script-src/i.test(message.text())) cspErrors.push(message.text());
  });
  const paths = ["/", "/plugin", "/privacy", `/servers/${encodeURIComponent(publicSlug)}`];
  if (memberId) paths.push(`/members/${encodeURIComponent(memberId)}`);
  for (const pathname of paths) {
    const response = await page.goto(pathname, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200, `${pathname} must render successfully`);
    // Next's default trailingSlash=false normalizes an origin-only metadata URL.
    const canonical = pathname === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${pathname}`;
    // Next streams dynamic metadata into the body for capable browsers.
    const links = page.locator('link[rel="canonical"]');
    await links.waitFor({ state: "attached" });
    assert.equal(await links.count(), 1, `${pathname} must have exactly one canonical`);
    assert.equal(await links.getAttribute("href"), canonical);
    assert.equal(await page.locator('meta[property="og:url"]').getAttribute("content"), canonical);
    assert.equal(await page.locator('meta[property="og:title"]').getAttribute("content"), await page.title());
    assert.equal(await page.locator('meta[name="twitter:card"]').getAttribute("content"), "summary_large_image");
    assert.equal(await page.locator('meta[property="og:image"]').getAttribute("content"), `${SITE_ORIGIN}/voxel-network.png`);
    const botResponse = await context.request.get(pathname, { headers: { "user-agent": "Twitterbot" } });
    assert.equal(botResponse.status(), 200);
    const botHead = (await botResponse.text()).match(/<head>([\s\S]*?)<\/head>/)?.[1] || "";
    assert(botHead.includes(`rel="canonical" href="${canonical}"`), "HTML-limited bots need metadata in the head");
    if (pathname === "/") {
      assert.equal(await page.title(), SITE_TITLE);
      assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), SITE_DESCRIPTION);
      assert.equal(await page.locator('meta[property="og:description"]').getAttribute("content"), SITE_DESCRIPTION);
      assert.equal(await page.locator('meta[name="twitter:description"]').getAttribute("content"), SITE_DESCRIPTION);
      const structured = page.locator('script[type="application/ld+json"]');
      assert.equal(await structured.count(), 1);
      const data = JSON.parse(await structured.textContent() || "{}");
      assert.equal(data["@type"], "WebSite");
      assert.equal(data.url, `${SITE_ORIGIN}/`);
      // The directory's existing live sync can refresh the RSC tree immediately.
      // Compare the initial document's JSON-LD with that same response's policy.
      const nonce = (await response!.text()).match(/<script\b(?=[^>]*type="application\/ld\+json")[^>]*nonce="([^"]+)"/)?.[1];
      assert(nonce && response?.headers()["content-security-policy"]?.includes(`'nonce-${nonce}'`),
        "JSON-LD must retain the request's existing CSP nonce");
    }
    console.log(`Rendered metadata verified: ${pathname}`);
  }
  await page.goto("/?tag=Survival&q=example", { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), SITE_ORIGIN);
  const sitemap = await context.request.get("/sitemap.xml");
  assert.equal(sitemap.status(), 200);
  assert.match(sitemap.headers()["content-type"], /xml/);
  const xml = await sitemap.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert(urls.includes(`${SITE_ORIGIN}/servers/${encodeURIComponent(publicSlug)}`));
  assert(urls.includes(`${SITE_ORIGIN}/plugin`) && urls.includes(`${SITE_ORIGIN}/privacy`));
  assert(urls.every((url) => new URL(url).origin === SITE_ORIGIN && !/[?#]/.test(url)));
  assert(!urls.some((url) => /\/(account|admin|login|signup|members|api)(\/|$)/.test(new URL(url).pathname)));
  for (const slug of excludedSlugs) assert(!urls.includes(`${SITE_ORIGIN}/servers/${encodeURIComponent(slug)}`));
  for (const slug of [...hiddenSlugs, "nonexistent-search-audit-profile"]) {
    const response = await context.request.get(`/servers/${encodeURIComponent(slug)}`, { headers: { "user-agent": "Twitterbot" } });
    assert([200, 404].includes(response.status()), "Missing profiles must retain Next's streamed/non-streamed not-found behavior");
    const html = await response.text();
    assert.match(html, /<meta\b(?=[^>]*name="robots")(?=[^>]*content="[^"]*\bnoindex\b)[^>]*>/,
      "A streamed 200 not-found response must still prevent indexing");
    assert(!html.includes(`Hidden-${slug}`), "Hidden server names must not leak through metadata");
    assert(!html.includes(`rel="canonical" href="${SITE_ORIGIN}/servers/${encodeURIComponent(slug)}"`));
  }
  assert(!xml.includes("<lastmod>"), "Live-state updatedAt must not become a fake page revision date");
  const robots = await context.request.get("/robots.txt");
  assert.equal(robots.status(), 200);
  const rules = await robots.text();
  assert.match(rules, /User-Agent: \*/i);
  assert.match(rules, /Allow: \//);
  assert(rules.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));
  assert(!/Disallow:|GPTBot|OAI-SearchBot/i.test(rules), "Do not silently flip crawler-specific policies");
  const artwork = await context.request.get("/voxel-network.png");
  assert.equal(artwork.status(), 200);
  const png = await artwork.body();
  assert.equal(png.readUInt32BE(16), 1600);
  assert.equal(png.readUInt32BE(20), 900);
  assert.deepEqual(blockedExternal, [], "The isolated audit must not need external requests");
  assert.deepEqual(cspErrors, [], "Metadata must not weaken or violate the existing CSP");
  console.log(`Search routes verified: ${urls.length} canonical sitemap URLs, excluded states, robots policy, artwork and CSP.`);
} finally {
  await context.close();
  await browser.close();
}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

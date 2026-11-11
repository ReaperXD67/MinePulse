import assert from "node:assert/strict";
import robots from "../app/robots";
import { publicPageMetadata, SITE_ORIGIN, structuredDataJson, websiteStructuredData } from "../lib/site-metadata";

for (const pathname of ["/", "/plugin", "/privacy", "/servers/example-world", "/members/example-member"]) {
  const metadata = publicPageMetadata(pathname, "A public page", "A factual description.");
  assert.equal(metadata.alternates?.canonical, `${SITE_ORIGIN}${pathname}`);
  assert.equal(metadata.openGraph?.url, `${SITE_ORIGIN}${pathname}`);
}
for (const unsafe of ["https://example.test/", "//example.test/", "/\\example.test/", "/?tag=Survival", "/#servers"]) {
  assert.throws(() => publicPageMetadata(unsafe, "Title", "Description"));
}
const hostileSlug = "world/<script>?q=1#fragment";
const safePath = `/servers/${encodeURIComponent(hostileSlug)}`;
assert.equal(publicPageMetadata(safePath, "Title", "Description").alternates?.canonical, `${SITE_ORIGIN}${safePath}`);
const escaped = structuredDataJson({ name: "</script><script>alert('untrusted')</script>" });
assert(!escaped.includes("<"), "JSON-LD must not permit HTML script termination");
assert.deepEqual(JSON.parse(escaped), { name: "</script><script>alert('untrusted')</script>" });
assert.equal(websiteStructuredData["@type"], "WebSite");
assert.equal(websiteStructuredData.url, `${SITE_ORIGIN}/`);
assert.deepEqual(robots(), {
  rules: { userAgent: "*", allow: "/" },
  sitemap: `${SITE_ORIGIN}/sitemap.xml`
});
console.log("Search metadata checks passed: distinct canonicals, origin/parameter guards, encoded identities, JSON-LD escaping and unchanged open crawl policy.");

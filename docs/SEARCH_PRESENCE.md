# Public search metadata and link previews

Implemented with the existing Next.js App Router metadata API; no new package, service, account, verification key or external request is required. The canonical production origin is the verified `https://karixmc.pl`, held in `lib/site-metadata.ts`. Build placeholders, forwarded hosts and user-supplied links cannot choose a different canonical origin.

## Public output

- `/`, `/plugin`, `/privacy`, public server profiles and public member profiles emit one page-specific canonical plus Open Graph and Twitter metadata. Directory filters point to the directory canonical; server/member identities are URL-encoded. The shared layout sets `metadataBase` only, so it does not accidentally give every page a homepage canonical.
- The homepage title/description identify the directory, labelled demos, setup guide and community feedback. Visible product/hero copy and existing setup/privacy titles/descriptions remain intact. Server metadata reads the current public name/description and follows the page's existing missing/removed/blacklisted `notFound` boundary. Member cards use generic public-profile copy rather than copying a biography, email or account details into previews. No account or authentication logic changes.
- Next can stream dynamic metadata into the body for capable browsers; HTML-limited bots receive it in the head. Verification covers both the rendered DOM and a limited-bot response, without disabling Next's existing streaming behavior.
- The existing `notFound()` boundary can return HTTP 200 once streaming has started, or 404 before streaming. Verification requires the resulting `noindex` marker and absence of hidden profile metadata in either case; it does not claim every missing-profile response has an HTTP 404 status. See [Next's streaming status behavior](https://nextjs.org/docs/app/api-reference/file-conventions/loading#status-codes).
- Cards reuse `/voxel-network.png`, the existing owned 1600×900 abstract illustration. It is described as an illustration, not gameplay, a screenshot or an endorsement.
- The homepage emits only a factual `WebSite` entity: name, URL and observed language. The request's existing CSP nonce is preserved, and JSON escapes `<` before insertion. There are no invented reviews, ratings, audiences, offers, organizations, search actions or financial results.
- `robots.txt` explicitly allows general crawling and points to the sitemap. Previously this route returned 404, which Google treats as no crawl restriction. This makes that existing policy explicit; it does not newly opt into a crawler-specific policy or establish that bots were blocked. Robots directives are not authentication or a reliable way to keep a page out of search.
- The dynamic sitemap includes `/`, `/plugin`, `/privacy` and `ACTIVE` server rows whose trust status is `VERIFIED` or `WATCHLIST`. Server profiles remain eligible when a bridge is temporarily offline or a pool is empty; the sitemap is not a minute-by-minute online-status list. It excludes paused, suspended, removed and blacklisted rows, auth/account/admin/API/member paths and filtered/fragment URLs. Exclusion from a sitemap alone does not prevent indexing of an otherwise public page.
- Sitemap output is capped at 50,000 URLs, including the three static routes. Split it with Next's native sitemap index convention before the public profile count exceeds 49,997. No `lastModified` is invented: the current server `updatedAt` also changes with live state and is not an authoritative authored-page revision date.

No `llms.txt`, special AI schema, crawler training-policy change, Search Console account, Bing verification or IndexNow key is introduced. Genuine translated routes would need their own language/canonical design; English and Polish outreach campaigns are not evidence of translated website pages.

## Verification

Use the existing locked dependencies and containerized development/release workflow. The normal required checks remain `npm run lint` and `npm run build` (see [AGENTS.md](../AGENTS.md)).

The accompanying targeted Nodemailer pin is documented in [Security](../SECURITY.md#account-email-dependency). Its provider-free transport/MIME audit and relevant local account-security checks are separate from search/crawler verification; no live SMTP or production user is part of either test path.

`npm run test:search-presence` checks distinct canonicals, rejection of off-origin/parameterized paths, encoded untrusted identities, safe JSON-LD serialization and preservation of the open crawl policy.

`npm run test:search-presence-ui` uses the existing Playwright dependency against a **local disposable** app. It verifies the rendered DOM metadata, the homepage filter canonical, the JSON-LD/CSP nonce, robots content, image dimensions and sitemap contents. Configure:

- `AUDIT_BASE_URL`: local HTTP app origin (`localhost`, `127.0.0.1` or the isolated test alias `search-app`);
- `SEARCH_AUDIT_PUBLIC_SLUG`: an active public server in the disposable database;
- `SEARCH_AUDIT_MEMBER_ID`: optional synthetic public member to check;
- `SEARCH_AUDIT_EXCLUDED_SLUGS`: optional comma-separated paused/suspended/removed/blacklisted fixture slugs;
- `SEARCH_AUDIT_HIDDEN_SLUGS`: optional removed/blacklisted fixture slugs, whose names are `Hidden-<slug>`, for not-found and metadata non-disclosure checks;
- `AUDIT_CHROMIUM_EXECUTABLE`: optional existing container Chromium executable; otherwise use Playwright's installed matching browser.

The audit makes no database writes, creates no accounts and aborts external browser requests. Fixtures and migrations belong only in a fresh disposable database; never seed or run mutation-based fixture setup against production. A successful local audit verifies emitted metadata, not live publication, crawler access through production hosting, search coverage, rankings, AI citations or user acquisition. After an authorized deployment, check actual HTTPS responses separately; ownership-verified search tools can then inspect coverage if already available.

Verified locally on November 11, 2026: locked dependencies in Docker, ESLint, focused metadata checks and the Next 16.4.4 production build passed. A standalone app with a fresh migrated synthetic PostgreSQL database passed the rendered-browser and limited-bot audit, including all six server visibility states used by the fixture, public member copy, CSP, canonical URLs, image dimensions and sitemap exclusions. No production data, provider request or live deployment was part of that proof.

The same final dependency set also passed the network-disabled Nodemailer 10.1.4 API/MIME checks and existing isolated `test:auth` and `test:account-security` suites. These cover application/session/token behavior in synthetic fixtures; they do not establish provider SMTP delivery or production authentication configuration.

## Source decision

Research reviewed November 11, 2026. **Adapt native Next APIs** rather than add an SEO framework: the app already uses Next 16's metadata system, and the change needs only small metadata helpers and two documented routes. There is no copied third-party implementation or added dependency/license burden. The Next.js project is [MIT-licensed](https://github.com/vercel/next.js/blob/canary/license.md); the current maintained metadata APIs fit the existing App Router and server components.

Primary references:

- [Next robots convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots), [sitemap convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap), [metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata).
- [Google canonical methods](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [robots status handling](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec).
- [Google AI features](https://developers.google.com/search/docs/appearance/ai-features): ordinary search foundations apply; special AI files and special schema are not required.
- [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a): canonical, crawlable, accurate public content and current sitemaps support the shared search/Copilot discovery foundation.
- [OpenAI crawler controls](https://developers.openai.com/api/docs/bots): search discovery (`OAI-SearchBot`) and training (`GPTBot`) are separate settings. Neither is silently reconfigured here.

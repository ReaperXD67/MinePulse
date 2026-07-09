# MinePulse

MinePulse is a production-style MVP for a Minecraft server marketplace where verified playtime earns platform points.

Members earn points on funded servers, then spend those earned points on ranks, crates, cosmetics, or any server-configured item. The same account can also publish servers, buy campaign credits with real money, choose reward rates per second, cap paid players, and buy Gold or Diamond placement. Admins control pricing, bonus promo codes, reports, punishments, campaign pools, premium state, server visibility, and platform statistics.

## Two Separate Currencies

- **Earned points** live in a member wallet. They are created only by verified playtime and can only buy server store items.
- **Campaign credits** live in a server reward pool. They are bought with real money and can only pay verified player rewards.

Buying a store item never refills a server campaign. Promo codes such as `BOOST10` add bonus campaign credits without discounting the purchase price.

Reward rates support half-point steps such as `1`, `1.5`, `2`, `2.5`, and `3` points per second. Wallets still store whole points; the backend keeps fractional carry inside each session so players are paid fairly over time.

## Stack

- Next.js App Router
- Prisma 7 with SQLite for local development
- Cookie JWT authentication with admin protection and unified member accounts
- Paper plugin in `minecraft-plugin/`
- Local generated PNG artwork in `public/voxel-network.png`

## Run Locally

```bash
npm install
npm run assets:generate
npm run db:generate
npm run db:apply
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

Testers can create their own accounts at `http://localhost:3000/signup`. Use separate accounts for each tester so wallets, Minecraft links, purchases, friends, and profile edits do not collide.

`db:apply` applies the generated SQLite migration directly. The Prisma schema and generated client still remain the source of truth; this command exists because Prisma 7's schema engine can be opaque on some local Windows SQLite setups.

Seeded accounts:

| Demo | Email | Password |
| --- | --- | --- |
| Control center | `admin@minepulse.local` | `admin123` |
| Skyforge member | `owner@minepulse.local` | `owner123` |
| PixelRunner member | `player@minepulse.local` | `player123` |

## Test With Minecraft

For a sendable tester checklist, use [TESTING_GUIDE.md](TESTING_GUIDE.md).

Docker Desktop can launch a real Paper 1.21.4 server with the downloadable MinePulse Bridge already mounted:

```bash
npm run db:seed
npm run dev
npm run game:test:up
npm run game:test:status
```

Wait until `MinePulseBridge` appears in green, then connect Minecraft Java Edition 1.21.4 to `localhost:25565`. The test server uses offline mode only for local development.

1. Sign in to the website as PixelRunner and open **Account -> Minecraft identity**.
2. Create a ten-minute link code.
3. In Minecraft, run `/minepulse link <code>`.
4. Use `/points`, `/pool`, and `/minepulse help` while testing.
5. Buy a store item on the website while linked, then join the server and run `/receive` if the item does not arrive immediately.
6. After five verified minutes, answer the activity prompt with `/answer <value>`.

To watch Paper and bridge logs or remove the test server:

```bash
npm run game:test:logs
npm run game:test:down
```

## Key Flows

- `/` shows the randomized marketplace. Premium servers shuffle first. Regular servers shuffle below. Empty campaigns are hidden.
- `/` can also filter the shuffled directory by tags such as Survival, SMP, or Economy.
- `/account` combines the member wallet, public profile, privacy, friends, purchases, play sessions, favorites, server publishing, campaign funding, store management, plugin credentials, and support inbox.
- `/servers/[slug]` is the full server profile with screenshots, owner story, rules, store, verified reviews, support, reports, and trust telemetry.
- `/members/[id]` shows a public member profile and published servers.
- `/plugin` is the bridge download, installation, command, anti-AFK, and official support center.
- `/admin` manages economy pricing, Gold/Diamond tiers, promo bonuses, reports, punishments, manual wallet grants, server trust, campaign credits, and statistics.
- `/player` and `/owner` redirect to the unified account for backward compatibility.

## Plugin API

The creator studio shows a `server-id` and `plugin-secret`. Put those into the plugin's generated `config.yml`.

Important endpoints:

- `POST /api/plugin/heartbeat` rewards verified player activity and returns wallet/pool status.
- `POST /api/plugin/purchases/pull` returns pending commands for a server.
- `POST /api/plugin/purchases/ack` confirms delivery or refunds failed purchases.

Version 0.4.0 syncs protection policy from Creator Studio, links Minecraft identities with short-lived account codes, accumulates movement and interaction telemetry, signs heartbeat envelopes with HMAC-SHA256, rejects stale/replayed activity, tracks AFK time, hashes IP addresses, uses website-generated arithmetic `/answer` challenges, retries queued deliveries with `/receive`, and only rewards linked MinePulse accounts. MinePulse calculates wallet rewards on the website; the plugin never directly edits balances.

## Plugin Build

See [minecraft-plugin/README.md](minecraft-plugin/README.md) for the full Paper installation, connection, firewall, security, and troubleshooting guide.

From `minecraft-plugin/`:

```bash
mvn clean package
```

Download the ready jar from `/plugin`, or copy the shaded jar from `minecraft-plugin/target/` into your Paper server `plugins/` folder. Start once to generate config, then set only the connection credentials:

```yaml
api-base-url: "https://your-domain.com"
server-id: "from owner panel"
plugin-secret: "from owner panel"
```

For local testing where Paper and the website run on the same machine, keep `api-base-url: "http://localhost:3000"`. If Paper runs elsewhere, `localhost` is wrong; use the HTTPS URL reachable from that Minecraft server.

## Deploy Notes

- Copy `.env.example` to `.env` locally, and set the same variables in your host.
- `AUTH_SECRET` must be a strong unique value of at least 32 characters. Production will refuse to boot with the demo secret.
- Set `APP_BASE_URL` to the public website URL testers open in the browser, for example `http://51.83.180.202:3000` during temporary VPS testing. This prevents redirects from using the internal bind address `0.0.0.0`.
- `AUTH_COOKIE_SECURE="false"` is allowed only for temporary HTTP/IP-based VPS testing. Use HTTPS and remove it or set it to `"true"` before real public launch.
- For real production payments, connect Stripe or PayPal where the current owner top-up and premium routes write simulated billing records.
- SQLite is fine for local MVP testing. Use Postgres before handling real money or large traffic.

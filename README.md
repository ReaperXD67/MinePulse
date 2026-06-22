# MinePulse

MinePulse is a production-style MVP for a Minecraft server marketplace where verified playtime earns platform points.

Members earn points on funded servers, then spend those earned points on ranks, crates, cosmetics, or any server-configured item. The same account can also publish servers, buy campaign credits with real money, choose reward rates per second, cap paid players, and buy Gold or Diamond placement. Admins control pricing, bonus promo codes, reports, punishments, campaign pools, premium state, server visibility, and platform statistics.

## Two Separate Currencies

- **Earned points** live in a member wallet. They are created only by verified playtime and can only buy server store items.
- **Campaign credits** live in a server reward pool. They are bought with real money and can only pay verified player rewards.

Buying a store item never refills a server campaign. Promo codes such as `BOOST10` add bonus campaign credits without discounting the purchase price.

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

`db:apply` applies the generated SQLite migration directly. The Prisma schema and generated client still remain the source of truth; this command exists because Prisma 7's schema engine can be opaque on some local Windows SQLite setups.

Seeded accounts:

| Demo | Email | Password |
| --- | --- | --- |
| Control center | `admin@minepulse.local` | `admin123` |
| Skyforge member | `owner@minepulse.local` | `owner123` |
| PixelRunner member | `player@minepulse.local` | `player123` |

## Key Flows

- `/` shows the randomized marketplace. Premium servers shuffle first. Regular servers shuffle below. Empty campaigns are hidden.
- `/account` combines the member wallet, public profile, purchases, play sessions, favorites, server publishing, campaign funding, store management, plugin credentials, and support inbox.
- `/servers/[slug]` is the full server profile with screenshots, owner story, rules, store, verified reviews, support, reports, and trust telemetry.
- `/members/[id]` shows a public member profile and published servers.
- `/admin` manages economy pricing, Gold/Diamond tiers, promo bonuses, reports, punishments, server trust, campaign credits, and statistics.
- `/player` and `/owner` redirect to the unified account for backward compatibility.

## Plugin API

The creator studio shows a `server-id` and `plugin-secret`. Put those into the plugin's generated `config.yml`.

Important endpoints:

- `POST /api/plugin/heartbeat` rewards verified player activity and returns wallet/pool status.
- `POST /api/plugin/purchases/pull` returns pending commands for a server.
- `POST /api/plugin/purchases/ack` confirms delivery or refunds failed purchases.

Version 0.2.0 accumulates movement and interaction telemetry between heartbeats, signs heartbeat envelopes with HMAC-SHA256, rejects stale/replayed activity, tracks AFK time, hashes IP addresses, and can require a periodic `/mpcode` challenge. MinePulse calculates wallet rewards on the website; the plugin never directly edits balances.

## Plugin Build

See [minecraft-plugin/README.md](minecraft-plugin/README.md) for the full Paper installation, connection, firewall, security, and troubleshooting guide.

From `minecraft-plugin/`:

```bash
mvn clean package
```

Copy the shaded jar from `minecraft-plugin/target/` into your Paper server `plugins/` folder, start once to generate config, then set:

```yaml
api-base-url: "https://your-domain.com"
server-id: "from owner panel"
plugin-secret: "from owner panel"
```

For local testing where Paper and the website run on the same machine, keep `api-base-url: "http://localhost:3000"`. If Paper runs elsewhere, `localhost` is wrong; use the HTTPS URL reachable from that Minecraft server.

## Deploy Notes

- Copy `.env.example` to `.env` locally, and set the same variables in your host.
- `AUTH_SECRET` must be a strong unique value of at least 32 characters. Production will refuse to boot with the demo secret.
- For real production payments, connect Stripe or PayPal where the current owner top-up and premium routes write simulated billing records.
- SQLite is fine for local MVP testing. Use Postgres before handling real money or large traffic.

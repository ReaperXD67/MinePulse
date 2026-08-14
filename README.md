# MinePulse / KarixMC

[![Next.js](https://img.shields.io/badge/Next.js-App_Router-111827?logo=next.js)](./package.json)
[![Paper](https://img.shields.io/badge/Minecraft-Paper_Plugin-5a8f29)](./minecraft-plugin)
[![PostgreSQL](https://img.shields.io/badge/data-PostgreSQL-336791?logo=postgresql&logoColor=white)](./prisma)
[![Security](https://img.shields.io/badge/security-documented-16a085)](./SECURITY.md)

**A two-sided Minecraft marketplace where rewards are backed by verified server playtime—not browser trust.**

> [!IMPORTANT]
> Production deployment, PostgreSQL migration, backup, monitoring, and rollback instructions are in [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md).

KarixMC is a production-style MVP for a Minecraft server marketplace where verified playtime earns platform points. The visible Paper plugin and command namespace are `KarixMCBridge` and `/karixmc`; internal Java package names remain unchanged for binary stability.

Members earn points on funded servers, then spend those earned points on ranks, crates, cosmetics, or any server-configured item. The same account can also publish servers, buy campaign credits with real money, choose reward rates per second, cap paid players, and buy Gold or Diamond placement. Admins control pricing, bonus promo codes, reports, punishments, campaign pools, premium state, server visibility, and platform statistics.

## Legacy VPS Deployment (Controlled Beta Only)

The old HTTP/IP deployment may still be available for controlled regression testing:

- **Live website:** [http://51.83.180.202](http://51.83.180.202)
- **Create an account:** [http://51.83.180.202/signup](http://51.83.180.202/signup)
- **Plugin download and setup:** [http://51.83.180.202/plugin](http://51.83.180.202/plugin)

This address is not the production target and must not receive real users, production credentials, or payments. A Paper server can run on another host; the website/API address and Minecraft join address remain separate.

The domain launch must use the PostgreSQL/Redis/HTTPS architecture in [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md).

## Two Separate Currencies

- **Wallet points** live in a member wallet. Verified play is the main source; level rewards, the 20-hour claim, and documented admin grants also add wallet points. Wallet points can buy server store items.
- **Campaign credits** live in a server reward pool and can only pay verified player rewards. Orders are coordinated through the official Discord and an administrator records the confirmed grant with an audit reason; no automated checkout is connected.

Buying a store item never refills a server campaign. Promo codes such as `BOOST10` add bonus campaign credits without discounting the purchase price.

Reward rates support half-point steps such as `1`, `1.5`, `2`, `2.5`, and `3` points per second. Wallets still store whole points; the backend keeps fractional carry inside each session so players are paid fairly over time.

## Stack

- Next.js App Router
- Prisma 7 with PostgreSQL
- Redis-backed shared caching and plugin rate limits
- Opaque, hashed database sessions with verified email and administrator TOTP
- Two Next.js replicas behind Nginx in production
- Paper plugin in `minecraft-plugin/`
- Local generated PNG artwork in `public/voxel-network.png`

## Run Locally

```bash
npm install
npm run assets:generate
npm run infra:up
npm run db:generate
npm run db:migrate
npm run db:seed:demo
npm run dev
```

Open `http://localhost:3000`.

Testers can create their own accounts at `http://localhost:3000/signup`. Use separate accounts for each tester so wallets, Minecraft links, purchases, friends, and profile edits do not collide.

Copy `.env.example` to `.env` before the first run. The local Docker infrastructure binds PostgreSQL and Redis only to `127.0.0.1`. Stop it with `npm run infra:down`.

Local seeded accounts (development and automated testing only; do not run `db:seed` on production):

| Demo | Email | Password |
| --- | --- | --- |
| Control center | `admin@minepulse.local` | `admin123` |
| Skyforge member | `owner@minepulse.local` | `owner123` |
| PixelRunner member | `player@minepulse.local` | `player123` |

## Test With Minecraft

For a sendable tester checklist, use [TESTING_GUIDE.md](TESTING_GUIDE.md).
For the hosted Titanaxe server and final pre-domain checks, use [TITANAXE_ACCEPTANCE_TEST.md](TITANAXE_ACCEPTANCE_TEST.md).

Docker Desktop can launch a real Paper 1.21.4 server with the downloadable KarixMC Bridge already mounted:

```bash
npm run db:seed:demo
npm run dev
npm run game:test:up
npm run game:test:status
```

Wait until `KarixMCBridge` appears in green, then connect Minecraft Java Edition 1.21.4 to `localhost:25565`. The test server uses offline mode only for local development. For a real server, follow [CLIENT_PLUGIN_TESTING_GUIDE.md](CLIENT_PLUGIN_TESTING_GUIDE.md).

1. Sign in to the website as PixelRunner and open **Account -> Minecraft identity**.
2. Create a ten-minute link code.
3. In Minecraft, run `/karixmc link <code>`.
4. Use `/points`, `/pool`, and `/karixmc help` while testing.
5. Buy a store item on the website while linked, then join the server and run `/receive` if the item does not arrive immediately.
6. After five verified minutes, answer the activity prompt with `/answer <value>`.
7. Use **Unlink Minecraft** on the account page, or the targeted admin reset, before moving a Minecraft UUID to another test account.

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
- `/admin` manages economy pricing, Gold/Diamond tiers, promo bonuses, reports, punishments, searchable wallet and campaign grants, server trust, campaign credits, and statistics.
- `/player` and `/owner` redirect to the unified account for backward compatibility.

## Plugin API

Creator Studio shows a public `server-id` and generates a private `plugin-secret` once. Put both into the plugin's generated `config.yml`. Knowing a Server ID does not authenticate a request; the secret is required to create a valid signature. Rotate the secret immediately if it may have been copied.

Important endpoints:

- `POST /api/plugin/heartbeat` rewards verified player activity and returns wallet/pool status.
- `POST /api/plugin/purchases/pull` returns pending commands for a server.
- `POST /api/plugin/purchases/ack` confirms delivery or refunds failed purchases.

Version 0.6.4 batches linked-player activity, syncs protection policy from Creator Studio, links Minecraft identities with short-lived account codes, tracks the last verified activity across heartbeats, and uses website-generated arithmetic `/answer` challenges. The retired `/minepulse` alias is no longer registered. Quiet heartbeats continue earning until the configured AFK timeout actually expires. Every plugin request and response is authenticated with HMAC-SHA256, a timestamp, and a persisted one-time nonce. The plugin never sends player IP addresses. KarixMC calculates elapsed time, reward rates, campaign deductions, challenges, and wallet changes on the website; the plugin never directly edits balances.

## Plugin Build

See [minecraft-plugin/README.md](minecraft-plugin/README.md) for the full Paper installation, connection, firewall, security, and troubleshooting guide.
See [SECURITY.md](SECURITY.md) for trust boundaries, transmitted data, protocol controls, incident response, and responsible disclosure.

From `minecraft-plugin/`:

```bash
mvn clean package
```

Download the ready jar from `/plugin`, or copy the shaded jar from `minecraft-plugin/target/` into your Paper server `plugins/` folder. Start once to generate config, then set only the connection credentials:

```yaml
api-base-url: "https://your-domain.com"
server-id: "from owner panel"
plugin-secret: "from owner panel"
allow-insecure-http: false
```

For local testing where Paper and the website run on the same machine, keep `api-base-url: "http://localhost:3000"`. If Paper runs elsewhere, `localhost` is wrong; use the HTTPS URL reachable from that Minecraft server. Public HTTP is rejected by default. `allow-insecure-http: true` exists only for a temporary isolated test environment and must be disabled before launch. The temporary VPS URL uses normal port 80, so `http://51.83.180.202` is complete and must not include `:3000` or an `/api` suffix.

## Deploy Notes

- Copy `.env.example` to `.env` locally, and set the same variables in your host.
- `AUTH_SECRET` must be a strong unique value of at least 32 characters. Production will refuse to boot with the demo secret.
- `PLUGIN_SECRET_ENCRYPTION_KEY` must be a separate strong value of at least 32 characters. Plugin credentials are encrypted at rest and shown only once after server creation or rotation.
- Authentication uses opaque, hashed, database-backed sessions. Users can review and revoke devices from Account > Security, and password changes revoke every other session.
- New passwords require a passphrase of at least 15 characters. Login is throttled by account and connection, and public registration cannot assign privileged roles.
- Set `APP_BASE_URL` to the final HTTPS domain. Production validation rejects HTTP, localhost, placeholder domains, and URL paths.
- Production requires `AUTH_COOKIE_SECURE="true"`, verified email delivery, administrator TOTP, PostgreSQL, Redis, and independent secrets.
- No automated payment method is connected. Campaign credit and premium orders are coordinated through the official Discord, then granted by an administrator after manual confirmation. Never request or accept account passwords, TOTP codes, plugin secrets, or private keys through Discord. Select and security-review an automated payment provider only after HTTPS, PostgreSQL, backups, refund rules, merchant verification, and signed webhook tests are ready.
- SQLite is now only a read-only source for the one-time beta-data importer. All active local and production runtime data uses PostgreSQL.
- Do not reset the database during normal deployments. Removing and republishing an address creates a fresh server identity while retaining the removed record for audit history; account and admin controls provide targeted Minecraft unlinking.

Run `npm run test:auth` against a local production server on port 3001 to verify registration, password hashing, session revocation, logout, password rotation, and brute-force throttling.

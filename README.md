# MinePulse

MinePulse is a production-style MVP for a Minecraft server marketplace where verified playtime earns platform points.

Players earn points on funded servers, then spend those points on ranks, crates, cosmetics, or any owner-configured item. Server owners buy point pools with real money, choose reward rates per second, cap paid players, and buy Gold or Diamond premium placement. Admins can control prices, point pools, premium state, server visibility, and platform statistics.

## Stack

- Next.js App Router
- Prisma 7 with SQLite for local development
- Cookie JWT auth with role-based access
- Paper/Spigot plugin skeleton in `minecraft-plugin/`
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

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@minepulse.local` | `admin123` |
| Owner | `owner@minepulse.local` | `owner123` |
| Player | `player@minepulse.local` | `player123` |

## Key Flows

- `/` shows the randomized marketplace. Premium servers shuffle first. Regular servers shuffle below. Servers with empty point pools are hidden.
- `/player` shows wallet, purchases, point ledger, favorites, and verified play sessions.
- `/owner` lets server owners create servers, tune reward rules, buy points, buy premium, and configure item commands.
- `/admin` lets admins edit point package prices, Gold/Diamond pricing, server status, premium overrides, point pools, and platform statistics.

## Plugin API

The owner panel shows a `server-id` and `plugin-secret`. Put those into `minecraft-plugin/src/main/resources/config.yml`.

Important endpoints:

- `POST /api/plugin/heartbeat` rewards verified player activity and returns wallet/pool status.
- `POST /api/plugin/purchases/pull` returns pending commands for a server.
- `POST /api/plugin/purchases/ack` confirms delivery or refunds failed purchases.

The plugin tracks movement, inventory/chat/command activity, AFK timeout, IP hashing on the server side, and a periodic `/mpcode` challenge.

## Plugin Build

From `minecraft-plugin/`:

```bash
mvn package
```

Copy the shaded jar from `minecraft-plugin/target/` into your Paper server `plugins/` folder, start once to generate config, then set:

```yaml
api-base-url: "https://your-domain.com"
server-id: "from owner panel"
plugin-secret: "from owner panel"
```

For local testing with the Next dev server, keep `api-base-url: "http://localhost:3000"`.

## Deploy Notes

- Copy `.env.example` to `.env` locally, and set the same variables in your host.
- `AUTH_SECRET` must be a strong unique value of at least 32 characters. Production will refuse to boot with the demo secret.
- For real production payments, connect Stripe or PayPal where the current owner top-up and premium routes write simulated billing records.
- SQLite is fine for local MVP testing. Use Postgres before handling real money or large traffic.

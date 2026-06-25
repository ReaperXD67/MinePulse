# MinePulse Local MVP Testing Guide

This guide is for testers who need to run MinePulse locally, connect a Minecraft client, and verify the website plus plugin flows.

## Current Readiness

MinePulse is ready for local MVP testing:

- Website runs locally with a real Prisma/SQLite database.
- Login, unified account, server listing, tag filters, favorites, likes, comments, support, reports, admin pricing, promo codes, manual wallet grants, and creator tools are implemented.
- Paper plugin connects to the website, syncs server policy, verifies activity, blocks AFK rewards, asks `/answer` challenges, rewards only linked players, and delivers store purchases.
- Docker can run a local Paper test server on `localhost:25565`.

Not production-live yet:

- Real Stripe/PayPal payments are not connected.
- SQLite is for local testing. Use managed Postgres before real users.
- Production still needs hosting, monitoring, backups, rate limits, real email/support, and load testing.

## Requirements

- Node.js 20 or newer
- npm
- Docker Desktop, only needed for Minecraft game testing
- Minecraft Java Edition 1.21.4 for the provided Docker Paper server

## Clean Website Setup

Run these commands from the project root:

```bash
npm install
npm run assets:generate
npm run db:generate
npm run db:apply
npm run db:seed
npm run dev
```

Open:

```text
http://localhost:3000
```

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@minepulse.local` | `admin123` |
| Server creator | `owner@minepulse.local` | `owner123` |
| Player and creator | `player@minepulse.local` | `player123` |

The player account is the easiest one for normal gameplay testing.

## Start Minecraft Test Server

Keep the website running on `http://localhost:3000`, then open a second terminal in the project root:

```bash
npm run game:test:up
npm run game:test:status
```

Expected result:

- `MinePulseBridge` appears in the plugin list.
- Docker exposes the Minecraft server at `localhost:25565`.

Useful commands:

```bash
npm run game:test:logs
npm run game:test:down
```

## Link Minecraft Account

1. Log in as `player@minepulse.local`.
2. Open `http://localhost:3000/account`.
3. Find **Minecraft identity**.
4. Create a link code.
5. Join Minecraft Java Edition 1.21.4 at `localhost:25565`.
6. In game, run:

```text
/minepulse link CODE
```

Expected result:

- Minecraft chat confirms the account was linked.
- `/points` shows wallet/session information instead of asking you to link.

## Gameplay Reward Test

1. Stay online on the test server.
2. Move around, interact with inventory, chat, or run commands.
3. Run:

```text
/pool
/points
```

Expected result:

- `/pool` shows the server campaign pool and reward rate.
- `/points` shows wallet points and verified play.
- After heartbeats, points increase only for linked, non-AFK activity.

AFK behavior:

- If you stop activity long enough, rewards pause.
- When the challenge appears, answer with:

```text
/answer VALUE
```

Expected result:

- Correct answer resumes rewards.
- Wrong or expired answers do not reward until fixed.

## Store Purchase And Delivery Test

1. Stay logged in on the website as the linked player.
2. Open `http://localhost:3000/servers/skyforge-economy`.
3. Buy a store item.
4. If the item does not arrive instantly in Minecraft, run:

```text
/receive
```

Expected result:

- The purchase is queued by the website.
- The plugin pulls it, dispatches the configured console command, and acknowledges delivery.
- If delivery fails, the purchase is marked failed and the player is refunded.
- Online-only items stay pending while the player is offline.

## Friends And Privacy Test

1. Open `http://localhost:3000/account`.
2. In **Friends**, add an exact nickname such as:

```text
Skyforge Owner
```

3. Confirm the friend card shows online/offline state and last server when available.
4. In **Edit profile**, enable **Friend privacy**.
5. Log in as another account and try to add that private account.

Expected result:

- Public members can be added by exact display name, Minecraft name, or email.
- Private members cannot be added.

## Marketplace Filter Test

1. Open `http://localhost:3000`.
2. Use tag chips such as `SMP`, `Survival`, or `Economy`.
3. Refresh the page.

Expected result:

- The list filters by tag.
- Premium servers still appear above regular servers.
- Servers inside each group are shuffled.
- Servers with empty campaign pools are hidden.

## Creator Studio Test

1. Log in as `owner@minepulse.local` or `player@minepulse.local`.
2. Open `http://localhost:3000/account#servers`.
3. Create or edit a server.
4. Set reward rate to one of:

```text
1
1.5
2
2.5
3
```

Expected result:

- Half-step reward rates are accepted.
- Values like `1.2` are rejected.
- Plugin policy changes increase the policy revision and sync to the bridge.

Store item test:

- Add an item with a command like:

```text
say Delivered MinePulse item to {player}
```

- Keep **Deliver only while the player is online** enabled for normal item/rank commands.

## Admin Test

1. Log in as `admin@minepulse.local`.
2. Open `http://localhost:3000/admin`.
3. Test:
   - Economy package price edits
   - Gold/Diamond price edits
   - Bonus promo code create/edit
   - Manual wallet grant with a description
   - Server status/trust changes
   - Report punishment flow

Expected result:

- Manual wallet grants appear in the target account ledger.
- Server point adjustments affect campaign credits, not player wallets.
- Report punishments can pause, blacklist, or remove credits from a server.

## Troubleshooting

Website port busy:

```bash
npm run dev -- -p 3001
```

Database looks stale:

```bash
npm run db:apply
npm run db:seed
```

Plugin not connecting:

- Confirm the website is running.
- Confirm Docker Paper logs show `MinePulseBridge`.
- Confirm Docker uses `http://host.docker.internal:3000` internally.
- Check:

```bash
npm run game:test:logs
```

Minecraft cannot connect:

- Confirm Docker Desktop is running.
- Confirm `npm run game:test:up` completed.
- Connect to `localhost:25565`.

Reset game server:

```bash
npm run game:test:down
npm run game:test:up
```

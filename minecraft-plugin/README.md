# KarixMC Bridge 0.6.5

The Paper/Spigot plugin connects real Minecraft activity to KarixMC. The visible plugin ID and configuration folder are `KarixMCBridge`; the supported command namespace is `/karixmc`.

## Requirements

- Paper or Spigot 1.20 or 1.21
- Java 17 or newer
- Outbound HTTPS access to the deployed KarixMC website
- Maven 3.9 or newer only when building from source

## Install

1. Download `KarixMCBridge-0.6.5.jar` from `/plugin` on the website.
2. Copy it into the Paper server's `plugins/` directory.
3. Start Paper once, then stop it after `plugins/KarixMCBridge/config.yml` is created.
4. In KarixMC, open **Account -> Your servers -> Plugin connection**.
5. Put the website URL, Server ID, and Plugin secret into the generated file:

```yaml
api-base-url: "https://your-karixmc.com"
server-id: "from-creator-studio"
plugin-secret: "keep-this-private"
allow-insecure-http: false
```

6. Start Paper. Creator Studio should show **Plugin reached website** after policy sync.

Policy sync proves the plugin can reach KarixMC even when the Minecraft server is empty. **Last player activity** remains empty until at least one player joins. If a secret may have leaked, use the rotate button in Creator Studio, update `config.yml`, and restart Paper; the old secret stops working immediately.

Docker deployments can provide the same three values as `MINEPULSE_API_BASE_URL`, `MINEPULSE_SERVER_ID`, and `MINEPULSE_PLUGIN_SECRET` environment variables. Environment variables take precedence over `config.yml`.

For same-machine development, `api-base-url` can be `http://localhost:3000`. On a different host, `localhost` is wrong; use the public HTTPS website URL reachable from the Minecraft server. Public HTTP is rejected by default. Set `allow-insecure-http: true` only for a temporary isolated IP-based test, then turn it off as soon as HTTPS is available. Standard HTTP uses port 80 automatically; do not add `:3000` unless the website is actually exposed on that port. There is no separate wallet URL: the wallet is the `/account` page on that website.

## Website-Managed Policy

Behavioral configuration no longer lives in the plugin YAML. Owners manage their policy from Creator Studio, administrators can override it from the fleet console, and the bridge refreshes it every minute without restarting Paper:

- heartbeat interval
- purchase polling interval
- AFK timeout, default 300 seconds
- arithmetic challenge enabled/required state
- challenge interval, default 300 seconds
- answer window
- movement threshold
- minimum interaction events
- protection level

Only connection credentials remain local because the plugin needs them before it can securely contact the website.

## Player Commands

- `/answer <value>` submits the current website-generated arithmetic check.
- `/points` shows the player's platform wallet, current server rewards, and verified playtime.
- `/pool` shows the server campaign pool and reward rate.
- `/receive` retries queued store deliveries for the player on the current server.
- `/karixmc help` lists commands.
- `/karixmc link <code>` connects the in-game UUID to a signed-in website account using a ten-minute code.
- `/karixmc privacy` shows whether this player opted into reward activity sharing and lists the transmitted fields.
- `/karixmc forget` withdraws that local opt-in and stops future reward heartbeats for the player on this server.
- `/mpcode <value>` remains as a backwards-compatible alias for `/answer`.

## Verification Flow

1. The plugin accumulates meaningful movement, chat, command, and inventory activity.
2. After the owner-configured idle period, the heartbeat reports the player as AFK and no points are awarded.
3. KarixMC periodically creates an arithmetic question such as `How much is 2 + 3? Use /answer <value>`.
4. The plugin displays it and sends the player's answer in a signed heartbeat.
5. The website validates the answer. Required checks pause rewards until the answer is accepted.
6. KarixMC calculates the reward server-side and deducts it from the campaign pool.

Players must run the link command before reward activity sharing starts. Unlinked Minecraft players can still play normally and are excluded from heartbeat batches. The plugin sends the linked UUID and name, AFK state, bounded movement and interaction counters, elapsed-time claim, and challenge submission. It does not read or send player IP addresses.

Version 0.6.5 sends bounded batches of at most 200 linked players per heartbeat cycle instead of one HTTP request per player. Large servers are split into multiple sequential chunks. The website remembers the last heartbeat containing qualifying movement or activity and applies the configured AFK timeout across later quiet heartbeats. If AuthMe is installed, KarixMC activity, linking, statistics, challenges, and purchase delivery remain blocked until AuthMe reports that the player is authenticated. The retired `/minepulse` command is no longer registered. Requests and responses use HMAC-SHA256 over the exact body, timestamps, and persisted unique nonces. The website rejects stale, altered, replayed, or wrongly signed messages. Response bodies are size-limited before allocation, repeated log failures are throttled, player command requests use cooldowns, and startup diagnostics identify the exact invalid or missing connection setting without exposing secrets.

No plugin can make a server owner unable to modify software on a machine they control. A dishonest owner can fabricate activity inputs or automate a visible arithmetic question. KarixMC limits the damage by making server time, rates, balances, player caps, challenge state, pool deductions, nonce history, reports, trust states, and enforcement website-authoritative. High-value launch phases should add behavioral fraud analytics and manual review; this is detection and containment, not impossible-to-bypass attestation.

## Purchase Delivery

Store commands support `{player}` and `{uuid}` placeholders. The bridge polls pending purchases, dispatches commands as console, and acknowledges delivery. Failed delivery refunds the player's earned points.

By default, store items require the player to be online. If the player buys on the website while offline, the purchase remains pending until they join the server. They can run `/receive` to retry delivery immediately.

Example:

```text
lp user {player} parent addtemp vip 7d
```

## Build From Source

```bash
cd minecraft-plugin
mvn clean package
```

The shaded jar is created under `target/`.

## Troubleshooting

- **Policy sync failed:** verify the URL, ID, secret, and outbound port 443.
- **Invalid credentials:** copy the server ID and secret again without extra spaces.
- **Stale heartbeat:** synchronize the Minecraft host clock with NTP.
- **No rewards:** check campaign credits, listing status, paid-player cap, AFK state, and pending challenge.
- **Stats unavailable:** confirm the website is reachable and the player UUID has completed a heartbeat.

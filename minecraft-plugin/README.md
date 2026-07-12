# KarixMC Bridge 0.5.0

The Paper plugin connects real Minecraft activity to KarixMC. The visible plugin ID and configuration folder are `KarixMCBridge`; `/minepulse` remains a command alias during migration.

## Requirements

- Paper 1.20 or 1.21
- Java 17 or newer
- Outbound HTTPS access to the deployed KarixMC website
- Maven 3.9 or newer only when building from source

## Install

1. Download `KarixMCBridge-0.5.0.jar` from `/plugin` on the website.
2. Copy it into the Paper server's `plugins/` directory.
3. Start Paper once, then stop it after `plugins/KarixMCBridge/config.yml` is created.
4. In KarixMC, open **Account -> Your servers -> Plugin connection**.
5. Put the website URL, Server ID, and Plugin secret into the generated file:

```yaml
api-base-url: "https://your-karixmc.com"
server-id: "from-creator-studio"
plugin-secret: "keep-this-private"
```

6. Start Paper. Creator Studio should show **Plugin reached website** after policy sync.

Policy sync proves the plugin can reach KarixMC even when the Minecraft server is empty. **Last player activity** remains empty until at least one player joins. If a secret may have leaked, use the rotate button in Creator Studio, update `config.yml`, and restart Paper; the old secret stops working immediately.

Docker deployments can provide the same three values as `MINEPULSE_API_BASE_URL`, `MINEPULSE_SERVER_ID`, and `MINEPULSE_PLUGIN_SECRET` environment variables. Environment variables take precedence over `config.yml`.

For same-machine development, `api-base-url` can be `http://localhost:3000`. On a different host, `localhost` is wrong; use the public website URL reachable from the Minecraft server. There is no separate wallet URL: the wallet is the `/account` page on that website.

## Website-Managed Policy

Behavioral configuration no longer lives in the plugin YAML. Owners manage it from Creator Studio, and the bridge refreshes it every minute without restarting Paper:

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
- `/mpcode <value>` remains as a backwards-compatible alias for `/answer`.

## Verification Flow

1. The plugin accumulates meaningful movement, chat, command, and inventory activity.
2. After the owner-configured idle period, the heartbeat reports the player as AFK and no points are awarded.
3. KarixMC periodically creates an arithmetic question such as `How much is 2 + 3? Use /answer <value>`.
4. The plugin displays it and sends the player's answer in a signed heartbeat.
5. The website validates the answer. Required checks pause rewards until the answer is accepted.
6. KarixMC calculates the reward server-side and deducts it from the campaign pool.

Players must link a KarixMC website account before rewards start. Unlinked Minecraft players can still play normally, but the bridge will not create a wallet or pay points for them.

Heartbeats use HMAC-SHA256, timestamps, and unique nonces. The website rejects stale signatures and replays, stores only a hash derived from the player IP, and records suspicious sessions for moderation.

No plugin can make a server owner unable to modify software on a machine they control. KarixMC therefore combines telemetry with website-side reward calculation, challenge verification, stale bridge visibility, player reports, trust states, and administrator enforcement.

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

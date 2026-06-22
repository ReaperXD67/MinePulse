# MinePulse Bridge 0.2.0

The Paper plugin reports signed activity telemetry to MinePulse and delivers store purchases as console commands.

## Requirements

- Paper 1.20 or 1.21 server
- Java 17 or newer
- Maven 3.9 or newer to build from source
- Outbound HTTP/HTTPS access from the Minecraft server to the MinePulse website

## Build

```bash
cd minecraft-plugin
mvn clean package
```

The deployable shaded jar is created under `target/`. Copy `minepulse-bridge-0.2.0.jar` into the Paper server's `plugins/` directory.

## Connect A Server

1. Log in to MinePulse and open **Account → Your servers**.
2. Create or open the server listing.
3. Under **Plugin connection**, copy the Server ID and Plugin secret.
4. Start Paper once with the jar installed so `plugins/MinePulseBridge/config.yml` is generated.
5. Stop Paper and edit the generated configuration:

```yaml
api-base-url: "https://minepulse.example.com"
server-id: "paste-server-id"
plugin-secret: "paste-plugin-secret"

heartbeat-interval-seconds: 20
purchase-poll-seconds: 15
afk-timeout-seconds: 90

challenge:
  enabled: true
  interval-seconds: 300
  answer-window-seconds: 90
  required: true

movement:
  minimum-distance-squared: 0.04
```

6. Start Paper again and check the console for `MinePulse bridge enabled`.
7. Join with a player, move or interact, and check the creator studio for a signed heartbeat and plugin version.

For same-machine development, use `http://localhost:3000`. If Paper runs on another computer or host, use the website's reachable HTTPS URL. Do not use `localhost` unless MinePulse is running on that exact Minecraft host.

## What The Plugin Reports

- Player UUID and Minecraft name
- Hashed-source IP input; the website stores only the hash
- Accumulated movement score between heartbeats
- Chat, command, inventory, and movement activity event counts
- AFK state
- Challenge state
- Plugin version, timestamp, and unique nonce
- HMAC-SHA256 signature generated with the server secret

The website verifies freshness and the signature, rejects replayed nonces, applies the paid-player cap, checks campaign credits, and calculates the reward. The plugin does not decide the final wallet balance.

## Anti-Bot And Anti-AFK Protection

- Movement is accumulated between heartbeats instead of sampled at one instant.
- Chat, commands, inventory actions, and meaningful movement count as activity.
- AFK players do not earn.
- Required `/mpcode <code>` challenges hold rewards until answered.
- Stale timestamps and duplicate heartbeat nonces are rejected.
- Suspicious sessions increase an anomaly score visible to moderation systems.

No plugin can make a server owner mathematically unable to modify software on a machine they control. MinePulse therefore combines signed telemetry with server-side reward calculation, stale bridge visibility, player reports, support history, trust states, and administrator punishments.

## Purchase Delivery

Store commands support:

- `{player}` for the current Minecraft name
- `{uuid}` for the linked Minecraft UUID

Example:

```text
lp user {player} parent addtemp vip 7d
```

The plugin polls pending purchases, executes the command as console, then acknowledges success or failure. Failed deliveries refund the player's earned points.

## Troubleshooting

- **Invalid server credentials:** verify Server ID and Plugin secret without extra spaces.
- **Heartbeat timestamp is stale:** synchronize the Minecraft host clock with NTP.
- **Heartbeat signature is invalid:** install the current jar and confirm the configured secret.
- **No rewards:** confirm the server campaign is funded, the listing is active, the player is not AFK, the paid cap is not exceeded, and any challenge was answered.
- **Website unreachable:** allow outbound port 443 and verify `api-base-url` from the Minecraft host.

# KarixMC official showcase runbook

## What this solves

KarixMC needs working inventory before approaching creators. The official showcase provides three real, public Paper servers connected to the production API:

| World | Join address | Purpose | Capacity |
| --- | --- | --- | ---: |
| Skyforge Economy | `karixmc.pl` | Primary joining, linking, earning, and store-delivery demonstration | 32 |
| Ember SMP | `karixmc.pl:25566` | Proves server-specific sessions, pools, and purchase queues | 24 |
| Voidcraft Hardcore | `karixmc.pl:25567` | Proves a third isolated bridge and a hard-mode experience | 18 |

These are first-party demonstration worlds. Every marketplace card and profile labels that fact. They must never be described as independent customers, endorsements, testimonials, or evidence of organic demand. Do not add fake players, sessions, reviews, likes, purchases, or player-count statistics.

## Creator demonstration flow

1. Open `https://karixmc.pl`, create an account, and open Account.
2. Generate a Minecraft link code.
3. Join `karixmc.pl` with a paid Java Edition account on Minecraft 1.21.4.
4. Run `/karixmc link CODE` in chat. The code is short-lived and single-use.
5. Move and play normally. Run `/points` and `/pool` to see the wallet and active campaign.
6. If an activity challenge appears, answer it with `/answer VALUE` before its timer expires.
7. After earning at least 60 points, open the server profile, purchase the cheapest item, and remain online.
8. The bridge polls the server-specific purchase queue and executes a vanilla `give` command. If needed, run `/receive` to retry a queued delivery.
9. Repeat on Ember or Voidcraft to show that each world has its own identity, pool, session history, and delivery queue.

Nothing is granted merely for connecting. Rewards require a linked account, consent, signed bridge traffic, real activity, non-AFK play, campaign capacity, and any configured challenge response.

## Architecture and limits

- The website remains on two loopback-only Next.js replicas behind Nginx HTTPS.
- PostgreSQL and Redis remain private Docker services; no database or cache port is exposed.
- The showcase is a separate Compose project. Only TCP ports 25565–25567 are published.
- Every Paper instance uses online mode and secure-profile enforcement. Cracked/offline clients are rejected.
- Each world has a distinct 96-character bridge secret. Secrets live only in root-owned `/opt/karixmc/.env.showcase` with mode `0600`; the database stores encrypted values.
- RCON is enabled only inside the Docker network for consistent save operations. Port 25575 is not published.
- Each server is capped at 3 GiB of Java heap, 4 GiB container memory, and 2.5 CPUs. The three-server ceiling is 12 GiB and 7.5 vCPU, leaving capacity for the website, PostgreSQL, Redis, the OS, traffic spikes, and backups.
- Player capacity depends more on single-core speed, view/simulation distance, plugins, mob/redstone load, and world generation than total RAM. The current limits are deliberate launch safeguards, not promises that 74 simultaneous players will remain lag-free under every workload.

## Install or reconcile

After the website image and database migration are deployed:

```bash
cd /opt/karixmc
sudo ./deploy/scripts/install-showcase.sh
```

The installer is idempotent. It:

1. verifies the pinned bridge JAR checksum;
2. creates root-only secrets when `.env.showcase` does not exist;
3. creates world directories under `/var/lib/karixmc/showcase`;
4. applies Prisma migrations and reconciles the three stable server records;
5. hides obsolete store commands and publishes six vanilla-safe demonstration items;
6. removes seeded demo interactions from the known locked demo accounts;
7. opens only TCP 25565–25567 in UFW;
8. starts the three Paper servers through systemd and Docker Compose;
9. waits for container health and runs the database plus public-directory audit.

Reconciliation preserves real player history, legitimate interactions, purchases, and remaining campaign balances. It does not refill a depleted pool on every run.

## Routine operations

```bash
sudo systemctl status karixmc-showcase.service
sudo systemctl status karixmc-showcase-health.timer
sudo docker compose --env-file .env.showcase -p karixmc-showcase -f docker-compose.showcase.yml ps
sudo docker compose --env-file .env.showcase -p karixmc-showcase -f docker-compose.showcase.yml logs --tail=200
sudo ./deploy/scripts/monitor-showcase.sh
```

The health timer checks container health, local TCP listeners, and presence of all three stable IDs in the public live-directory endpoint every two minutes. It uses the existing alert webhook when configured.

Do not print `.env.showcase`, paste its values into chat, or place it in Git. To rotate bridge secrets, stop the showcase, replace all three values with new independent random strings, run `install-showcase.sh`, then restart. Rotation is all-or-nothing to avoid leaving a database and server with different credentials.

## Backups and restore

The production backup now includes:

- PostgreSQL in custom `pg_dump` format;
- uploaded media;
- the complete showcase data root, including all three worlds and Paper configuration.

Before the world archive is taken, each running server receives `save-off` and `save-all flush`; writes are re-enabled even when the archive command fails. `SHA256SUMS` covers every included artifact. The normal retention, age encryption, and remote-copy settings still apply.

Restore remains confirmation-gated:

```bash
RESTORE_CONFIRM=RESTORE sudo ./deploy/scripts/restore.sh /absolute/path/to/karixmc-TIMESTAMP.tar.gz
```

When a backup contains showcase worlds, restore validates that `SHOWCASE_DATA_ROOT` is a non-root absolute path, stops the showcase, restores exactly that directory, restores ownership, and starts the stack again if it was previously running.

## DDoS and network position

The HTTPS website can use a web proxy or CDN, but ordinary web proxying does not protect raw Minecraft TCP. The three game ports depend on the VPS provider's network-layer mitigation plus host controls. UFW permits only SSH, HTTP, HTTPS, and these three Minecraft ports; RCON, PostgreSQL, Redis, and Next.js ports remain private.

Before a major campaign, confirm the provider's current mitigation limits and emergency process. If attacks or launch traffic exceed the included protection, move the game endpoints behind a Minecraft-aware protected proxy/provider. Keep the website API on HTTPS and do not expose the internal application or data services as a workaround.

## DNS

No website DNS change is required because the showcase uses the existing `karixmc.pl` address. Skyforge uses Minecraft's default port. Ember and Voidcraft currently require their explicit ports.

Optional polish is to add three DNS names and Minecraft SRV records later:

- `skyforge.karixmc.pl` → port 25565
- `ember.karixmc.pl` → port 25566
- `voidcraft.karixmc.pl` → port 25567

Each hostname needs an A record pointing to the VPS and an `_minecraft._tcp` SRV record pointing to its port. Do not enable an orange-cloud/web-only proxy on these raw game records unless the DNS provider explicitly supports Minecraft TCP proxying.

## Launch gate

Do not advertise until all of these are true:

- `npm run lint` and `npm run build` pass for the deployed commit.
- All three containers are `healthy` and survive a VPS reboot.
- All three IDs appear in `https://karixmc.pl/api/marketplace/live`.
- All three cards show unique artwork, the correct join address, `VERIFIED`, `online`, and `Official demo`.
- A real Java Edition account completes link → active reward → wallet update → store purchase → in-game delivery.
- Backups contain `showcase-worlds.tar.gz`, checksums verify, and an off-host encrypted copy exists.
- UFW exposes no unintended port and RCON is unreachable publicly.
- Admin MFA and production email are enabled before broad public promotion; these remain separate account-security launch blockers if not yet configured.

The automated audit verifies infrastructure and data integrity. The real-account walkthrough is intentionally manual because generating fake player activity would invalidate the proof the showcase is meant to provide.

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
3. Join `karixmc.pl` with Java Edition. Minecraft 1.21.4 is recommended; ViaVersion and ViaBackwards also accept a broad range of modern Java clients.
4. On the first connection, run `/register LONG_PASSWORD LONG_PASSWORD`. AuthMe stores a BCrypt hash in the private shared authentication database. Do not reuse the website password.
5. On later connections, run `/login LONG_PASSWORD`. Registration is shared by all three worlds, although each new connection requires login.
6. Run `/karixmc link CODE` in chat only after AuthMe reports a successful login. The website code is short-lived and single-use.
7. Move and play normally. Run `/points` and `/pool` to see the wallet and active campaign.
8. If an activity challenge appears, answer it with `/answer VALUE` before its timer expires.
9. After earning at least 60 points, open the server profile, purchase the cheapest item, and remain online.
10. The bridge polls the server-specific purchase queue and executes a vanilla `give` command. If needed, run `/receive` to retry a queued delivery.
11. Repeat on Ember or Voidcraft to show that each world has its own identity, pool, session history, and delivery queue.

Nothing is granted merely for connecting. Rewards require a linked account, consent, signed bridge traffic, real activity, non-AFK play, campaign capacity, and any configured challenge response.

## Architecture and limits

- The website remains on two loopback-only Next.js replicas behind Nginx HTTPS.
- The website PostgreSQL and Redis services remain private; no database or cache port is exposed.
- The showcase is a separate Compose project. Only TCP ports 25565–25567 are published.
- During the controlled beta, every Paper instance uses offline mode so paid and non-premium Java clients can join. AuthMe blocks movement, chat, inventory access, and KarixMC commands until the player registers or logs in; ProtocolLib supplies AuthMe's inventory protection on Paper 1.21.4.
- A dedicated PostgreSQL container stores AuthMe registrations for all three worlds. It is attached only to an internal Docker network and publishes no host port. Passwords use BCrypt with 12 cost rounds and must be 10–64 characters.
- Offline-mode names are password-protected pseudonyms, not proof of Mojang/Microsoft account ownership. This beta setting must not be marketed as Mojang identity verification.
- AuthMe 5.7.0 and ProtocolLib 5.4.0 are pinned because their Bukkit API declarations are compatible with the Paper 1.21.4 showcase. AuthMe 6.0's Paper-specific build targets a newer Paper API and must not be substituted without upgrading and retesting the game server.
- ViaVersion 5.11.0 and ViaBackwards 5.11.0 translate protocol versions. They do not guarantee perfect behavior for every historical release; 1.21.4 remains the reference client.
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
2. downloads pinned AuthMe, ProtocolLib, ViaVersion, and ViaBackwards releases from their official GitHub projects and verifies exact SHA-256 checksums;
3. creates or upgrades the root-only `.env.showcase`, including a separate authentication-database password and explicit beta offline-mode switches;
4. creates world and plugin directories under `/var/lib/karixmc`;
5. applies Prisma migrations and reconciles the three stable server records;
6. hides obsolete store commands and publishes six vanilla-safe demonstration items;
7. removes seeded demo interactions from the known locked demo accounts;
8. starts AuthMe once to generate version-matched configuration, then points all three worlds at the private shared database and applies the password policy;
9. opens only TCP 25565–25567 in UFW;
10. starts the authentication database and three Paper servers through systemd and Docker Compose;
11. waits for container health and runs the database plus public-directory audit.

Reconciliation preserves real player history, legitimate interactions, purchases, and remaining campaign balances. It does not refill a depleted pool on every run.

## Routine operations

```bash
sudo systemctl status karixmc-showcase.service
sudo systemctl status karixmc-showcase-health.timer
sudo docker compose --env-file .env.showcase -p karixmc-showcase -f docker-compose.showcase.yml ps
sudo docker compose --env-file .env.showcase -p karixmc-showcase -f docker-compose.showcase.yml logs --tail=200
sudo ./deploy/scripts/monitor-showcase.sh
```

The health timer checks the private authentication database, all three Paper containers, local TCP listeners, and presence of all three stable IDs in the public live-directory endpoint every two minutes. It uses the existing alert webhook when configured.

Do not print `.env.showcase`, paste its values into chat, or place it in Git. To rotate bridge secrets, stop the showcase, replace all three values with new independent random strings, run `install-showcase.sh`, then restart. Rotation is all-or-nothing to avoid leaving a database and server with different credentials.

## Backups and restore

The production backup now includes:

- PostgreSQL in custom `pg_dump` format;
- uploaded media;
- the private AuthMe PostgreSQL database in custom `pg_dump` format;
- the complete showcase data root, including all three worlds and Paper configuration.

Before the world archive is taken, each running server receives `save-off` and `save-all flush`, then the three game processes stop briefly so `tar` sees a consistent filesystem. They restart automatically even when the archive command fails; the website and private databases remain online. `SHA256SUMS` covers every included artifact. The normal retention, age encryption, and remote-copy settings still apply.

Restore remains confirmation-gated:

```bash
RESTORE_CONFIRM=RESTORE sudo ./deploy/scripts/restore.sh /absolute/path/to/karixmc-TIMESTAMP.tar.gz
```

When a backup contains showcase data, restore validates that `SHOWCASE_DATA_ROOT` is a non-root absolute path, stops the showcase, restores exactly that directory and the AuthMe database, restores ownership, and starts the stack again if it was previously running.

## Ending the non-premium beta

Offline mode is an explicit, reversible beta policy in `/opt/karixmc/.env.showcase`. Before switching back, stop new registrations and tell testers that offline UUIDs are different from Mojang UUIDs. Then set:

```dotenv
SHOWCASE_ONLINE_MODE=TRUE
SHOWCASE_ENFORCE_SECURE_PROFILE=TRUE
```

Run `install-showcase.sh` again and complete a fresh link test with a paid account. Existing website links created from offline UUIDs may need to be unlinked and linked again. AuthMe can remain as an extra login layer, or be removed in a separately tested migration.

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
- One paid client and one non-premium client both authenticate; neither can move, chat, run `/karixmc link`, or use inventory before AuthMe login.
- A real player completes AuthMe login → website link → active reward → wallet update → store purchase → in-game delivery.
- Registration on Skyforge is recognized on Ember and Voidcraft, while each connection still asks for `/login`.
- Backups contain `showcase-worlds.tar.gz` and `showcase-auth.dump`, checksums verify, and an off-host encrypted copy exists.
- UFW exposes no unintended port and RCON is unreachable publicly.
- Admin MFA and production email are enabled before broad public promotion; these remain separate account-security launch blockers if not yet configured.

The automated audit verifies infrastructure and data integrity. The real-player walkthrough is intentionally manual because generating fake player activity would invalidate the proof the showcase is meant to provide.

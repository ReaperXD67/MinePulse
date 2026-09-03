# KarixMC Production Runbook

## Release status

The public beta is live at `https://karixmc.pl`. It uses PostgreSQL for durable data, Redis for shared rate limits and short-lived marketplace caching, two isolated Next.js application replicas, Nginx for TLS and load balancing, persistent media, and recurring encrypted database/media backups.

Automated payment collection remains deliberately disabled with `PAYMENTS_ENABLED=false`. Campaign credit and premium orders are coordinated through the official Discord, then recorded by an administrator after manual confirmation. Staff must never request account passwords, TOTP codes, plugin secrets, or private keys through Discord.

## Production architecture

```mermaid
flowchart LR
  U[Players and owners] --> N[Nginx HTTPS and rate limits]
  P[Minecraft plugins] --> N
  N --> A1[Next.js replica 1]
  N --> A2[Next.js replica 2]
  A1 --> PG[(PostgreSQL)]
  A2 --> PG
  A1 --> R[(Redis)]
  A2 --> R
  A1 --> M[Compressed media volume]
  A2 --> M
  PG --> B[Encrypted backups]
  M --> B
  B --> O[Off-site object storage]
```

Production runs on an Ubuntu 24.04 Contabo Cloud VPS with 12 vCPU, 48 GB RAM, and 400 GB SSD. Container limits reserve 2 GB and 2 CPUs for each app replica, 6 GB and 3 CPUs for PostgreSQL, and 512 MB for Redis, leaving substantial capacity for Ubuntu, Nginx, Docker, backups, and short spikes.

## Confirmed launch identity

- Primary origin: `https://karixmc.pl`
- Official Discord: `https://discord.gg/6sWTyFEXxR`
- Initial administrator/support contact: `karixai@proton.me`
- Operator display name: `KarixMC` (independent project; no company is being claimed)
- Production host: `169.58.213.35` (`/opt/karixmc`, Docker deployment)
- Data recovery: the previous VPS was unreachable, so the newest intact local SQLite snapshot was imported transactionally into PostgreSQL and verified by table counts. Treat the encrypted off-server backup as the recovery baseline.

## Information still required

Do not send production passwords or private keys in chat or commit them to Git.

1. A Resend account, verified sending domain, and SMTP API key for signup verification and password recovery. The normal Proton mailbox remains the recipient/contact identity, not the transactional sender.
2. A human legal review of the privacy, terms, manual-order, and refund wording for the countries served. Add a postal operator address only if counsel confirms it is required and accurate.
3. An off-site object-storage target supported by `rclone`; encrypted backups currently run on the VPS and the first recovery copy has been verified off-server.
4. An alert webhook plus an external uptime monitor. The VPS timer cannot report when the entire VPS is offline.
5. Complete the administrator password and TOTP bootstrap privately on the VPS, then set `ADMIN_2FA_REQUIRED=true`.
6. Later: the selected automated payment provider and supported currencies. Keep automated payments disabled until then.

## 1. Prepare the VPS

Point the DNS records to the VPS first. Log in with a temporary privileged account, clone the approved repository to `/opt/karixmc`, and run:

```bash
sudo bash deploy/scripts/provision-ubuntu.sh
```

Some LXC providers disable the kernel mount permissions required by Docker. If
`docker run` fails while mounting `/proc`, use the supported native path:

```bash
sudo APP_ENV_FILE=/opt/karixmc/.env.production bash deploy/scripts/provision-native-ubuntu.sh
```

For that path, set `DATABASE_URL` and `REDIS_URL` to loopback addresses instead
of Docker service names. PostgreSQL, Redis, and two loopback-only Next.js
workers are then managed by systemd; the public Nginx topology is unchanged.
Also set `DEPLOYMENT_MODE=native` and use `HEALTHCHECK_BASE_URL=http://127.0.0.1`
so operational timers can verify the app before public DNS is available.

Add an SSH key for the `karixmc` user and verify a second SSH session before disabling root login and password authentication in `/etc/ssh/sshd_config`.

## 2. Configure production

```bash
cd /opt/karixmc
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Generate every secret independently on the VPS. Hex output is URL-safe and shell-safe:

```bash
openssl rand -hex 32
```

Use different values for PostgreSQL, Redis, `AUTH_SECRET`, `PLUGIN_SECRET_ENCRYPTION_KEY`, `ACCOUNT_MFA_ENCRYPTION_KEY`, and `HEALTHCHECK_TOKEN`. Set the real HTTPS origin, SMTP sender, legal details, Discord URL, and backup settings. Validate before deployment:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate npm run production:validate
```

Warnings about missing encrypted/off-site backups or alerts must be resolved before public launch.

If either data-encryption key was initialized with a placeholder, rotate the stored ciphertext and environment values together after taking a fresh encrypted backup:

```bash
sudo bash deploy/scripts/rotate-encryption-keys.sh
```

The rotation stops only the two website replicas, re-encrypts plugin and administrator-MFA credentials in one database transaction, atomically replaces the root-only environment file, and restarts both replicas. It never prints the old or new keys. Do not replace these environment values by hand; doing so would make existing encrypted records unreadable.

### Configure the free email relay

Resend is the selected SMTP provider because its free transactional tier currently includes 3,000 emails per month with a 100-email daily limit, supports SMTP directly, and requires no application SDK. Check the [current Resend pricing](https://resend.com/pricing) before launch because free-plan limits can change.

1. Create a Resend account and add `karixmc.pl` under **Domains**.
2. Copy every SPF and DKIM record shown by Resend into the domain's DNS settings, then wait for the domain to show **Verified**. Add DMARC after SPF and DKIM are working.
3. Create a sending API key. Store it only in the untracked `.env.production` file.
4. Configure the production values. The SMTP username is literally `resend`; the API key is the password:

```dotenv
EMAIL_REQUIRED="true"
SMTP_URL="smtps://resend:re_your_real_api_key@smtp.resend.com:465"
EMAIL_FROM="KarixMC <no-reply@karixmc.pl>"
```

5. Check authentication, then send one end-to-end message to the operator mailbox:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate npm run email:check
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate npm run email:check -- karixai@proton.me
```

The first command does not send mail. The second sends one explicit test message. Confirm that it arrives (including checking spam), then test signup verification and password recovery through the website. Resend's SMTP host, ports, and authentication format are documented in the [SMTP guide](https://resend.com/docs/send-with-smtp).

## 3. Migrate beta data

Put the old site in maintenance mode so no writes happen during the final copy. Preserve the SQLite source as a read-only rollback artifact.

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d postgres redis
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate npm run db:import-sqlite -- --source /secure/path/dev.db
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate npm run db:seed:production
```

The importer refuses a non-empty destination unless `--force` is explicitly supplied, imports tables in foreign-key order inside one transaction, converts SQLite dates and booleans, invalidates the three documented development-account passwords and sessions, and verifies every destination row count. Never use `--force` without a fresh backup.

Imported beta accounts are not silently marked email-verified. Existing testers must verify their email before logging into public production.

## 4. Create the administrator

```bash
read -r -p "Admin email: " BOOTSTRAP_ADMIN_EMAIL
read -r -p "Admin username: " BOOTSTRAP_ADMIN_USERNAME
read -r -s -p "Admin password: " BOOTSTRAP_ADMIN_PASSWORD; echo
export BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD
docker compose --env-file .env.production -f docker-compose.production.yml run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_USERNAME -e BOOTSTRAP_ADMIN_PASSWORD \
  -e BOOTSTRAP_SINGLE_ADMIN=true migrate npm run db:bootstrap-admin
unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD
```

Add the one-time TOTP key to the administrator's authenticator app immediately. Do not save the key in chat, screenshots, shell history, or tickets. The bootstrap revokes prior sessions and can demote all other administrators.

## 5. Deploy and enable HTTPS

```bash
sudo -u karixmc bash deploy/scripts/deploy.sh
sudo DOMAIN=your-domain.example LETSENCRYPT_EMAIL=ops@your-domain.example \
  bash deploy/scripts/install-nginx-tls.sh
sudo bash deploy/scripts/install-operations-timers.sh
```

On a native LXC deployment, replace the first command with:

```bash
sudo APP_ENV_FILE=/opt/karixmc/.env.production bash deploy/scripts/deploy-native.sh
```

Nginx exposes only ports 80 and 443, redirects HTTP to HTTPS, load-balances the two loopback-only app replicas, sets security headers, and applies tighter limits to authentication and plugin endpoints. PostgreSQL and Redis have no public host ports.

## 6. Verify launch

```bash
curl -fsS https://your-domain.example/api/health/live
curl -fsS -H "Authorization: Bearer $HEALTHCHECK_TOKEN" \
  https://your-domain.example/api/health/ready
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 app app_replica postgres redis
```

For a native LXC deployment, replace the Docker status commands with:

```bash
systemctl status karixmc-app@3000 karixmc-app@3001 postgresql redis-server nginx
journalctl -u karixmc-app@3000 -u karixmc-app@3001 --no-pager -n 200
```

Run a staged load test before changing DNS traffic or announcing the site:

```bash
LOAD_BASE_URL=https://your-domain.example LOAD_CONCURRENCY=50 LOAD_DURATION_SECONDS=60 npm run production:load-smoke
LOAD_BASE_URL=https://your-domain.example LOAD_PATH=/ LOAD_CONCURRENCY=200 LOAD_DURATION_SECONDS=60 LOAD_MAX_P95_MS=3000 npm run production:load-smoke
```

The 200-client test intentionally simulates continuous refreshes and is much harsher than 200 ordinary online users. Nginx deliberately returns HTTP 429 after a single source exceeds the configured request or connection budget; treat 429 as successful overload protection, while 5xx responses indicate a backend or proxy fault. Watch VPS CPU, memory, PostgreSQL connections, p95 latency, and both response classes while it runs.

## 7. Backups and recovery

The supplied timer runs every six hours and retains 14 days by default. Each backup contains a custom-format PostgreSQL dump, compressed media, and SHA-256 checksums. Configure `BACKUP_AGE_RECIPIENT` and `BACKUP_REMOTE` so the only copy is not on the production VPS.

```bash
sudo systemctl start karixmc-backup.service
sudo journalctl -u karixmc-backup.service --no-pager
sudo systemctl list-timers 'karixmc-*'
```

Perform a scheduled restore drill before launch and at least quarterly:

```bash
sudo RESTORE_CONFIRM=RESTORE APP_DIR=/opt/karixmc \
  bash deploy/scripts/restore.sh /absolute/path/to/karixmc-backup.tar.gz.age
```

The restore takes a safety backup first, verifies checksums, stops both replicas, restores PostgreSQL and media, then restarts both replicas. Verify readiness and ledger/account totals afterward.

## Rollback

Keep the old SQLite file and previous Git commit read-only until production is accepted. If cutover validation fails, stop both new replicas, point Nginx/DNS back to the known-good service, preserve the failed PostgreSQL database for analysis, and do not merge data in both directions. Announce a maintenance window before retrying the migration from a new SQLite snapshot.

## Measured local acceptance results

- PostgreSQL import: exact row-count verification across 25 beta tables.
- Twelve existing functional/security suites: all passed.
- Production account security: verified email, one-use tokens, session revocation, enumeration-safe recovery, and admin TOTP passed.
- Browser audit: six routes at desktop and mobile widths, zero console errors and zero horizontal overflow.
- Cached directory: 200 concurrent clients, about 1,224 requests/second, 181 ms p95, zero errors.
- Full homepage across two replicas: 200 concurrent continuous clients, about 162 renders/second, 2.72 s p95, zero errors.
- Backup/restore: checksums, database restore, media restore, and both post-restore readiness checks passed.

These figures prove the architecture under local synthetic load; they are not a permanent capacity guarantee. Repeat the test on the purchased VPS and monitor real traffic before raising limits.

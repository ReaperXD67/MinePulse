# KarixMC Security Model

This document describes the security boundary of the KarixMC website and `KarixMCBridge` 0.6.1. It is a technical operating guide, not a promise that any internet service can be made bug-free.

## Trust boundaries

- The KarixMC website and database are authoritative for wallets, campaign pools, reward rates, paid-player caps, challenges, store prices, purchases, premium state, reports, and enforcement.
- A Server ID is a public identifier used to route requests. It is not a password.
- A plugin secret is a private signing key. It is shown once, encrypted at rest with AES-256-GCM, and can be rotated. The old key stops working immediately after rotation.
- Every protocol-v2 plugin request and response uses HMAC-SHA256 over the HTTP method or response status, path, Server ID, timestamp, one-time nonce, and exact body hash.
- The website rejects stale timestamps, duplicate nonces, altered bodies, invalid signatures, inactive servers, suspended servers, blacklisted servers, oversized messages, and excessive request rates.

## Player privacy and consent

Unlinked players are not included in reward heartbeat batches. Running `/karixmc link <code>` opts that Minecraft identity into the limited activity data needed for KarixMC rewards on that server.

The plugin sends:

- linked Minecraft UUID and current Minecraft name;
- active/AFK state;
- bounded movement and interaction counters;
- a bounded elapsed-time claim;
- activity-check ID and answer when submitted;
- plugin version once per batch.

The plugin does not read or transmit a Minecraft player's IP address. Reward sessions do not have an IP-address or IP-hash column. `/karixmc privacy` explains the current state in game. `/karixmc forget` removes the local opt-in and stops future reward heartbeats for that player on that server.

The website separately uses a one-way connection fingerprint for login abuse prevention. That is website authentication traffic, not Minecraft player telemetry.

## Modified-plugin limitation

A server owner controls the machine running Paper and can replace or modify any plugin. Cryptographic signatures prove that a request used the configured secret and was not altered in transit; they cannot prove that owner-controlled software reported honest physical gameplay.

KarixMC contains this risk by calculating money and challenge state on the website, limiting elapsed time to website-observed wall time, enforcing paid-player caps and campaign deductions atomically, recording nonce history, bounding activity values, providing player reports, tracking trust state, and allowing administrators to pause or blacklist a server. Production fraud controls should also compare server behavior over time and send high-risk cases to human review.

## Resource and memory controls

- Bounded batches are sent per heartbeat cycle instead of one request per player; populations over 200 are split into sequential chunks.
- Heartbeat batches contain at most 250 unique players and 256 KiB of JSON.
- Other plugin requests are capped at 64 KiB.
- Java HTTP responses are capped before full allocation.
- Network work runs asynchronously and Bukkit calls return to the server thread.
- In-flight request guards, cooldowns, finite timeouts, counter clamps, expired-challenge cleanup, and plugin shutdown cleanup prevent unbounded queues and stale references.
- Repeated network errors are throttled instead of printed on every tick.

## Content and command safety

- Region and Minecraft version use controlled values; a listing stores minimum and maximum supported versions.
- Profile and gallery images must be uploaded. Remote media URLs are rejected to prevent third-party tracking, unsafe content embedding, and protocol abuse.
- Uploaded PNG/JPEG files are decoded and re-encoded with metadata removed, pixel and byte limits, and generated local filenames.
- Media uploads have a persistent per-account request throttle and a hard per-account file and storage quota.
- Store commands reject control characters and leading slashes, must include `{player}` or `{uuid}`, and permit only those placeholders.
- Public output is rendered through React escaping and protected by a restrictive Content Security Policy, frame denial, MIME sniffing protection, and a referrer policy.

## If a plugin secret leaks

1. Open Account, then the affected server's Plugin connection panel.
2. Select **Rotate secret**.
3. Put the new one-time value in `plugins/KarixMCBridge/config.yml`.
4. Fully restart Paper. Do not use `/reload`.
5. Confirm Creator Studio shows a fresh policy sync and review integrity failures, rewards, and purchases from the suspected period.

Never put a plugin secret in screenshots, chat messages, source control, support tickets, or client-side JavaScript. Use a separate random `PLUGIN_SECRET_ENCRYPTION_KEY` in production and back it up securely; losing it makes stored plugin credentials unreadable.

## Production requirements

- HTTPS domain, secure cookies, HSTS, and `allow-insecure-http: false` in every plugin.
- PostgreSQL rather than SQLite for concurrent production traffic.
- Reverse-proxy request limits, DDoS protection, firewall rules, monitoring, alerting, encrypted backups, and tested restores.
- Separate least-privilege services and secrets, key rotation, dependency scanning, and a documented incident-response owner.
- Legal review of the privacy policy, consent flow, payments, retention periods, and the rules of every launch region.

## Reporting a vulnerability

Send a private report to the security contact configured for the deployment. Include the affected URL or plugin version, reproduction steps, impact, and relevant logs with secrets and personal data removed. Do not test against other users' accounts or disrupt a live server.

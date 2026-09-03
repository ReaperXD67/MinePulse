# KarixMC security audit — 2026-09-03

## Executive summary

The public-beta application and the three official Minecraft showcase servers were reviewed in the local repository and on the production VPS at `169.58.213.35`. The review found and resolved one critical authorization exposure, several high-impact web and secret-management weaknesses, vulnerable dependencies, ambiguous Minecraft registration guidance, and a concurrent reward-processing edge case.

The website and all three Minecraft servers are healthy after deployment. The automated auth, security-boundary, marketplace, purchase, server-removal, fleet-policy, reward-heartbeat, and showcase audits pass. `npm audit` reports zero known vulnerabilities in both the production and full dependency trees.

Broad public promotion should still wait for three external controls: verified transactional email, mandatory administrator MFA, and off-site backup/alert destinations. Minecraft TCP DDoS coverage must also be confirmed with the VPS provider or added through a Minecraft-aware proxy. These open controls are described below and remain enforced by the production validation gate where applicable.

## Scope and method

- Reviewed the Next.js application, authentication/session handling, state-changing API routes, plugin HMAC authentication, rewards, marketplace ownership controls, deployment scripts, Nginx configuration, Docker boundaries, and dependency tree.
- Inspected the live VPS network exposure, SSH policy, service health, AuthMe policy, shared registration database, Minecraft operator lists, official showcase records, and public HTTP response headers.
- Exercised production data through cleanup-safe audit scripts using an isolated application container. The public application replicas stayed behind HTTPS with secure cookies throughout testing.
- No secret values, password hashes, TOTP seeds, or encryption keys are included in this report.

## Resolved findings

### KARIX-SEC-001 — Unregistered offline-mode name had operator privileges

- **Severity:** Critical
- **Status:** Resolved in production
- **Location:** Live `ops.json` on Skyforge; continuous guard in `deploy/scripts/monitor-showcase.sh:53`
- **Evidence:** `KarixAI` had level-4 operator access on Skyforge while the shared AuthMe database had zero registrations for that name. Because the showcase intentionally supports non-premium/offline clients, a first-time player could have registered that name and inherited its operator rights.
- **Impact:** A remote player could have gained full Minecraft administrative commands, damaged worlds, changed permissions, or interfered with other players.
- **Fix:** Removed `KarixAI` from every server's operator list. All three live `ops.json` files now contain zero operators. The showcase monitor now fails if any operator name is malformed or is not already present in the shared AuthMe database.
- **Mitigation:** Do not grant operator status until the intended player has joined and registered the exact name. Prefer a least-privilege permissions plugin instead of permanent level-4 operator access.
- **False-positive notes:** None. Both the operator entry and missing AuthMe registration were confirmed directly before remediation.

### KARIX-SEC-002 — Client IP throttling trusted spoofable proxy headers

- **Severity:** High
- **Status:** Resolved
- **Location:** `lib/auth.ts:87`; `deploy/nginx/karixmc.conf.template:53`
- **Evidence:** Authentication throttling previously accepted `CF-Connecting-IP` and `X-Forwarded-For`. The domain points directly to the VPS and Cloudflare is not the trusted ingress, so a client could supply those values.
- **Impact:** An attacker could rotate a fake header value to weaken login and registration rate limits.
- **Fix:** The application now accepts only `X-Real-IP`. Nginx overwrites that value from the TCP peer address and explicitly removes any inbound `CF-Connecting-IP` value before proxying.
- **Mitigation:** Nginx request limits and database-backed authentication throttles remain layered in front of account endpoints.
- **False-positive notes:** This would have been safe only behind a correctly configured trusted proxy that always stripped inbound forwarding headers; that was not the live topology.

### KARIX-SEC-003 — Cookie-authenticated API mutations lacked a central origin guard

- **Severity:** High
- **Status:** Resolved
- **Location:** `proxy.ts:23`
- **Evidence:** Individual state-changing routes relied mainly on `SameSite=Lax` cookies and did not share a consistent Origin/Fetch-Metadata check.
- **Impact:** Browser behavior, future cookie changes, or same-site attacker content could have exposed mutation endpoints to cross-site request forgery.
- **Fix:** A Next.js Proxy now rejects unsafe cross-site API requests using `Sec-Fetch-Site`, `Origin`, and `Referer` against the configured public origin. HMAC-authenticated `/api/plugin/*` routes remain compatible with Minecraft plugins.
- **Mitigation:** Session cookies remain `HttpOnly`, `Secure` in production, and `SameSite=Lax`; unsafe endpoints still enforce authorization and input validation.
- **False-positive notes:** Modern browsers already reduce this risk with `SameSite=Lax`, but that is a mitigation rather than a complete server-side policy.

### KARIX-SEC-004 — Known vulnerable dependency versions

- **Severity:** High
- **Status:** Resolved
- **Location:** `package.json`; `package-lock.json`
- **Evidence:** The pre-fix dependency tree reported eight high-severity findings, six of them in the production tree.
- **Impact:** Known issues in framework and transitive packages could affect request processing or build/runtime safety.
- **Fix:** Updated Next.js, React, Prisma, and related packages and pinned patched transitive versions for Browserslist, deepmerge-ts, fast-uri, js-yaml, mysql2, and nanoid.
- **Mitigation:** Both `npm audit --omit=dev` and the full `npm audit` now report zero known vulnerabilities. The production Docker build also completed with the patched lockfile.
- **False-positive notes:** Package advisories do not always imply a reachable exploit, but reachable-code analysis was not needed because patched compatible versions were available.

### KARIX-SEC-005 — Predictable production encryption-key placeholders

- **Severity:** High
- **Status:** Resolved in production
- **Location:** Production environment; rotation tooling in `deploy/scripts/rotate-encryption-keys.sh:87` and `scripts/rotate-encryption-keys.ts:81`
- **Evidence:** The production validator identified placeholder plugin-secret and administrator-MFA encryption keys.
- **Impact:** A database disclosure combined with a predictable key could expose plugin credentials and allow server impersonation. Future administrator TOTP data would also have been inadequately protected.
- **Fix:** Generated independent cryptographically random keys, transactionally re-encrypted all five stored plugin credentials, atomically installed the environment, and health-checked both replicas. No legacy plaintext plugin credentials remain.
- **Mitigation:** The rotation script uses root-only temporary material, avoids secret values in command arguments and logs, and includes rollback handling.
- **False-positive notes:** The placeholder detection and five encrypted records were verified directly. No administrator TOTP record existed to re-encrypt.

### KARIX-SEC-006 — Public account links could fall back to request-controlled host data

- **Severity:** Medium
- **Status:** Resolved
- **Location:** `lib/url.ts:4`
- **Evidence:** Password-reset and email-verification link construction could fall back to request Origin/Host information when the configured public URL was absent.
- **Impact:** A deployment mistake could allow host-header poisoning of security links sent to users.
- **Fix:** Production link generation now requires a valid configured `APP_BASE_URL`, permits only HTTP(S) origins without credentials, and fails closed instead of trusting the request host.
- **Mitigation:** Nginx also routes only the configured domain and the live environment already has a canonical HTTPS URL.
- **False-positive notes:** The live `APP_BASE_URL` was valid, so this was a dangerous fallback rather than a confirmed live exploit.

### KARIX-SEC-007 — Script policy allowed inline JavaScript

- **Severity:** Medium
- **Status:** Resolved
- **Location:** `proxy.ts:53`; `next.config.ts:25`
- **Evidence:** The earlier static Content Security Policy allowed inline scripts.
- **Impact:** A future HTML injection defect would have had fewer browser-side restrictions against executing JavaScript.
- **Fix:** Each request now receives a random CSP nonce and `script-src` uses that nonce with `strict-dynamic`. Production no longer includes `unsafe-inline` or `unsafe-eval` in `script-src`.
- **Mitigation:** Framing, object embedding, base URLs, forms, images, connections, and other resource classes remain restricted. `style-src 'unsafe-inline'` remains because the current React UI uses inline style properties; it does not allow script execution.
- **False-positive notes:** CSP is defense in depth, not a replacement for output encoding and safe React rendering.

### KARIX-SEC-008 — API request-size limits were broader than necessary

- **Severity:** Medium
- **Status:** Resolved
- **Location:** `proxy.ts:40`; `deploy/nginx/karixmc.conf.template:38`
- **Evidence:** General requests inherited an 8 MiB allowance even though almost every JSON API accepts small payloads.
- **Impact:** Oversized requests could consume unnecessary network, memory, and parsing capacity during abuse.
- **Fix:** General Nginx requests are capped at 512 KiB, ordinary API bodies at 64 KiB, heartbeat batches at 256 KiB, and the validated image-upload route at 5 MiB.
- **Mitigation:** Existing route schemas, image decoding limits, and Nginx rate limits remain in place.
- **False-positive notes:** This was primarily resource-exhaustion hardening; no outage caused by oversized bodies was observed.

### KARIX-SEC-009 — Reward heartbeats had a concurrent duplicate-processing edge case

- **Severity:** Medium
- **Status:** Resolved in production
- **Location:** `app/api/plugin/heartbeat/route.ts:105` and `app/api/plugin/heartbeat/route.ts:230`
- **Evidence:** Two simultaneous signed heartbeat requests credited points only once, but both returned HTTP 200 and one initially reported a stale balance. The behavior also allowed duplicate activity/stat processing.
- **Impact:** It did not double-pay in the reproduced case, but inconsistent responses and duplicate metrics could confuse plugins and weaken future reward invariants.
- **Fix:** Heartbeats are serialized per player with a transaction-scoped PostgreSQL advisory lock, wallet data is refreshed inside the transaction, and sub-second duplicate bursts are rejected with HTTP 409.
- **Mitigation:** Persistent nonce replay rejection, server-authoritative elapsed time, atomic point-pool decrement, one-server reward leases, and plugin rate limits remain active.
- **False-positive notes:** The original credit remained atomic; the defect was confirmed in response and processing semantics rather than as a demonstrated double-credit.

### KARIX-OPS-001 — Minecraft registration error did not explain the policy

- **Severity:** Informational / product reliability
- **Status:** Resolved in production
- **Location:** `deploy/scripts/install-showcase.sh:236`; server guidance in `app/servers/[slug]/page.tsx:114`
- **Evidence:** AuthMe rejected five- and six-character passwords with only “too short or too long,” and shared registration made separate worlds look related.
- **Impact:** Testers could not tell the accepted range or whether they should register again, reducing successful onboarding.
- **Fix:** All worlds now display the exact 10–64 character requirement, the registration command, and the shared-login rule. Server pages show the exact address and explain that users register once, then use `/login` on the other worlds.
- **Mitigation:** AuthMe remains configured for BCRYPT with cost 12, 10–64 character passwords, three registrations per IP, one active session, and movement/chat restrictions before login.
- **False-positive notes:** `karixmc.pl` is shorthand for `karixmc.pl:25565`; those two addresses are expected to be the same endpoint. Ports `25566` and `25567` are distinct worlds even though authentication is shared.

## Open launch controls

### KARIX-OPEN-001 — Administrator MFA is not enabled

- **Severity:** High
- **Status:** Open; production validation blocks a clean release
- **Location:** `scripts/validate-production-env.ts:71`; current administrator account state
- **Evidence:** `karixai@proton.me` is an administrator but has no enrolled TOTP credential, and `ADMIN_2FA_REQUIRED` is not enabled.
- **Impact:** A stolen administrator password would be sufficient to enter the admin account.
- **Required fix:** The account owner must enroll a TOTP authenticator interactively. After successful recovery-code storage and login verification, set `ADMIN_2FA_REQUIRED=true` and rerun the production validator.
- **Mitigation:** Strong password hashing, throttling, revocable database sessions, HTTPS-only cookies, and the newly corrected IP handling remain active.
- **False-positive notes:** Confirmed production state; code alone cannot safely enroll a human's authenticator.

### KARIX-OPEN-002 — Transactional email and verification enforcement are not configured

- **Severity:** High
- **Status:** Open; production validation blocks a clean release
- **Location:** `scripts/validate-production-env.ts:49`
- **Evidence:** `EMAIL_REQUIRED` is false and `SMTP_URL` is absent.
- **Impact:** Public users cannot rely on production-grade email verification or password recovery delivery, and disposable/unverified accounts are easier to create.
- **Required fix:** Configure a verified sending domain and authenticated SMTP provider, set `EMAIL_FROM`, test delivery and recovery, then set `EMAIL_REQUIRED=true`.
- **Mitigation:** The existing account token implementation uses hashed, expiring, one-time tokens; it becomes effective once delivery is configured.
- **False-positive notes:** Confirmed by the production validation gate.

### KARIX-OPEN-003 — Backups and alerts have no off-site destination

- **Severity:** Medium
- **Status:** Open
- **Location:** `scripts/validate-production-env.ts:76`
- **Evidence:** `BACKUP_REMOTE` and `ALERT_WEBHOOK_URL` are unset. A fresh encrypted local backup exists on the VPS, but it shares the VPS failure domain.
- **Impact:** Total VPS loss could remove both the live system and local backups; service failures may go unnoticed.
- **Required fix:** Configure an rclone-compatible remote and a monitored alert webhook, then run and restore-test an off-site backup.
- **Mitigation:** The local encrypted backup created before this deployment contains PostgreSQL, media, shared AuthMe data, and all three worlds.
- **False-positive notes:** The local backup is real and encrypted; the weakness is the lack of a separate failure domain.

### KARIX-OPEN-004 — Raw Minecraft ports need provider-level DDoS confirmation

- **Severity:** Medium
- **Status:** Open / provider-dependent
- **Location:** Public TCP ports `25565`–`25567`
- **Evidence:** Website traffic receives Nginx-level controls, but Minecraft protocol traffic connects directly to the VPS. A web CDN or WAF does not automatically protect arbitrary Minecraft TCP traffic.
- **Impact:** A volumetric or protocol-aware attack could make the game servers unreachable or saturate the VPS uplink.
- **Required fix:** Obtain written confirmation of protected capacity and attack filtering from the VPS provider, or place the game ports behind a reputable Minecraft-aware protected proxy. Preserve plugin authentication and restrict origin ports if a proxy is added.
- **Mitigation:** UFW exposes only SSH, HTTP(S), and the three required Minecraft ports; databases, Redis, RCON, and application ports are private or loopback-only.
- **False-positive notes:** Provider network mitigation cannot be proven from inside the VPS.

### KARIX-OPEN-005 — Offline-mode identity is first-registration ownership

- **Severity:** Medium
- **Status:** Accepted beta risk; requires policy decision before full launch
- **Location:** AuthMe-enabled official showcase servers
- **Evidence:** Non-premium support means the server cannot use Mojang authentication to prove ownership of a Java username. AuthMe protects a name after first registration, but the first registrant can claim an unregistered name.
- **Impact:** Username squatting or impersonation is possible before the legitimate player registers. The removed operator exposure demonstrated why no privilege may be attached to an unregistered offline name.
- **Required fix:** Keep privileged names unprivileged until verified and registered. Before full launch, decide whether to retain this beta trade-off, add a carefully tested premium-account bridge, or move to authenticated online mode.
- **Mitigation:** Shared BCRYPT registration, single-session enforcement, login gates, and the new registered-operator monitor reduce account takeover and privilege escalation after registration.
- **False-positive notes:** This is an inherent consequence of the requested non-premium compatibility, not an AuthMe implementation bug.

## Verification record

- Local: ESLint passed; Next.js 16.3.4 production build and TypeScript checks passed; `git diff --check` passed.
- Dependencies: full and production-only `npm audit` both returned zero known vulnerabilities from the current lockfile.
- Production HTTP: HTTPS returned 200; both application replicas returned ready status 200; cross-site mutation returned 403; same-origin mutation returned 200; oversized ordinary API body returned 413; CSP contained a per-request nonce and no inline/eval script allowance.
- Production application audits: auth, security boundaries, marketplace guardrails, premium order, server removal, admin fleet policy, and plugin heartbeat all passed.
- Showcase: three distinct funded official servers and six safe store items passed the application audit; the server monitor passed.
- AuthMe: Skyforge, Ember, and Voidcraft each report minimum length 10, maximum length 64, BCRYPT, the exact corrected password message, and zero operator entries.
- Deployment: a fresh encrypted backup was created before rollout at `/var/backups/karixmc/karixmc-20260903T084834Z.tar.gz.age`; both application replicas and all showcase services were healthy after rollout.

## Retest requirements

Run the production validator, SMTP delivery check, administrator login/MFA check, off-site restore test, and DDoS-provider confirmation before declaring the product ready for a broad advertising campaign. Re-run the automated security and showcase audits after any authentication, rewards, reverse-proxy, or plugin change.

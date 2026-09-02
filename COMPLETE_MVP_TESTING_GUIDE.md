# KarixMC Complete MVP Testing Guide

Use this document to test the website and KarixMCBridge 0.6.5 before connecting a production domain. Record the tester, date, account, Minecraft name, expected result, actual result, screenshot, and Paper log excerpt for every failed case.

## Test Environment

| Component | Test value |
| --- | --- |
| Website | `https://karixmc.pl` |
| Plugin download | `https://karixmc.pl/downloads/KarixMCBridge-0.6.5.jar` |
| Minecraft software | Paper or Purpur 1.20.x/1.21.x |
| Java | Java 17 or newer; Java 21 recommended |
| Website accounts | One separate account per tester |
| Minecraft server | A separate test server; never install Minecraft on the website VPS |

Do not test real payments. Campaign credits and premium are admin-granted during this beta. The removed crypto checkout was only a mock and is not an accepted feature.

## 1. Website Health And Navigation

1. Open `/`, `/signup`, `/login`, `/plugin`, `/privacy`, and one server profile on desktop and mobile.
2. Open browser developer tools and check Console and Network.
3. Navigate using the top menu, browser back/forward, and keyboard Tab/Enter.

Pass:

- Every route returns a designed page, not unstyled HTML or a Next.js error.
- No horizontal overflow, overlapping controls, failed JavaScript chunks, or console errors appear.
- Keyboard focus is visible and controls have understandable accessible names.

## 2. Registration, Login, Logout, And Sessions

1. Create Tester A at `/signup` with a unique email, username, and strong password.
2. Attempt the same email and username again.
3. Try an incorrect password, then the correct password.
4. Open the account in a second browser/private window.
5. In Account Security, revoke the second session.
6. Change the password to a new password of at least 15 characters.
7. Verify every other session is revoked, then log out and log in with the new password.

Pass:

- Duplicate accounts and wrong passwords are rejected without revealing sensitive account details.
- Each browser has its own session; revocation takes effect on the revoked browser.
- Password change invalidates other sessions, old credentials fail, and logout returns to the public site.

## 3. Profile, Privacy, And Media

1. Update display name, profile text, Discord value, and friend privacy.
2. Upload a valid JPEG, PNG, or WebP avatar.
3. Try an unsupported file, oversized image, and suspicious URL/text input.
4. Replace the avatar and verify the old managed file is no longer used.
5. Open the public member profile in a signed-out browser.

Pass:

- Valid profile changes appear immediately and persist after reload.
- Images are validated, resized/compressed, and served from KarixMC-managed media paths.
- Invalid files and unsafe external media values are rejected.
- Friend privacy prevents new friend additions when enabled.

## 4. Daily Claim And Levels

1. Record wallet balance and point-ledger count.
2. Claim the 20-hour reward once.
3. Confirm the wallet and ledger increase by a value from 1,000 through 5,000.
4. Try to claim again immediately.
5. For an admin-assisted test, move lifetime verified earnings across 1,000 and then 3,000 points.

Pass:

- The first claim succeeds and the second returns a cooldown with the next claim time.
- Level 1 unlocks at 1,000 lifetime verified points with a 500-point bonus.
- Level 2 unlocks at 3,000 lifetime verified points with a 1,000-point bonus.
- A level reward is granted once only and has a matching ledger entry.

## 5. Creator Studio: Publish And Edit A Server

1. Sign in with the server-owner account and publish a unique host and port.
2. Use a version range, controlled region, 1-10 tags, description, rules, banner, and up to five gallery images.
3. Try bad versions, more than 10 tags, duplicate host/port, unsafe links, and oversized media.
4. Save profile changes, including reward rates `1`, `1.5`, `2`, `2.5`, and `3`.
5. Try `1.2`, `0`, and a rate above `3`.
6. Reload the account and public profile.

Pass:

- Valid changes persist and appear without a manual refresh.
- Region and versions use controlled values; duplicate addresses and unsafe data are rejected.
- Only 0.5 reward steps from 1 through 3 are accepted.
- Media limits are one avatar, one server banner, and five gallery images.

## 6. Remove And Recreate A Listing

1. Click **Remove listing** once.
2. Confirm that the button changes to **Confirm removal** and a Cancel action appears.
3. Click Cancel and verify nothing is removed.
4. Arm removal again, then click **Confirm removal**.
5. Wait 15 seconds, refresh the page, and search the public directory.
6. Publish the same host/port again from the same trusted owner account.
7. Compare the old and new server IDs, plugin secrets, shop, pool, likes, favorites, reviews, and sessions.

Pass:

- The first click never silently deletes the server.
- Confirmed removal hides it from Creator Studio and the marketplace permanently across polling and reloads.
- Plugin requests cannot reactivate a removed listing.
- The removed record remains archived for audit history.
- Republishing creates a new server ID and private secret with an empty shop, zero pool, zero social reactions, and no inherited sessions or reviews.
- The new `config.yml` replaces the old server ID and secret in Paper before reconnecting the plugin.

## 7. Plugin Installation And Connection

1. Stop Paper and ensure only one KarixMC bridge JAR is in `plugins/`.
2. Install `KarixMCBridge-0.6.5.jar`.
3. In Creator Studio, rotate the plugin secret if the current secret is unknown.
4. Download the complete `config.yml` and put it at `plugins/KarixMCBridge/config.yml`.
5. For the current HTTP beta, the file must contain:

```yaml
api-base-url: "https://karixmc.pl"
server-id: "THE_SERVER_ID_FROM_CREATOR_STUDIO"
plugin-secret: "THE_PRIVATE_ONE_TIME_SECRET"
allow-insecure-http: false
```

6. Fully restart Paper. Do not use `/reload`.
7. Run `/plugins` and `/karixmc help`.

Pass:

- KarixMCBridge is green and there is no stack trace.
- The console shows temporary HTTP beta mode and a successful policy sync, not a configuration error.
- Creator Studio shows the plugin version and recent config sync.
- Port 443 is automatic for HTTPS; `:3000`, `/api`, `/plugin`, and `/account` are not present in the API URL.

## 8. Campaign Credits And Directory Eligibility

1. As admin, search the owner and grant a test campaign amount with a reason.
2. Confirm the selected server pool increases by exactly that amount.
3. Run `/pool` in Minecraft.
4. Reduce the pool to zero in a controlled test, then fund it again.
5. Stop Paper for more than two minutes, then restart it.

Pass:

- Campaign credits affect only the selected server pool, never the owner's spendable wallet.
- A zero-pool, removed, paused, blacklisted, or offline server does not appear in the public directory.
- Funding and a fresh bridge signal make an eligible active server visible again.

## 9. Minecraft Account Linking And Consent

1. Generate a ten-minute link code from Tester A's website account.
2. Join using Tester A's Minecraft account and run `/karixmc link <code>`.
3. Reuse the code and try an expired or incorrect code.
4. Run `/karixmc privacy`, then `/karixmc forget`.
5. On the website, use **Account -> Minecraft identity -> Unlink Minecraft**, then confirm the unlink.
6. As admin, search a test account under **Admin -> Server grants** and test **Reset Minecraft link**.
7. Create a new code on a different website test account and link again.

Pass:

- A valid code links the correct UUID once; reused, expired, and wrong codes fail.
- Unlinked/forgotten players continue playing Minecraft but send no reward heartbeats and earn nothing.
- Self-unlink and admin reset close active reward sessions and invalidate pending link codes before the UUID can move to another account.
- The plugin does not collect or transmit player IP addresses.

## 10. Verified Play And Fractional Rewards

1. Record `/points`, `/pool`, website wallet, and ledger values.
2. Set reward rate to `1`, play actively for at least two heartbeat intervals, and record changes.
3. Repeat at `1.5`, `2`, `2.5`, and `3` points per second.
4. Compare wallet increase against campaign-pool decrease.

Pass:

- Only linked, active, eligible players earn.
- Wallet increase equals campaign-pool deduction for every accepted reward batch.
- Fractional rates carry fractions across heartbeats instead of losing or inventing points.
- Session earned resets for a later session; lifetime verified play and wallet do not reset.

## 11. Every Reward Pause Reason

Test each state separately and record its Minecraft message:

| State | How to trigger | Expected result |
| --- | --- | --- |
| Account not linked | Join with an unlinked account | Zero reward; link instruction |
| Empty pool | Set campaign pool to zero | Zero reward; funding message |
| AFK | No movement or interaction past timeout | Zero reward; AFK message |
| Inactive | Fail configured movement/interaction minimum | Zero reward; activity message |
| Activity check | Wait for a required challenge | Zero until correct `/answer` |
| Paid cap | Join beyond the paid-player limit | Zero reward; paid-cap message |
| Paused/removed/blacklisted | Apply owner/admin state | Requests rejected and no reward |
| Invalid credentials | Change one character of the secret | Signed API requests rejected |

Pass: every pause state awards exactly zero points, explains why at a bounded frequency, and resumes only after the condition is fixed.

## 12. AFK And Arithmetic Challenge

1. Temporarily set AFK timeout and challenge interval to 60 seconds.
2. Verify normal movement, chat, commands, inventory use, and interaction count as configured activity.
3. Remain inactive through the timeout.
4. Wait for a question, submit a wrong answer, then `/answer <correct-value>`.

Pass:

- Idle time is not paid and the player sees a pause message.
- Wrong or late answers do not resume rewards.
- A correct answer resumes eligibility on a later valid heartbeat.
- Policy changes sync without restarting Paper.

## 13. Paid-Player Cap

1. Set the paid cap to `1`.
2. Join with two linked active players.
3. Verify one receives rewards and the other receives the paid-cap message.
4. Disconnect the rewarded player and wait for the session to become stale.

Pass: the waiting player can take the released slot; nobody above the cap is paid, and all players can still play normally.

## 14. Store Item And Rank Delivery

1. Create a cheap online test item with `give {player} diamond 1` and no leading slash.
2. Create a rank test command compatible with the server's permission plugin.
3. Buy while online and verify wallet deduction plus console-command delivery.
4. Buy an online-required item while offline, then join and run `/receive`.
5. Test `{uuid}`, an invalid command, repeated polling, and repeated acknowledgement.

Pass:

- A purchase deducts wallet points once only.
- The plugin delivers each purchase once only, even after retries or restart.
- Online-required purchases wait safely; `/receive` retries them.
- Failed delivery is acknowledged and refunded according to the current failure path.

## 15. Directory, Likes, Favorites, Reviews, Search, And Ranking

1. Search by server name, host, address, version, region, tag, item name, and item description.
2. Filter by tag and Favorites, then reset filters.
3. Like and favorite a server; toggle each again.
4. Attempt a review before and after the configured verified-play requirement.
5. Refresh repeatedly with Diamond, Gold, and standard servers available.

Pass:

- Search/filter results are correct and favorites persist per account.
- A user can have only one like and one favorite per server.
- Reviews are blocked until enough verified play exists.
- Across many refreshes, the first-position lanes approach Diamond 45%, Gold 35%, and standard 20%; one refresh is not proof of the percentage.
- Likes add at most 30 visibility weight, favorites 40, and comments 10, preventing unlimited popularity dominance.

## 16. Friends And Presence Privacy

1. Add a tester by exact display name, Minecraft name, and email.
2. Verify the friend appears without manual refresh.
3. Confirm online server/last-seen information while the friend permits it.
4. Enable privacy on the target profile and try a new friend addition.
5. Remove the friend.

Pass: exact matching works, privacy is enforced server-side, and add/remove changes persist after reload.

## 17. Support And Reports

1. From a server profile, submit a support request.
2. Confirm it appears in the requester account and owner Creator Studio inbox.
3. Have the owner mark it In progress, add a note, and close it.
4. Submit one report for each reason, including a safe evidence URL.
5. Resolve reports as admin with pause, blacklist, removal, or restoration where appropriate.

Pass:

- Support and report text/URLs are validated.
- Tickets stay associated with the correct requester and server.
- Admin action updates trust/listing state and preserves an enforcement audit record.

## 18. Gold, Diamond, Expiry, And Admin Control

1. Admin-grant Gold for a short test duration, then Diamond.
2. Verify the correct border, badge, expiry, and directory lane.
3. Verify expired premium is treated as standard and displays no active premium styling.
4. Test admin server search, tag/state filters, pagination, pause, blacklist, remove, restore, pool adjustment, and protection-policy sync.
5. Test account/user filters, creation date, buyer activity, purchase amount, wallet grant, and campaign grant audit reason.

Pass:

- Premium never remains active after expiry.
- Admin changes affect the selected server/user only and are recorded.
- A non-admin receives 403/redirect protection for admin routes and APIs.

## 19. Security And Abuse Tests

1. Rotate a plugin secret and verify the old secret fails immediately.
2. Replay an identical signed request and alter its body after signing.
3. Try another owner's server ID/secret operations.
4. Submit duplicate addresses, unsafe image URLs, unsafe commands, oversized bodies, and rapid login attempts.
5. Verify server time is synchronized with NTP.

Pass:

- Invalid signatures, stale timestamps, reused nonces, tampered bodies, and cross-owner access are rejected.
- Secrets are shown only once, stored protected, and never printed in normal logs or API responses.
- Rate limits and input boundaries fail safely without crashing Minecraft or the website.

## 20. Recovery, Backups, And Deployment

1. Record the current release symlink, database size, and media count.
2. Create a consistent SQLite backup before any schema/data migration.
3. Deploy a release and verify systemd, `/`, `/plugin`, API health, login, and the JAR checksum.
4. Simulate a failed health check in a controlled environment and verify rollback to the previous release.
5. Restore a copied database in staging and verify account/server counts.

Pass:

- Code releases are atomic and the previous release remains available for rollback.
- Database and uploaded media live outside release directories and are not replaced by code deployment.
- Normal deployments never reset the database. Use targeted unlink, listing removal/recreation, or admin moderation controls for test cleanup.
- A current backup exists and a restore has been tested, not merely assumed.

## Automated Regression Commands

Run these against a local production build before every deployment:

```powershell
npm.cmd run build
npm.cmd run start -- -p 3001
```

In a second terminal:

```powershell
npm.cmd run test:auth
npm.cmd run test:security-boundaries
npm.cmd run test:plugin-heartbeat
npm.cmd run test:owner-live-state
npm.cmd run test:server-removal
npm.cmd run test:minecraft-unlink
npm.cmd run test:admin-campaign-grant
npm.cmd run test:admin-fleet
npm.cmd run test:premium-order
node scripts/ui-audit.mjs
```

These scripts use local seeded audit accounts. Human VPS testers should create separate accounts and must never share one login.

## Controlled-Beta Acceptance Gate

The controlled beta passes only when:

- every automated command passes;
- all website and real-Minecraft checks above have evidence;
- there are no unexplained browser errors or Paper exceptions;
- wallet credits equal campaign deductions;
- AFK, challenge, cap, replay, and duplicate-delivery tests award no unauthorized points;
- a backup and restore drill has succeeded.

Before public production, add a domain with HTTPS, managed PostgreSQL, scheduled encrypted off-site backups, monitoring/alerts, password reset and email verification, a selected payment provider with signed webhooks/refunds, stronger admin authentication, load testing, and final legal/compliance review.

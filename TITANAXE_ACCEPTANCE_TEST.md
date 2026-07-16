# KarixMC Titanaxe Acceptance Test

Use this checklist before connecting a production domain or enabling real payments.

## Current Test Targets

| Purpose | Value |
| --- | --- |
| Website | `http://51.83.180.202:3000` |
| Minecraft join address | `s130.titanaxe.com:27390` |
| KarixMC server name | `test1` |
| Server ID | `cmremn65y00025w9vva8q1kcx` |
| Starting campaign pool | `1,000,000` |
| Reward rate | `1 point per second` |

The plugin secret is intentionally not written in this document. Copy the current value from `Account -> Your servers -> test1 -> Plugin connection`.

## 1. Confirm Server Software

The supported target is Paper 1.20 or 1.21 with Java 17 or newer. The Titanaxe panel currently labels this server as Spigot 1.21.11. The bridge may load because it primarily uses Bukkit APIs, but Spigot is not the verified production target.

1. Start the server and open the Titanaxe console.
2. Run `version` and save the complete output.
3. If KarixMCBridge is disabled, red in `/plugins`, or reports missing API methods, switch the server software to Paper and restart.
4. Do not use `/reload`; use a complete stop and start after changing the jar or configuration.

Pass condition: the console has no KarixMCBridge stack trace and `/plugins` shows `KarixMCBridge` in green.

## 2. Install And Connect The Bridge

1. Download `KarixMCBridge-0.5.1.jar` from the website Plugin page.
2. In Titanaxe, open the server File Manager and upload it to `plugins/`.
3. Start once, wait for startup, then stop the server.
4. Open `plugins/KarixMCBridge/config.yml` and enter exactly:

```yaml
api-base-url: "http://51.83.180.202:3000"
server-id: "cmremn65y00025w9vva8q1kcx"
plugin-secret: "COPY_FROM_TEST1_CREATOR_STUDIO"
```

5. Save and fully restart the server.
6. Check the console for policy-sync or invalid-credential errors.

Do not put the Minecraft join address in `api-base-url`. Do not add `/api`, `/account`, or `/plugin` to the URL.

Pass conditions:

- Creator Studio displays `Plugin reached website`.
- `/karixmc help` works in Minecraft.
- `/pool` displays the `test1` campaign and approximately 1,000,000 credits before rewards begin.

## 3. Link A Real Player

1. Create a separate website account for each tester. Never share one account.
2. Sign in and open `Account -> Minecraft identity`.
3. Generate a ten-minute link command.
4. Join `s130.titanaxe.com:27390` with the intended Minecraft account.
5. Run `/karixmc link <code>` before it expires.
6. Run `/points` and record Wallet, Session earned, and Verified play.

Pass condition: the website profile shows the correct Minecraft name and `/points` no longer reports an unlinked account.

## 4. Verified Reward Accounting

1. Record the website wallet and `/pool` balance.
2. Move normally, chat, use inventory, and interact for at least two minutes.
3. Wait for at least two heartbeat intervals.
4. Run `/points` and `/pool` again.

Expected result at 1 point/second:

- Wallet and Session earned increase by approximately verified active seconds.
- Campaign pool decreases by exactly the points credited to the wallet.
- Creator Studio shows Last player activity and plugin version `0.5.1`.

Rewards arrive in heartbeat batches, so a small delay is normal.

## 5. AFK And Activity Protection

For a faster test, set AFK timeout to 60 seconds in Creator Studio and save the policy.

1. Confirm active play is earning.
2. Stop moving, chatting, using commands, and interacting for more than 60 seconds plus one heartbeat.
3. Confirm the plugin displays an AFK or inactivity pause message.
4. Run `/points`; Session earned must not increase during the paused interval.
5. Move and interact again; earning should resume after the next heartbeat.

Looking around without changing position is not meaningful movement.

## 6. Arithmetic Challenge

1. Enable challenges and set the interval to 60 seconds for testing.
2. Wait for a question such as `How much is 2 + 3?`.
3. Submit one incorrect answer and confirm rewards remain paused.
4. Run `/answer 5` with the correct value.
5. Confirm the success message and resumed rewards.

Restore the intended production interval after the test.

## 7. Unlinked Player And Paid Cap

1. Join with an unlinked Minecraft account. It must receive no wallet rewards.
2. Link at least two tester accounts.
3. Temporarily set Max paid players to 1.
4. Join both accounts and verify only the eligible paid slot receives rewards; the other receives a paid-cap message.
5. Restore the intended cap after testing.

## 8. Store Purchase Delivery

Owner setup:

1. Create a 10-point online item in Creator Studio.
2. Use console command `give {player} diamond 1` without a leading slash.

Player test:

1. Stay online on `test1` and buy the item from its website profile.
2. Confirm the wallet decreases by 10 and one diamond arrives.
3. If delivery is delayed, run `/receive`.
4. Test one intentionally invalid command and confirm the failed purchase refunds the wallet.

## 9. Admin Campaign Grant

1. Sign in as an administrator and open `/admin#campaign-grant`.
2. Search the owner by email, website username, or Minecraft name.
3. Select `test1`, enter a small amount and a clear reason, then send.
4. Confirm Creator Studio and `/pool` both increase by the same amount.
5. Confirm Recent money events contains the admin adjustment.

This grants campaign credits only. It does not increase the recipient's spendable player wallet.

## 10. Security And Failure Tests

1. Copy the current plugin secret somewhere secure, then rotate it in Creator Studio.
2. Confirm the old plugin configuration receives invalid-credential errors.
3. Put the new secret in `config.yml` and restart; connection must recover.
4. Stop the website briefly or use an invalid URL in a controlled test. The Minecraft server must remain playable and log bridge errors without crashing.
5. Restore the valid URL and confirm policy sync and heartbeats recover.

## Acceptance Record

- [ ] Paper/Spigot compatibility verified with no plugin errors
- [ ] Plugin reached website
- [ ] Real player linked
- [ ] Active rewards balanced wallet against campaign deduction
- [ ] AFK interval awarded zero
- [ ] Arithmetic challenge paused and resumed rewards
- [ ] Unlinked player awarded zero
- [ ] Paid-player cap enforced
- [ ] Store command delivered and failure refunded
- [ ] Admin campaign grant reached the correct server
- [ ] Secret rotation invalidated old credentials
- [ ] Website and Minecraft server recovered after a connection failure

## Public Production Blockers

Passing this checklist makes the gameplay MVP ready for a controlled beta. Before accepting public users or real money, KarixMC still needs:

1. Production domain and HTTPS with secure cookies.
2. Managed PostgreSQL instead of the temporary SQLite database.
3. Automated encrypted backups and a tested restore procedure.
4. Final payment-provider decision, merchant verification, refunds, and signed webhook test.
5. Email verification, password reset, abuse/rate limiting, and stronger admin authentication.
6. Error monitoring, uptime alerts, security logs, and capacity/load tests.
7. Terms, privacy, refund, tax, sanctions, and regional compliance review.

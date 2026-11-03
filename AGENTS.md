# KarixMC project instructions

## Standing release preference

For requested website updates, the user wants the work completed through verification, scoped Git commits, pushing to `origin/main`, and deployment using the existing setup. Continue without asking the user to supply the setup or approve the same routine release again. Respect explicit requests for review, planning, drafts, or local-only work.

This preference covers the requested changes and relevant tested fixes. It does not authorize unrelated changes, spending, external account setup, messages, destructive operations, or changes to security settings. Preserve unrelated working-tree changes and stage only task-owned files or hunks. Keep the main README and affected project documentation current for significant work.

## Existing deployment setup

Use [the production runbook](PRODUCTION_RUNBOOK.md#beta-rolling-app-updates) for the established rolling app-update procedure. The connection details below were verified during the payment-details release; check the current live state before changing it.

| Item | Existing location |
| --- | --- |
| Public website | `https://karixmc.pl` |
| Git remote | `https://github.com/ReaperXD67/MinePulse.git`, branch `main` |
| VPS SSH target | `root@169.58.213.35` |
| Workstation SSH identity | `%USERPROFILE%\.ssh\karixmc_production` (PowerShell: `$env:USERPROFILE/.ssh/karixmc_production`) |
| Server checkout | `/opt/karixmc`, owned by `karixmc` |
| Private server configuration | `/opt/karixmc/.env.production` |
| Compose definition | `/opt/karixmc/docker-compose.production.yml` |
| App containers | `karixmc-app-1` and `karixmc-app_replica-1` |
| Local readiness | `http://127.0.0.1:3000/api/health/ready` and port `3001` |
| Public readiness | `https://karixmc.pl/api/health/ready` |
| Release backups | `/var/backups/karixmc/` |

Keep credential values in their existing private files. Do not print keys, passwords, tokens, SMTP URLs with credentials, or TOTP secrets. Use SSH batch mode and the existing known-host verification. Run repository Git commands as `karixmc` with `sudo -u karixmc` to respect checkout ownership.

## Routine app releases

- For application changes, run `npm run lint`, `npm run build`, and the relevant existing checks before publishing. Documentation-only updates need documentation verification and a scoped push, without rebuilding the running app.
- Inspect the current server checkout and running containers, then fast-forward to the approved pushed commit. Confirm an app-only update has no schema or deployment-configuration changes; handle migrations or configuration changes through their applicable workflow.
- Preserve `.env.production` byte-for-byte, record its checksum, and privately compare its effective configuration with both running replicas before and after release. Adapt to the verified current baseline; do not freeze historical beta flag values into policy.
- Retain fresh encrypted database/media backups and a verified rollback image before building. Derive rollback from the **running container's immutable image ID**: `karixmc-app:latest` can already point at an unactivated build. If the old image is unavailable, recover and verify a rollback copy from the running read-only application before replacing it; exclude mounted data/media and runtime environment secrets from the recovered image.
- Use the existing Compose definition to build `app`. For app-only changes, preserve the database, media, Redis, and existing environment; no migration or database/Redis restart is needed.
- Replace `app_replica` on port `3001` first, then `app` on port `3000`, using `docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-deps SERVICE`. Wait for container health and local readiness after each replacement; restore the saved image if a replacement fails.
- Verify both image IDs, both local readiness checks, public HTTPS readiness, the actual requested behavior, and the unchanged environment before reporting success. Retain release metadata and logs. A successful push or image build alone does not establish a live deployment.
- Upload release scripts as files before executing them on the VPS. Redirect noninteractive commands from `/dev/null` where appropriate so Docker commands cannot consume streamed shell-script input.

There is no configured push-triggered CI deployment. "Automatically deploy" means Codex performs the established SSH/Docker release as part of completing a requested website update.

## Launch readiness and discovery

`npm run production:validate` and `deploy/scripts/deploy.sh` cover the full launch workflow. The existing beta has a separate verified app-only rolling procedure. Pending SMTP/email-verification or administrator-TOTP setup does not require reconfiguring an unchanged beta environment for an ordinary app update. Never change flags, invent credentials, or weaken safeguards to make a validation pass.

If the connection or setup changes, inspect the existing private server configuration, running container metadata, tracked deployment documents, and retained release records first. Ask the user only for genuinely unavailable information or additional authority, rather than asking them to rediscover an existing setup. Keep these instructions and the runbook current when the deployment workflow changes.

ALTER TABLE "ServerSession" ADD COLUMN "lastActivityAt" DATETIME;

-- Existing sessions receive a conservative activity anchor at their latest
-- accepted heartbeat. Future quiet heartbeats do not move this timestamp.
UPDATE "ServerSession"
SET "lastActivityAt" = "lastHeartbeatAt"
WHERE "lastActivityAt" IS NULL;

ALTER TABLE "Server" ADD COLUMN "pluginConfigRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Server" ADD COLUMN "heartbeatIntervalSeconds" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Server" ADD COLUMN "purchasePollSeconds" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Server" ADD COLUMN "afkTimeoutSeconds" INTEGER NOT NULL DEFAULT 300;
ALTER TABLE "Server" ADD COLUMN "challengeEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Server" ADD COLUMN "challengeIntervalSeconds" INTEGER NOT NULL DEFAULT 300;
ALTER TABLE "Server" ADD COLUMN "challengeAnswerWindowSeconds" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "Server" ADD COLUMN "challengeRequired" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Server" ADD COLUMN "minimumMovementDistance" REAL NOT NULL DEFAULT 0.2;
ALTER TABLE "Server" ADD COLUMN "minimumActivityEvents" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Server" ADD COLUMN "lastConfigSyncAt" DATETIME;

ALTER TABLE "ServerSession" ADD COLUMN "challengeId" TEXT;
ALTER TABLE "ServerSession" ADD COLUMN "challengeQuestion" TEXT;
ALTER TABLE "ServerSession" ADD COLUMN "challengeAnswerHash" TEXT;
ALTER TABLE "ServerSession" ADD COLUMN "challengeRequiredAt" DATETIME;
ALTER TABLE "ServerSession" ADD COLUMN "challengeExpiresAt" DATETIME;
ALTER TABLE "ServerSession" ADD COLUMN "challengePassedAt" DATETIME;

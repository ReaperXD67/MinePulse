-- Preserve half-point reward rates such as 1.5 and 2.5.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Server" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 25565,
    "version" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "longDescription" TEXT NOT NULL DEFAULT '',
    "rules" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "bannerImage" TEXT,
    "galleryImages" TEXT NOT NULL DEFAULT '',
    "websiteUrl" TEXT,
    "discordUrl" TEXT,
    "supportUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "trustStatus" TEXT NOT NULL DEFAULT 'VERIFIED',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "pointPool" INTEGER NOT NULL DEFAULT 0,
    "rewardRatePerSecond" REAL NOT NULL DEFAULT 1,
    "maxPaidPlayers" INTEGER NOT NULL DEFAULT 20,
    "minPlaySecondsForComment" INTEGER NOT NULL DEFAULT 1800,
    "premiumPlan" TEXT NOT NULL DEFAULT 'NONE',
    "premiumUntil" DATETIME,
    "pluginSecret" TEXT NOT NULL,
    "botProtectionLevel" INTEGER NOT NULL DEFAULT 2,
    "pluginConfigRevision" INTEGER NOT NULL DEFAULT 1,
    "heartbeatIntervalSeconds" INTEGER NOT NULL DEFAULT 20,
    "purchasePollSeconds" INTEGER NOT NULL DEFAULT 15,
    "afkTimeoutSeconds" INTEGER NOT NULL DEFAULT 300,
    "challengeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "challengeIntervalSeconds" INTEGER NOT NULL DEFAULT 300,
    "challengeAnswerWindowSeconds" INTEGER NOT NULL DEFAULT 90,
    "challengeRequired" BOOLEAN NOT NULL DEFAULT true,
    "minimumMovementDistance" REAL NOT NULL DEFAULT 0.2,
    "minimumActivityEvents" INTEGER NOT NULL DEFAULT 1,
    "lastHeartbeatAt" DATETIME,
    "lastConfigSyncAt" DATETIME,
    "lastPluginVersion" TEXT,
    "integrityFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Server" (
    "afkTimeoutSeconds", "bannerImage", "botProtectionLevel", "challengeAnswerWindowSeconds",
    "challengeEnabled", "challengeIntervalSeconds", "challengeRequired", "createdAt", "description",
    "discordUrl", "galleryImages", "heartbeatIntervalSeconds", "host", "id", "integrityFailures",
    "lastConfigSyncAt", "lastHeartbeatAt", "lastPluginVersion", "longDescription", "maxPaidPlayers",
    "minPlaySecondsForComment", "minimumActivityEvents", "minimumMovementDistance", "name", "ownerId",
    "pluginConfigRevision", "pluginSecret", "pointPool", "port", "premiumPlan", "premiumUntil",
    "purchasePollSeconds", "region", "rewardRatePerSecond", "riskScore", "rules", "slug", "status",
    "supportUrl", "tags", "trustStatus", "updatedAt", "version", "websiteUrl"
)
SELECT
    "afkTimeoutSeconds", "bannerImage", "botProtectionLevel", "challengeAnswerWindowSeconds",
    "challengeEnabled", "challengeIntervalSeconds", "challengeRequired", "createdAt", "description",
    "discordUrl", "galleryImages", "heartbeatIntervalSeconds", "host", "id", "integrityFailures",
    "lastConfigSyncAt", "lastHeartbeatAt", "lastPluginVersion", "longDescription", "maxPaidPlayers",
    "minPlaySecondsForComment", "minimumActivityEvents", "minimumMovementDistance", "name", "ownerId",
    "pluginConfigRevision", "pluginSecret", "pointPool", "port", "premiumPlan", "premiumUntil",
    "purchasePollSeconds", "region", "rewardRatePerSecond", "riskScore", "rules", "slug", "status",
    "supportUrl", "tags", "trustStatus", "updatedAt", "version", "websiteUrl"
FROM "Server";

DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
CREATE UNIQUE INDEX "Server_slug_key" ON "Server"("slug");
CREATE INDEX "Server_status_premiumUntil_idx" ON "Server"("status", "premiumUntil");
CREATE INDEX "Server_trustStatus_status_idx" ON "Server"("trustStatus", "status");
CREATE INDEX "Server_ownerId_idx" ON "Server"("ownerId");
CREATE UNIQUE INDEX "Server_host_port_key" ON "Server"("host", "port");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

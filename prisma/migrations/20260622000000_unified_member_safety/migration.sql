-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "bonusPercent" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "bonusPoints" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromoRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromoRedemption_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServerReport_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerNote" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupportTicket_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportTicket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnforcementAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pointsRemoved" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnforcementAction_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EnforcementAction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BillingLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "serverId" TEXT,
    "kind" TEXT NOT NULL,
    "amountPoints" INTEGER NOT NULL DEFAULT 0,
    "moneyCents" INTEGER NOT NULL DEFAULT 0,
    "bonusPoints" INTEGER NOT NULL DEFAULT 0,
    "planCode" TEXT,
    "promoCodeId" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingLedger_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillingLedger_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BillingLedger_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BillingLedger" ("amountPoints", "createdAt", "id", "kind", "moneyCents", "note", "ownerId", "planCode", "serverId") SELECT "amountPoints", "createdAt", "id", "kind", "moneyCents", "note", "ownerId", "planCode", "serverId" FROM "BillingLedger";
DROP TABLE "BillingLedger";
ALTER TABLE "new_BillingLedger" RENAME TO "BillingLedger";
CREATE INDEX "BillingLedger_kind_createdAt_idx" ON "BillingLedger"("kind", "createdAt");
CREATE INDEX "BillingLedger_ownerId_createdAt_idx" ON "BillingLedger"("ownerId", "createdAt");
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
    "rewardRatePerSecond" INTEGER NOT NULL DEFAULT 1,
    "maxPaidPlayers" INTEGER NOT NULL DEFAULT 20,
    "minPlaySecondsForComment" INTEGER NOT NULL DEFAULT 1800,
    "premiumPlan" TEXT NOT NULL DEFAULT 'NONE',
    "premiumUntil" DATETIME,
    "pluginSecret" TEXT NOT NULL,
    "botProtectionLevel" INTEGER NOT NULL DEFAULT 2,
    "lastHeartbeatAt" DATETIME,
    "lastPluginVersion" TEXT,
    "integrityFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Server" ("bannerImage", "botProtectionLevel", "createdAt", "description", "host", "id", "maxPaidPlayers", "minPlaySecondsForComment", "name", "ownerId", "pluginSecret", "pointPool", "port", "premiumPlan", "premiumUntil", "region", "rewardRatePerSecond", "slug", "status", "tags", "updatedAt", "version") SELECT "bannerImage", "botProtectionLevel", "createdAt", "description", "host", "id", "maxPaidPlayers", "minPlaySecondsForComment", "name", "ownerId", "pluginSecret", "pointPool", "port", "premiumPlan", "premiumUntil", "region", "rewardRatePerSecond", "slug", "status", "tags", "updatedAt", "version" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
CREATE UNIQUE INDEX "Server_slug_key" ON "Server"("slug");
CREATE INDEX "Server_status_premiumUntil_idx" ON "Server"("status", "premiumUntil");
CREATE INDEX "Server_trustStatus_status_idx" ON "Server"("trustStatus", "status");
CREATE INDEX "Server_ownerId_idx" ON "Server"("ownerId");
CREATE TABLE "new_ServerSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minecraftName" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "afkSeconds" INTEGER NOT NULL DEFAULT 0,
    "rewardedPoints" INTEGER NOT NULL DEFAULT 0,
    "suspiciousScore" INTEGER NOT NULL DEFAULT 0,
    "activityEvents" INTEGER NOT NULL DEFAULT 0,
    "lastNonce" TEXT,
    "integrityVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "ServerSession_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ServerSession" ("activeSeconds", "afkSeconds", "endedAt", "id", "ipHash", "lastHeartbeatAt", "minecraftName", "rewardedPoints", "serverId", "startedAt", "status", "suspiciousScore", "userId") SELECT "activeSeconds", "afkSeconds", "endedAt", "id", "ipHash", "lastHeartbeatAt", "minecraftName", "rewardedPoints", "serverId", "startedAt", "status", "suspiciousScore", "userId" FROM "ServerSession";
DROP TABLE "ServerSession";
ALTER TABLE "new_ServerSession" RENAME TO "ServerSession";
CREATE INDEX "ServerSession_serverId_userId_status_idx" ON "ServerSession"("serverId", "userId", "status");
CREATE INDEX "ServerSession_lastHeartbeatAt_idx" ON "ServerSession"("lastHeartbeatAt");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "minecraftUuid" TEXT,
    "minecraftName" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PLAYER',
    "walletPoints" INTEGER NOT NULL DEFAULT 0,
    "bio" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "minecraftName", "minecraftUuid", "passwordHash", "role", "updatedAt", "username", "walletPoints") SELECT "createdAt", "email", "id", "minecraftName", "minecraftUuid", "passwordHash", "role", "updatedAt", "username", "walletPoints" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_minecraftUuid_key" ON "User"("minecraftUuid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoRedemption_serverId_createdAt_idx" ON "PromoRedemption"("serverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_promoCodeId_userId_serverId_key" ON "PromoRedemption"("promoCodeId", "userId", "serverId");

-- CreateIndex
CREATE INDEX "ServerReport_serverId_status_createdAt_idx" ON "ServerReport"("serverId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ServerReport_reporterId_createdAt_idx" ON "ServerReport"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_serverId_status_createdAt_idx" ON "SupportTicket"("serverId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_requesterId_createdAt_idx" ON "SupportTicket"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "EnforcementAction_serverId_createdAt_idx" ON "EnforcementAction"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "EnforcementAction_adminId_createdAt_idx" ON "EnforcementAction"("adminId", "createdAt");

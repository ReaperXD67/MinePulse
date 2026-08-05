-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OWNER', 'PLAYER');

-- CreateEnum
CREATE TYPE "UserModerationType" AS ENUM ('BAN', 'UNBAN');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REMOVED');

-- CreateEnum
CREATE TYPE "PremiumPlanCode" AS ENUM ('NONE', 'GOLD', 'DIAMOND');

-- CreateEnum
CREATE TYPE "StoreItemStatus" AS ENUM ('ACTIVE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "TrustStatus" AS ENUM ('VERIFIED', 'WATCHLIST', 'SUSPENDED', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('NO_REWARD', 'PLUGIN_TAMPERING', 'BOTS_OR_FAKE_PLAYERS', 'SCAM_OR_FALSE_INFO', 'ABUSIVE_CONTENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

-- CreateEnum
CREATE TYPE "EnforcementType" AS ENUM ('WARNING', 'PAUSE', 'BLACKLIST', 'CREDIT_REMOVAL', 'RESTORE');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('PLAYER_REWARD', 'PLAYER_SPEND', 'LEVEL_REWARD', 'DAILY_REWARD', 'SERVER_TOPUP', 'SERVER_PREMIUM', 'PROMO_BONUS', 'SERVER_PENALTY', 'ADMIN_ADJUSTMENT', 'PURCHASE_REFUND');

-- CreateEnum
CREATE TYPE "BillingKind" AS ENUM ('POINTS', 'PREMIUM', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CryptoPaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "CryptoPurchaseKind" AS ENUM ('POINTS', 'PREMIUM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "minecraftUuid" TEXT,
    "minecraftName" TEXT,
    "minecraftLinkedAt" TIMESTAMP(3),
    "minecraftConsentVersion" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "walletPoints" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "lifetimeEarnedPoints" INTEGER NOT NULL DEFAULT 0,
    "lastDailyClaimAt" TIMESTAMP(3),
    "friendsPrivate" BOOLEAN NOT NULL DEFAULT false,
    "bio" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "bannedAt" TIMESTAMP(3),
    "bannedUntil" TIMESTAMP(3),
    "banReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserModerationAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminId" TEXT,
    "type" "UserModerationType" NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthThrottle" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MinecraftLinkCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinecraftLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
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
    "status" "ServerStatus" NOT NULL DEFAULT 'ACTIVE',
    "trustStatus" "TrustStatus" NOT NULL DEFAULT 'VERIFIED',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "pointPool" INTEGER NOT NULL DEFAULT 0,
    "rewardRatePerSecond" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxPaidPlayers" INTEGER NOT NULL DEFAULT 20,
    "minPlaySecondsForComment" INTEGER NOT NULL DEFAULT 1800,
    "premiumPlan" "PremiumPlanCode" NOT NULL DEFAULT 'NONE',
    "premiumUntil" TIMESTAMP(3),
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
    "minimumMovementDistance" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "minimumActivityEvents" INTEGER NOT NULL DEFAULT 1,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastConfigSyncAt" TIMESTAMP(3),
    "lastPluginVersion" TEXT,
    "integrityFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginRequestNonce" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginRequestNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreItem" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pricePoints" INTEGER NOT NULL,
    "command" TEXT NOT NULL,
    "requiresOnline" BOOLEAN NOT NULL DEFAULT true,
    "status" "StoreItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "commandSnapshot" TEXT NOT NULL,
    "requiresOnline" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerSession" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minecraftName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "afkSeconds" INTEGER NOT NULL DEFAULT 0,
    "rewardedPoints" INTEGER NOT NULL DEFAULT 0,
    "rewardCarryPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suspiciousScore" INTEGER NOT NULL DEFAULT 0,
    "activityEvents" INTEGER NOT NULL DEFAULT 0,
    "lastNonce" TEXT,
    "integrityVerified" BOOLEAN NOT NULL DEFAULT false,
    "challengeId" TEXT,
    "challengeQuestion" TEXT,
    "challengeAnswerHash" TEXT,
    "challengeRequiredAt" TIMESTAMP(3),
    "challengeExpiresAt" TIMESTAMP(3),
    "challengePassedAt" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "ServerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerHourlyStat" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "hourStart" TIMESTAMP(3) NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "onlinePlayerTotal" INTEGER NOT NULL DEFAULT 0,
    "peakOnline" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerHourlyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerLike" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "serverId" TEXT,
    "type" "LedgerType" NOT NULL,
    "amountPoints" INTEGER NOT NULL,
    "balanceAfter" INTEGER,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingLedger" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "serverId" TEXT,
    "kind" "BillingKind" NOT NULL,
    "amountPoints" INTEGER NOT NULL DEFAULT 0,
    "moneyCents" INTEGER NOT NULL DEFAULT 0,
    "bonusPoints" INTEGER NOT NULL DEFAULT 0,
    "planCode" TEXT,
    "promoCodeId" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoPayment" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "serverId" TEXT,
    "pointPackageId" TEXT,
    "premiumTierId" TEXT,
    "promoCodeId" TEXT,
    "kind" "CryptoPurchaseKind" NOT NULL DEFAULT 'POINTS',
    "provider" TEXT NOT NULL DEFAULT 'NOWPAYMENTS',
    "providerInvoiceId" TEXT,
    "providerPaymentId" TEXT,
    "providerStatus" TEXT NOT NULL DEFAULT 'waiting',
    "status" "CryptoPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutUrl" TEXT,
    "packageCode" TEXT NOT NULL,
    "packageLabel" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "basePoints" INTEGER NOT NULL DEFAULT 0,
    "bonusPoints" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "premiumPlan" TEXT,
    "premiumDays" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "expiresAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "bonusPercent" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "bonusPoints" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerReport" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "ownerNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnforcementAction" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "type" "EnforcementType" NOT NULL,
    "pointsRemoved" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnforcementAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointPackage" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PremiumTier" (
    "id" TEXT NOT NULL,
    "code" "PremiumPlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "accentColor" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PremiumTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_minecraftUuid_key" ON "User"("minecraftUuid");

-- CreateIndex
CREATE INDEX "UserModerationAction_userId_createdAt_idx" ON "UserModerationAction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserModerationAction_adminId_createdAt_idx" ON "UserModerationAction"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "UserModerationAction_type_createdAt_idx" ON "UserModerationAction"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_revokedAt_idx" ON "AuthSession"("expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthThrottle_scope_updatedAt_idx" ON "AuthThrottle"("scope", "updatedAt");

-- CreateIndex
CREATE INDEX "AuthThrottle_blockedUntil_idx" ON "AuthThrottle"("blockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "MinecraftLinkCode_code_key" ON "MinecraftLinkCode"("code");

-- CreateIndex
CREATE INDEX "MinecraftLinkCode_userId_expiresAt_idx" ON "MinecraftLinkCode"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Server_slug_key" ON "Server"("slug");

-- CreateIndex
CREATE INDEX "Server_host_port_idx" ON "Server"("host", "port");

-- CreateIndex
CREATE INDEX "Server_status_premiumUntil_idx" ON "Server"("status", "premiumUntil");

-- CreateIndex
CREATE INDEX "Server_trustStatus_status_idx" ON "Server"("trustStatus", "status");

-- CreateIndex
CREATE INDEX "Server_ownerId_idx" ON "Server"("ownerId");

-- CreateIndex
CREATE INDEX "PluginRequestNonce_expiresAt_idx" ON "PluginRequestNonce"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PluginRequestNonce_serverId_nonce_key" ON "PluginRequestNonce"("serverId", "nonce");

-- CreateIndex
CREATE INDEX "StoreItem_serverId_status_idx" ON "StoreItem"("serverId", "status");

-- CreateIndex
CREATE INDEX "Purchase_serverId_status_idx" ON "Purchase"("serverId", "status");

-- CreateIndex
CREATE INDEX "Purchase_buyerId_createdAt_idx" ON "Purchase"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "ServerSession_serverId_userId_status_idx" ON "ServerSession"("serverId", "userId", "status");

-- CreateIndex
CREATE INDEX "ServerSession_lastHeartbeatAt_idx" ON "ServerSession"("lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "Friendship_friendId_idx" ON "Friendship"("friendId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_userId_friendId_key" ON "Friendship"("userId", "friendId");

-- CreateIndex
CREATE INDEX "ServerHourlyStat_serverId_hourStart_idx" ON "ServerHourlyStat"("serverId", "hourStart");

-- CreateIndex
CREATE UNIQUE INDEX "ServerHourlyStat_serverId_hourStart_key" ON "ServerHourlyStat"("serverId", "hourStart");

-- CreateIndex
CREATE UNIQUE INDEX "ServerLike_serverId_userId_key" ON "ServerLike"("serverId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_serverId_userId_key" ON "Favorite"("serverId", "userId");

-- CreateIndex
CREATE INDEX "Comment_serverId_createdAt_idx" ON "Comment"("serverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_serverId_userId_key" ON "Comment"("serverId", "userId");

-- CreateIndex
CREATE INDEX "PointLedger_type_createdAt_idx" ON "PointLedger"("type", "createdAt");

-- CreateIndex
CREATE INDEX "PointLedger_serverId_createdAt_idx" ON "PointLedger"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "PointLedger_userId_createdAt_idx" ON "PointLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingLedger_kind_createdAt_idx" ON "BillingLedger"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "BillingLedger_ownerId_createdAt_idx" ON "BillingLedger"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoPayment_providerInvoiceId_key" ON "CryptoPayment"("providerInvoiceId");

-- CreateIndex
CREATE INDEX "CryptoPayment_ownerId_createdAt_idx" ON "CryptoPayment"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "CryptoPayment_serverId_createdAt_idx" ON "CryptoPayment"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "CryptoPayment_status_createdAt_idx" ON "CryptoPayment"("status", "createdAt");

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

-- CreateIndex
CREATE UNIQUE INDEX "PointPackage_code_key" ON "PointPackage"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PremiumTier_code_key" ON "PremiumTier"("code");

-- AddForeignKey
ALTER TABLE "UserModerationAction" ADD CONSTRAINT "UserModerationAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModerationAction" ADD CONSTRAINT "UserModerationAction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinecraftLinkCode" ADD CONSTRAINT "MinecraftLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginRequestNonce" ADD CONSTRAINT "PluginRequestNonce_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreItem" ADD CONSTRAINT "StoreItem_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerSession" ADD CONSTRAINT "ServerSession_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerSession" ADD CONSTRAINT "ServerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerHourlyStat" ADD CONSTRAINT "ServerHourlyStat_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerLike" ADD CONSTRAINT "ServerLike_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerLike" ADD CONSTRAINT "ServerLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedger" ADD CONSTRAINT "BillingLedger_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedger" ADD CONSTRAINT "BillingLedger_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedger" ADD CONSTRAINT "BillingLedger_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_pointPackageId_fkey" FOREIGN KEY ("pointPackageId") REFERENCES "PointPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_premiumTierId_fkey" FOREIGN KEY ("premiumTierId") REFERENCES "PremiumTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerReport" ADD CONSTRAINT "ServerReport_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerReport" ADD CONSTRAINT "ServerReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnforcementAction" ADD CONSTRAINT "EnforcementAction_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnforcementAction" ADD CONSTRAINT "EnforcementAction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

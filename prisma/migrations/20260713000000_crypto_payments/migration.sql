CREATE TABLE "CryptoPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "serverId" TEXT,
    "pointPackageId" TEXT,
    "premiumTierId" TEXT,
    "promoCodeId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'POINTS',
    "provider" TEXT NOT NULL DEFAULT 'NOWPAYMENTS',
    "providerInvoiceId" TEXT,
    "providerPaymentId" TEXT,
    "providerStatus" TEXT NOT NULL DEFAULT 'waiting',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
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
    "expiresAt" DATETIME,
    "settledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CryptoPayment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CryptoPayment_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CryptoPayment_pointPackageId_fkey" FOREIGN KEY ("pointPackageId") REFERENCES "PointPackage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CryptoPayment_premiumTierId_fkey" FOREIGN KEY ("premiumTierId") REFERENCES "PremiumTier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CryptoPayment_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CryptoPayment_providerInvoiceId_key" ON "CryptoPayment"("providerInvoiceId");
CREATE INDEX "CryptoPayment_ownerId_createdAt_idx" ON "CryptoPayment"("ownerId", "createdAt");
CREATE INDEX "CryptoPayment_serverId_createdAt_idx" ON "CryptoPayment"("serverId", "createdAt");
CREATE INDEX "CryptoPayment_status_createdAt_idx" ON "CryptoPayment"("status", "createdAt");

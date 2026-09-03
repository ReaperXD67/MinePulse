ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'PROCESSING' AFTER 'PENDING';

ALTER TABLE "Purchase"
  ADD COLUMN "requestKey" TEXT,
  ADD COLUMN "pricePointsSnapshot" INTEGER,
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "claimExpiresAt" TIMESTAMP(3),
  ADD COLUMN "lastDeliveryAttemptAt" TIMESTAMP(3),
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "Purchase" AS purchase
SET "pricePointsSnapshot" = item."pricePoints",
    "expiresAt" = purchase."createdAt" + INTERVAL '30 days'
FROM "StoreItem" AS item
WHERE item."id" = purchase."itemId";

ALTER TABLE "Purchase"
  ALTER COLUMN "pricePointsSnapshot" SET NOT NULL,
  ALTER COLUMN "expiresAt" SET NOT NULL,
  ALTER COLUMN "expiresAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days');

CREATE UNIQUE INDEX "Purchase_requestKey_key" ON "Purchase"("requestKey");
CREATE UNIQUE INDEX "Purchase_claimToken_key" ON "Purchase"("claimToken");
DROP INDEX IF EXISTS "Purchase_serverId_status_idx";
CREATE INDEX "Purchase_serverId_status_createdAt_idx" ON "Purchase"("serverId", "status", "createdAt");
CREATE INDEX "Purchase_buyerId_serverId_status_idx" ON "Purchase"("buyerId", "serverId", "status");
CREATE INDEX "Purchase_status_expiresAt_idx" ON "Purchase"("status", "expiresAt");

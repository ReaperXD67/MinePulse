CREATE TABLE "PluginRequestNonce" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PluginRequestNonce_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PluginRequestNonce_serverId_nonce_key" ON "PluginRequestNonce"("serverId", "nonce");
CREATE INDEX "PluginRequestNonce_expiresAt_idx" ON "PluginRequestNonce"("expiresAt");

ALTER TABLE "User" ADD COLUMN "minecraftLinkedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "minecraftConsentVersion" TEXT;

-- Historical session IP hashes are not needed for rewards or fraud checks.
UPDATE "ServerSession" SET "ipHash" = 'legacy-redacted';

-- Normalize legacy free-text fields and remove externally hosted display media.
UPDATE "Server" SET "region" = 'GLOBAL' WHERE "region" NOT IN ('GLOBAL', 'EU', 'NA', 'SA', 'ASIA', 'OCEANIA', 'AFRICA');
UPDATE "Server" SET "version" = '1.21.11' WHERE LENGTH("version") > 30 OR "version" NOT GLOB '1.[0-9]*';
UPDATE "Server" SET "bannerImage" = '/voxel-network.png' WHERE "bannerImage" IS NOT NULL AND "bannerImage" NOT LIKE '/uploads/%' AND "bannerImage" <> '/voxel-network.png';
UPDATE "Server" SET "galleryImages" = '' WHERE "galleryImages" LIKE '%http://%' OR "galleryImages" LIKE '%https://%';
UPDATE "User" SET "avatarUrl" = NULL WHERE "avatarUrl" IS NOT NULL AND "avatarUrl" NOT LIKE '/uploads/%';

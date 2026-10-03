ALTER TABLE "Server"
  ADD COLUMN "afkProtectionEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pluginMessagesEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "onlinePlayerCount" INTEGER,
  ADD COLUMN "onlinePlayerCountAt" TIMESTAMP(3);

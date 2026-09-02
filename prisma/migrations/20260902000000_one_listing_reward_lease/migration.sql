ALTER TABLE "User"
  ADD COLUMN "activeRewardServerId" TEXT,
  ADD COLUMN "activeRewardLeaseUntil" TIMESTAMP(3);

CREATE INDEX "User_activeRewardLeaseUntil_idx"
  ON "User"("activeRewardLeaseUntil");

-- Product rule: community accounts get one current listing. Official KarixMC
-- showcases are intentionally exempt because they are platform-operated demos.
CREATE UNIQUE INDEX "Server_one_member_listing_per_owner_key"
  ON "Server"("ownerId")
  WHERE "status" <> 'REMOVED' AND NOT "isOfficialShowcase";

-- Prevent two simultaneous first heartbeats from opening duplicate active
-- sessions for the same player on the same server.
CREATE UNIQUE INDEX "ServerSession_one_active_per_player_key"
  ON "ServerSession"("serverId", "userId")
  WHERE "status" = 'ACTIVE';

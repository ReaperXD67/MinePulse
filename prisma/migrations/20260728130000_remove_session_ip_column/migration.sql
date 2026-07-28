-- Minecraft reward verification does not require a player IP address.
-- Removing the column prevents future code from silently reusing legacy data.
ALTER TABLE "ServerSession" DROP COLUMN "ipHash";

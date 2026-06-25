ALTER TABLE "User" ADD COLUMN "friendsPrivate" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "StoreItem" ADD COLUMN "requiresOnline" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Purchase" ADD COLUMN "requiresOnline" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ServerSession" ADD COLUMN "rewardCarryPoints" REAL NOT NULL DEFAULT 0;

CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Friendship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Friendship_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Friendship_userId_friendId_key" ON "Friendship"("userId", "friendId");
CREATE INDEX "Friendship_friendId_idx" ON "Friendship"("friendId");

CREATE TABLE "ServerHourlyStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "hourStart" DATETIME NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "onlinePlayerTotal" INTEGER NOT NULL DEFAULT 0,
    "peakOnline" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServerHourlyStat_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ServerHourlyStat_serverId_hourStart_key" ON "ServerHourlyStat"("serverId", "hourStart");
CREATE INDEX "ServerHourlyStat_serverId_hourStart_idx" ON "ServerHourlyStat"("serverId", "hourStart");

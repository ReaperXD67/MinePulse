ALTER TABLE "User" ADD COLUMN "bannedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "bannedUntil" DATETIME;
ALTER TABLE "User" ADD COLUMN "banReason" TEXT;

CREATE TABLE "UserModerationAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "adminId" TEXT,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserModerationAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserModerationAction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "UserModerationAction_userId_createdAt_idx" ON "UserModerationAction"("userId", "createdAt");
CREATE INDEX "UserModerationAction_adminId_createdAt_idx" ON "UserModerationAction"("adminId", "createdAt");
CREATE INDEX "UserModerationAction_type_createdAt_idx" ON "UserModerationAction"("type", "createdAt");

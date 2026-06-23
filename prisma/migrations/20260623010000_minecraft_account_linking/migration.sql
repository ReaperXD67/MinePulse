CREATE TABLE "MinecraftLinkCode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MinecraftLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MinecraftLinkCode_code_key" ON "MinecraftLinkCode"("code");
CREATE INDEX "MinecraftLinkCode_userId_expiresAt_idx" ON "MinecraftLinkCode"("userId", "expiresAt");

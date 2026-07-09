ALTER TABLE "User" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lifetimeEarnedPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lastDailyClaimAt" DATETIME;

UPDATE "User"
SET "lifetimeEarnedPoints" = COALESCE((
  SELECT SUM("amountPoints")
  FROM "PointLedger"
  WHERE "PointLedger"."userId" = "User"."id"
    AND "PointLedger"."type" = 'PLAYER_REWARD'
    AND "PointLedger"."amountPoints" > 0
), 0);

WITH RECURSIVE "levels"("level", "requiredPoints") AS (
  VALUES(0, 0)
  UNION ALL
  SELECT "level" + 1, (("level" + 1) * ("level" + 2) * 1000) / 2
  FROM "levels"
  WHERE "level" < 500
)
UPDATE "User"
SET "level" = COALESCE((
  SELECT MAX("level")
  FROM "levels"
  WHERE "requiredPoints" <= "User"."lifetimeEarnedPoints"
), 0);

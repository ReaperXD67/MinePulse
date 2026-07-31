DELETE FROM "Comment"
WHERE "id" NOT IN (
  SELECT newest."id"
  FROM "Comment" AS newest
  WHERE newest."id" = (
    SELECT candidate."id"
    FROM "Comment" AS candidate
    WHERE candidate."serverId" = newest."serverId"
      AND candidate."userId" = newest."userId"
    ORDER BY candidate."createdAt" DESC, candidate."id" DESC
    LIMIT 1
  )
);

CREATE UNIQUE INDEX "Comment_serverId_userId_key" ON "Comment"("serverId", "userId");

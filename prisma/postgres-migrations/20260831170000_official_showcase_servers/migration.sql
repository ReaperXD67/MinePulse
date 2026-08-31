ALTER TABLE "Server"
ADD COLUMN "isOfficialShowcase" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Server_isOfficialShowcase_status_idx"
ON "Server"("isOfficialShowcase", "status");

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminTotpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "adminTotpSecret" TEXT;

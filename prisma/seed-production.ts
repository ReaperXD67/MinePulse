import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PremiumPlanCode, PrismaClient } from "../lib/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.startsWith("postgresql://") && !connectionString?.startsWith("postgres://")) {
  throw new Error("DATABASE_URL must point to PostgreSQL");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2 }) });

async function main() {
  const pointPackages = [
    { code: "POINTS_250K", label: "Starter Reactor", points: 250_000, priceCents: 999, sortOrder: 1 },
    { code: "POINTS_1M", label: "1 Million Core", points: 1_000_000, priceCents: 2_999, sortOrder: 2 },
    { code: "POINTS_5M", label: "5 Million Vault", points: 5_000_000, priceCents: 11_999, sortOrder: 3 }
  ];

  for (const pointPackage of pointPackages) {
    await prisma.pointPackage.upsert({
      where: { code: pointPackage.code },
      create: pointPackage,
      update: pointPackage
    });
  }

  const premiumTiers = [
    {
      code: PremiumPlanCode.GOLD,
      name: "Gold",
      priceCents: 1_499,
      durationDays: 7,
      accentColor: "#f7c948",
      priority: 1
    },
    {
      code: PremiumPlanCode.DIAMOND,
      name: "Diamond",
      priceCents: 2_999,
      durationDays: 7,
      accentColor: "#48e3ff",
      priority: 2
    }
  ];

  for (const tier of premiumTiers) {
    await prisma.premiumTier.upsert({
      where: { code: tier.code },
      create: tier,
      update: tier
    });
  }

  console.log("Production reference data is ready. No users, balances, promo codes, or payments were created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

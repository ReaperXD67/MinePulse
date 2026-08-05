import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

export function createScriptPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.startsWith("postgresql://") && !connectionString?.startsWith("postgres://")) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string");
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
}

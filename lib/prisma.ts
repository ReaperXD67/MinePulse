import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.startsWith("postgresql://") && !connectionString?.startsWith("postgres://")) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection string");
}

const adapter = new PrismaPg({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 5_000),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30_000)
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

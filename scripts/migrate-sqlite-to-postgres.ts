import "dotenv/config";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import initSqlJs, { type Database } from "sql.js";
import { Client } from "pg";

const TABLE_ORDER = [
  "User",
  "AuthThrottle",
  "PromoCode",
  "PointPackage",
  "PremiumTier",
  "AuthSession",
  "MinecraftLinkCode",
  "UserModerationAction",
  "Server",
  "PluginRequestNonce",
  "StoreItem",
  "Purchase",
  "ServerSession",
  "Friendship",
  "ServerHourlyStat",
  "ServerLike",
  "Favorite",
  "Comment",
  "PointLedger",
  "BillingLedger",
  "CryptoPayment",
  "PromoRedemption",
  "ServerReport",
  "SupportTicket",
  "EnforcementAction"
] as const;

type ColumnInfo = { table_name: string; column_name: string; data_type: string; udt_name: string };

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function quoted(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function converted(value: unknown, column: ColumnInfo) {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (column.data_type === "boolean") return value === true || value === 1 || value === "1";
  if (column.data_type.includes("timestamp")) {
    const numeric = typeof value === "number" ? value : /^\d+$/.test(String(value)) ? Number(value) : null;
    const date = numeric === null ? new Date(String(value)) : new Date(numeric);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid date value ${String(value)} for ${column.table_name}.${column.column_name}`);
    return date;
  }
  if (["smallint", "integer", "bigint", "real", "double precision", "numeric"].includes(column.data_type)) {
    return Number(value);
  }
  return value;
}

function rows<T extends Record<string, unknown>>(database: Database, query: string) {
  const statement = database.prepare(query);
  const result: T[] = [];
  try {
    while (statement.step()) result.push(statement.getAsObject() as T);
    return result;
  } finally {
    statement.free();
  }
}

async function main() {
  const source = path.resolve(argument("--source") || "prisma/dev.db");
  const force = process.argv.includes("--force");
  const connectionString = process.env.DATABASE_URL;

  if (!existsSync(source)) throw new Error(`SQLite source does not exist: ${source}`);
  if (!connectionString?.startsWith("postgresql://") && !connectionString?.startsWith("postgres://")) {
    throw new Error("DATABASE_URL must point to the destination PostgreSQL database");
  }

  const SQL = await initSqlJs();
  const sqlite = new SQL.Database(readFileSync(source));
  const postgres = new Client({ connectionString });
  await postgres.connect();

  try {
    const sourceTables = new Set(
      rows<{ name: string }>(sqlite, "SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name)
    );
    const destinationTablesResult = await postgres.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    );
    const destinationTables = new Set(destinationTablesResult.rows.map((row) => row.table_name));
    const tables = TABLE_ORDER.filter((table) => sourceTables.has(table) && destinationTables.has(table));

    const columnResult = await postgres.query<ColumnInfo>(
      "SELECT table_name, column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = 'public'"
    );
    const columnsByTable = new Map<string, Map<string, ColumnInfo>>();
    for (const column of columnResult.rows) {
      const columns = columnsByTable.get(column.table_name) || new Map<string, ColumnInfo>();
      columns.set(column.column_name, column);
      columnsByTable.set(column.table_name, columns);
    }

    const occupied: string[] = [];
    for (const table of tables) {
      const result = await postgres.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${quoted(table)}`);
      if (Number(result.rows[0]?.count || 0) > 0) occupied.push(table);
    }
    if (occupied.length && !force) {
      throw new Error(`Destination is not empty (${occupied.join(", ")}). Re-run with --force only after taking a backup.`);
    }

    await postgres.query("BEGIN");
    if (force && tables.length) {
      await postgres.query(`TRUNCATE ${[...tables].reverse().map(quoted).join(", ")} CASCADE`);
    }

    const summary: Record<string, number> = {};
    for (const table of tables) {
      const destinationColumns = columnsByTable.get(table) || new Map<string, ColumnInfo>();
      const sourceColumns = rows<{ name: string }>(sqlite, `PRAGMA table_info(${quoted(table)})`).map((row) => row.name);
      const columns = sourceColumns.filter((column) => destinationColumns.has(column));
      const sourceRows = rows<Record<string, unknown>>(sqlite, `SELECT * FROM ${quoted(table)}`);

      for (const row of sourceRows) {
        const values = columns.map((column) => converted(row[column], destinationColumns.get(column)!));
        const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
        await postgres.query(
          `INSERT INTO ${quoted(table)} (${columns.map(quoted).join(", ")}) VALUES (${placeholders})`,
          values
        );
      }
      summary[table] = sourceRows.length;
    }

    await postgres.query("COMMIT");

    for (const [table, expected] of Object.entries(summary)) {
      const result = await postgres.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${quoted(table)}`);
      const actual = Number(result.rows[0]?.count || 0);
      if (actual !== expected) throw new Error(`Verification failed for ${table}: expected ${expected}, found ${actual}`);
    }

    console.log(JSON.stringify({ ok: true, source, imported: summary }, null, 2));
  } catch (error) {
    await postgres.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    sqlite.close();
    await postgres.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";

const root = process.cwd();
const envPath = path.join(root, ".env");
const env = fs.readFileSync(envPath, "utf8");
const match = env.match(/^DATABASE_URL="file:(.+)"$/m);

if (!match) {
  throw new Error("DATABASE_URL must be a file: SQLite URL in .env");
}

const dbPath = path.resolve(root, match[1]);
const migrationPath = path.join(root, "prisma", "migrations", "20260617000000_init", "migration.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const SQL = await initSqlJs();
const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
const hasUserTable = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'User';");

if (hasUserTable.length === 0) {
  db.run("PRAGMA foreign_keys = OFF;");
  db.run(migration);
  db.run("PRAGMA foreign_keys = ON;");
  console.log(`Applied ${migrationPath} to ${dbPath}`);
} else {
  console.log("Database already has MinePulse tables; skipping migration apply.");
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.writeFileSync(dbPath, Buffer.from(db.export()));
db.close();

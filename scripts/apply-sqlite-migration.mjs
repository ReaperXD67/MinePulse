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
const migrationsPath = path.join(root, "prisma", "migrations");
const migrationDirectories = fs
  .readdirSync(migrationsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const SQL = await initSqlJs();
const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
const hasUserTable = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'User';");

db.run(`
  CREATE TABLE IF NOT EXISTS "_MinePulseMigration" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

if (hasUserTable.length > 0) {
  const initial = migrationDirectories[0];
  const trackedInitial = db.exec(`SELECT "name" FROM "_MinePulseMigration" WHERE "name" = '${initial}';`);
  if (trackedInitial.length === 0) {
    db.run(`INSERT INTO "_MinePulseMigration" ("name") VALUES ('${initial}');`);
    console.log(`Marked existing schema as ${initial}`);
  }
}

for (const migrationName of migrationDirectories) {
  const applied = db.exec(
    `SELECT "name" FROM "_MinePulseMigration" WHERE "name" = '${migrationName}';`
  );

  if (applied.length > 0) {
    continue;
  }

  const migrationPath = path.join(migrationsPath, migrationName, "migration.sql");
  const migration = fs.readFileSync(migrationPath, "utf8");
  db.run("PRAGMA foreign_keys = OFF;");
  db.run(migration);
  db.run("PRAGMA foreign_keys = ON;");
  db.run(`INSERT INTO "_MinePulseMigration" ("name") VALUES ('${migrationName}');`);
  console.log(`Applied ${migrationName} to ${dbPath}`);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.writeFileSync(dbPath, Buffer.from(db.export()));
db.close();

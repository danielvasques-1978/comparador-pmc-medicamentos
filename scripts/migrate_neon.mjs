import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "./load_local_env.mjs";

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Configure DATABASE_URL in .env.local before migrating Neon.");
}

const sql = neon(databaseUrl);
const migrationsPath = path.join(process.cwd(), "neon", "migrations");
const migrationFiles = fs
  .readdirSync(migrationsPath)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();

let applied = 0;

for (const fileName of migrationFiles) {
  const migration = fs.readFileSync(path.join(migrationsPath, fileName), "utf8");
  const statements = migration
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.query(statement);
    applied += 1;
  }
}

console.log(`Applied ${applied} Neon migration statements from ${migrationFiles.length} files.`);

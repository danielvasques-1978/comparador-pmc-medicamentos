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
const migrationPath = path.join(process.cwd(), "neon", "migrations", "20260611000000_app_schema.sql");
const migration = fs.readFileSync(migrationPath, "utf8");

const statements = migration
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`Applied ${statements.length} Neon migration statements.`);

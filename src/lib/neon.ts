import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;

export function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql;
}

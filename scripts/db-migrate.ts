/**
 * Applies db/schema.sql to the Neon database in DATABASE_URL (re-runnable).
 *   npm run db:migrate            (reads .env.production.local, then .env.local)
 */
import fs from "node:fs";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";

function loadEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv(".env.production.local");
loadEnv(".env.local");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
    const { rows } = await pool.query(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`);
    console.log("tables:", rows.map((r: { table_name: string }) => r.table_name).join(", "));
    const fn = await pool.query(`select 1 from pg_proc where proname = 'claim_jobs'`);
    console.log("claim_jobs function:", fn.rowCount ? "present" : "MISSING");
  } finally {
    await pool.end();
  }
}
main().catch((e) => { console.error(`migration failed: ${e instanceof Error ? e.message : e}`); process.exit(1); });

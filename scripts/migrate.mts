import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL mangler");
const sql = postgres(url);

await sql`CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`;
const done = new Set((await sql<{ name: string }[]>`SELECT name FROM schema_migration`).map((r) => r.name));
for (const file of readdirSync("db/migrations").sort()) {
  if (done.has(file)) continue;
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(`db/migrations/${file}`, "utf8"));
    await tx`INSERT INTO schema_migration (name) VALUES (${file})`;
  });
  console.log(`Kjørte ${file}`);
}
await sql.end();

import postgres from "postgres";

let sql: postgres.Sql | null = null;

/** Felles databaseforbindelse. Returnerer null når DATABASE_URL ikke er satt. */
export function getSql(): postgres.Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  sql ??= postgres(url, {
    max: 5,
    onnotice: () => {},
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "prefer",
  });
  return sql;
}

export class NoDatabaseError extends Error {
  constructor() {
    super("Databasen er ikke koblet til. Legg inn DATABASE_URL i miljøvariablene.");
  }
}

export function requireSql(): postgres.Sql {
  const s = getSql();
  if (!s) throw new NoDatabaseError();
  return s;
}

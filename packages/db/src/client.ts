import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { requireEnv } from "./env";
import * as schema from "./schema";

export type Sql = postgres.Sql<Record<string, never>>;

const g = globalThis as unknown as { __216leads_sql?: Sql; __216leads_sql_direct?: Sql };

function make(url: string, max: number): Sql {
  return postgres(url, {
    max,
    idle_timeout: 30,
    connect_timeout: 15,
    onnotice: () => {},
    // numeric and bigint come back as strings by default; parse the ones we use as numbers.
    // Dates stay strings ("2026-10-29") and timestamps become ISO strings, so rows can be
    // passed straight to client components and JSON responses.
    types: {
      numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
      bigint: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
      date: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
      timestamptz: {
        to: 1184, from: [1184, 1114],
        serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)),
        parse: (x: string) => new Date(x.includes("T") ? x : x.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString(),
      },
    },
  }) as unknown as Sql;
}

/** Pooled connection for the web app. Reused across hot reloads. */
export function getSql(): Sql {
  if (!g.__216leads_sql) g.__216leads_sql = make(requireEnv("DATABASE_URL"), 10);
  return g.__216leads_sql;
}

/** Direct connection for migrations and ingest jobs. */
export function getDirectSql(): Sql {
  if (!g.__216leads_sql_direct) {
    g.__216leads_sql_direct = make(process.env.DATABASE_URL_DIRECT || requireEnv("DATABASE_URL"), 5);
  }
  return g.__216leads_sql_direct;
}

export function getDb() {
  return drizzle(getSql(), { schema });
}

export async function closeAll(): Promise<void> {
  await Promise.all([g.__216leads_sql?.end({ timeout: 5 }), g.__216leads_sql_direct?.end({ timeout: 5 })]);
  g.__216leads_sql = undefined;
  g.__216leads_sql_direct = undefined;
}

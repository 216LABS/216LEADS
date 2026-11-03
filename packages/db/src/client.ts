import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { optionalEnv, requireEnv } from "./env";
import * as schema from "./schema";

export type Sql = postgres.Sql<Record<string, never>>;

const g = globalThis as unknown as { __216leads_sql?: Sql; __216leads_sql_direct?: Sql };

export interface MakeOptions {
  /** Env var the URL came from; named in errors instead of the URL, which holds the password. */
  envName: string;
  max: number;
  /** Supabase's transaction pooler (port 6543) does not support prepared statements. */
  prepare: boolean;
}

/**
 * postgres.js decodes the URL password with decodeURIComponent, so a password with symbols
 * must be percent-encoded once (encodeURIComponent). A raw @ / # ? or % breaks parsing, and
 * Node's "Invalid URL" error carries the whole URL, so rethrow without it. Encoding twice
 * parses fine but sends the wrong password ("%40" instead of "@"), so warn about that.
 */
export function make(url: string, { envName, max, prepare }: MakeOptions): Sql {
  let sql: Sql;
  try {
    sql = create(url, max, prepare);
  } catch {
    throw new Error(
      `${envName} is not a valid connection URL. Percent-encode symbols in the password (encodeURIComponent) and check the host and port.`,
    );
  }
  if (/%[0-9a-f]{2}/i.test((sql as unknown as { options: { pass: string } }).options.pass)) {
    console.warn(`${envName}: the password still has percent-escapes after decoding; it may be encoded twice.`);
  }
  return sql;
}

function create(url: string, max: number, prepare: boolean): Sql {
  return postgres(url, {
    max,
    prepare,
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

/** Pooled connection for the web app (transaction pooler, no prepared statements). Reused across hot reloads. */
export function getSql(): Sql {
  if (!g.__216leads_sql) {
    g.__216leads_sql = make(requireEnv("DATABASE_URL"), { envName: "DATABASE_URL", max: 10, prepare: false });
  }
  return g.__216leads_sql;
}

/** Direct connection for migrations and ingest jobs (session pooler, prepared statements allowed). */
export function getDirectSql(): Sql {
  if (!g.__216leads_sql_direct) {
    const direct = optionalEnv("DATABASE_URL_DIRECT");
    g.__216leads_sql_direct = direct
      ? make(direct, { envName: "DATABASE_URL_DIRECT", max: 5, prepare: true })
      : make(requireEnv("DATABASE_URL"), { envName: "DATABASE_URL", max: 5, prepare: false });
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

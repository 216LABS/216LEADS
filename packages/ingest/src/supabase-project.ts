// Which Supabase project a connection string or API URL points at (issue #78).

/** "abcd" from postgresql://postgres.abcd:...@...pooler.supabase.com or db.abcd.supabase.co; null for local or other hosts. */
function refFromDbUrl(dbUrl: string): string | null {
  try {
    const u = new URL(dbUrl);
    const user = decodeURIComponent(u.username).match(/^postgres\.([a-z0-9]{20})$/)?.[1];
    return user ?? u.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** "abcd" from https://abcd.supabase.co; null for local or other hosts. */
function refFromApiUrl(apiUrl: string): string | null {
  try {
    return new URL(apiUrl).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * A reason to stop when the database and the Supabase API belong to different projects, e.g. a
 * staging DATABASE_URL with the local .env's 127.0.0.1 API: users would be created in the wrong one.
 */
export function supabaseProjectMismatch(dbUrl: string | undefined, apiUrl: string | undefined): string | null {
  if (!dbUrl || !apiUrl) return null;
  const db = refFromDbUrl(dbUrl);
  const api = refFromApiUrl(apiUrl);
  const apiLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(apiUrl);
  if (db && api && db !== api) return `DATABASE_URL is project ${db} but NEXT_PUBLIC_SUPABASE_URL is project ${api}`;
  if (db && apiLocal) return `DATABASE_URL is project ${db} but NEXT_PUBLIC_SUPABASE_URL is the local stack`;
  return null;
}

// Shared request handling for the records-request importer (admin only, spec 5.12).
import { parseUpload, type Table } from "@216leads/ingest";
import { ApiError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { getUser, isAdmin } from "@/lib/session";

export const COUNTIES = ["cuyahoga", "lake", "medina", "stark", "summit"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

export async function requireAdminApi() {
  const user = await getUser();
  if (!user || !isAdmin(user.email)) throw new ApiError(404, "Not found");
  if (!(await rateLimit(`admin:${user.id}`, 60, 60_000))) throw new ApiError(429, "Too many requests. Wait a minute.");
  return user;
}

export async function readUpload(form: FormData): Promise<{ table: Table; city: string; county: string }> {
  const file = form.get("file");
  const city = String(form.get("city") ?? "").trim();
  const county = String(form.get("county") ?? "cuyahoga");
  if (!(file instanceof File) || !file.size) throw new ApiError(400, "Choose a file");
  if (file.size > MAX_BYTES) throw new ApiError(413, "Files up to 10 MB");
  if (!/^[A-Za-z][A-Za-z .'-]{1,40}$/.test(city)) throw new ApiError(400, "Enter the city or township name");
  if (!(COUNTIES as readonly string[]).includes(county)) throw new ApiError(400, "Unknown county");
  try {
    return { table: await parseUpload(file.name, Buffer.from(await file.arrayBuffer())), city, county };
  } catch (e) {
    throw new ApiError(422, e instanceof Error ? e.message : "Could not read the file");
  }
}

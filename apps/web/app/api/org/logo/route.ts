// POST /api/org/logo: upload the org's logo (PNG, JPEG or WebP, 512 KB max; spec 9.1 step 4).
// GET returns it for the signed-in org's postcard previews. SVG is refused (it can carry script).
import { getSql } from "@216leads/db";
import { ApiError, apiOrg, handle, json } from "@/lib/api";

const MAX = 512 * 1024;

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export const POST = handle(async (req: Request) => {
  const { org } = await apiOrg();
  const form = await req.formData().catch(() => null);
  const file = form?.get("logo");
  if (!(file instanceof Blob)) throw new ApiError(400, "Choose an image file");
  if (file.size > MAX) throw new ApiError(413, "Logo must be 512 KB or smaller");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) throw new ApiError(415, "Use a PNG, JPEG or WebP image");
  const sql = getSql();
  await sql`
    insert into org_logo (org_id, content_type, data) values (${org.id}, ${type}, ${Buffer.from(bytes)})
    on conflict (org_id) do update set content_type = excluded.content_type, data = excluded.data, updated_at = now()`;
  await sql`update org set logo_path = 'db:org_logo' where id = ${org.id}`;
  return json({ ok: true });
});

export const GET = handle(async () => {
  const { org } = await apiOrg();
  const [row] = await getSql()<{ content_type: string; data: Buffer }[]>`
    select content_type, data from org_logo where org_id = ${org.id}`;
  if (!row) throw new ApiError(404, "No logo yet");
  return new Response(new Uint8Array(row.data), {
    headers: { "Content-Type": row.content_type, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" },
  });
});

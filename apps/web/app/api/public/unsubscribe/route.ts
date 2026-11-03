// Digest unsubscribe (spec 12 List-Unsubscribe). The link is signed for one org + address, so it
// works without signing in. GET (a click) and POST (one-click from the mail app) both remove it.
import { getSql } from "@216leads/db";
import { readUnsubscribeToken } from "@216leads/email";
import { BRAND } from "@216leads/shared";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

async function unsubscribe(req: Request): Promise<boolean> {
  if (!(await rateLimit(`unsub:${clientIp(req)}`, 30, 60 * 60_000))) return false;
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const v = readUnsubscribeToken(t.slice(0, 600));
  if (!v) return false;
  const sql = getSql();
  if (v.stream === "lifecycle") {
    await sql`insert into email_optout (email, stream) values (${v.email}, 'lifecycle') on conflict do nothing`;
    return true;
  }
  const [org] = await sql<{ emails: string[] }[]>`select digest_emails::text[] as emails from org where id = ${v.orgId}`;
  if (!org) return false;
  // An empty list means "the owners"; turn it into the owners minus this address so it sticks.
  let emails = org.emails;
  if (!emails.length) {
    const owners = await sql<{ email: string }[]>`
      select u.email::text from org_member m join auth.users u on u.id = m.user_id where m.org_id = ${v.orgId} and m.role = 'owner'`;
    emails = owners.map((o) => o.email);
  }
  const rest = emails.filter((e) => e.toLowerCase() !== v.email);
  await sql`
    update org set digest_emails = ${rest}::citext[], digest_enabled = digest_enabled and ${rest.length > 0} where id = ${v.orgId}`;
  return true;
}

function page(ok: boolean) {
  const msg = ok
    ? "You're off this list. Email about your own account (sign-in, billing) still comes through."
    : "This unsubscribe link isn't valid. Reply to the digest and we'll take you off by hand.";
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title>
<body style="font-family:system-ui,sans-serif;background:#F7F5F0;color:#0F2A44;padding:40px 16px"><main style="max-width:480px;margin:auto;background:#fff;border-radius:12px;padding:24px">
<h1 style="font-size:20px">${ok ? "You're unsubscribed" : "Link not valid"}</h1><p>${msg}</p><p style="font-size:12px;color:#4A5563">${BRAND.footerAddress}</p></main></body>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  return page(await unsubscribe(req));
}

export async function POST(req: Request) {
  const ok = await unsubscribe(req);
  return new Response(null, { status: ok ? 204 : 400 });
}

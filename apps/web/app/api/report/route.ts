// "Report a problem" (DevOps addendum D6): emails support with the page URL, org id and user id
// so the report can become a GitHub issue. Signed-in users only; rate limited.
import { z } from "zod";
import { sendOpsEmail } from "@216leads/ingest";
import { ApiError, body, handle, json } from "@/lib/api";
import { getOrgContext, getUser } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  message: z.string().trim().min(3).max(4000),
  page: z.string().max(500),
});

export const POST = handle(async (req: Request) => {
  const user = await getUser();
  if (!user) throw new ApiError(401, "Sign in first");
  if (!(await rateLimit(`report:${user.id}`, 5, 60 * 60_000))) throw new ApiError(429, "Thanks. We already have a few reports from you this hour.");
  const ctx = await getOrgContext();
  const { message, page } = await body(req, Body);
  const r = await sendOpsEmail({
    subject: `Problem report: ${message.slice(0, 60).replace(/\s+/g, " ")}`,
    text: [
      message,
      "",
      `Page: ${page}`,
      `Org: ${ctx?.org.id ?? "(no org yet)"} ${ctx ? `(${ctx.org.name})` : ""}`,
      `User: ${user.id}`,
      `Reply to: ${user.email}`,
      `Browser: ${req.headers.get("user-agent") ?? "unknown"}`,
      "",
      "Turn this into a GitHub issue with the Bug template.",
    ].join("\n"),
    to: process.env.SUPPORT_EMAIL ? [process.env.SUPPORT_EMAIL] : undefined,
  });
  return json({ ok: true, via: r.via });
});

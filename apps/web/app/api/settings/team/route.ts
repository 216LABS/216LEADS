// GET /api/settings/team (members + open invites), POST (invite by email, owner only) and
// DELETE ?invite=<id> (cancel an open invite) or ?member=<user id> (remove someone), owner only (issue #79).
// The invite link is shown to the owner to share; invite emails come with the email provider (M6).
import { z } from "zod";
import { getSql } from "@216leads/db";
import { createInvite, listTeam, removeMember, revokeInvite } from "@216leads/ingest";
import { planLimits } from "@216leads/shared";
import { ApiError, apiOrg, body, handle, json } from "@/lib/api";
import { sendInvite } from "@/lib/email";

export const GET = handle(async () => {
  const { org } = await apiOrg();
  return json(await listTeam(getSql(), org.id));
});

export const POST = handle(async (req: Request) => {
  const { org, role } = await apiOrg();
  if (role !== "owner") throw new ApiError(403, "Only the account owner can invite people");
  const { email } = await body(req, z.object({ email: z.string().trim().toLowerCase().max(254, "That email address is too long").email() }));
  const sql = getSql();
  const team = await listTeam(sql, org.id);
  if (team.members.some((m) => m.email.toLowerCase() === email)) throw new ApiError(409, "They're already on your team");
  const seats = planLimits(org.plan).users;
  if (team.members.length + team.invites.filter((i) => i.email !== email).length >= seats) {
    throw new ApiError(402, `Your plan includes ${seats} user${seats === 1 ? "" : "s"}. Upgrade to add more.`);
  }
  const inv = await createInvite(sql, org.id, email);
  await sendInvite(org.id, org.name, inv.email, `/invite/${inv.token}`, inv.id, inv.token);
  return json({ invite: { email: inv.email, path: `/invite/${inv.token}` } }, 201);
});

export const DELETE = handle(async (req: Request) => {
  const { org, role, user } = await apiOrg();
  if (role !== "owner") throw new ApiError(403, "Only the account owner can change the team");
  const q = new URL(req.url).searchParams;
  if (q.has("member")) {
    const id = z.string().uuid().parse(q.get("member"));
    if (id === user.id) throw new ApiError(422, "You can't remove yourself");
    if (!(await removeMember(getSql(), org.id, id))) throw new ApiError(404, "They're not on your team, or they're an owner");
    return json({ ok: true });
  }
  const id = z.string().uuid().parse(q.get("invite"));
  if (!(await revokeInvite(getSql(), org.id, id))) throw new ApiError(404, "That invite was already used or canceled");
  return json({ ok: true });
});

import { getSql } from "@216leads/db";
import { listTeam } from "@216leads/ingest";
import { countOf, planLimits } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { SettingsHeader } from "@/components/settings-bits";
import { Card } from "@/components/ui";
import { InviteForm, TeamRemove } from "./invite-form";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { org, role } = await requireOrg();
  const { members, invites } = await listTeam(getSql(), org.id);
  const seats = planLimits(org.plan).users;
  return (
    <>
      {/* Open invites hold a seat too, so count them here; otherwise "1 of 2" and "plan is full" disagree. */}
      <SettingsHeader title="Team" sub={`${members.length + invites.length} of ${countOf(seats, "seat")} used on your plan${invites.length ? ` (${countOf(invites.length, "open invite")})` : ""}.`} />
      <div className="space-y-4">
        <Card className="divide-y divide-line">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="font-semibold">{m.email}</span>
              <span className="flex items-center gap-3 capitalize text-slate">{m.role}
                {role === "owner" && m.role !== "owner" ? <TeamRemove query={`member=${m.user_id}`} label={`Remove ${m.email}`}>Remove</TeamRemove> : null}
              </span>
            </div>
          ))}
          {invites.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>{i.email}</span>
              <span className="flex items-center gap-3 text-slate">Invited
                {role === "owner" ? <TeamRemove query={`invite=${i.id}`} label={`Cancel invite for ${i.email}`}>Cancel</TeamRemove> : null}
              </span>
            </div>
          ))}
        </Card>
        {role === "owner" ? <InviteForm /> : <p className="text-sm text-slate">Only the account owner can invite people.</p>}
      </div>
    </>
  );
}

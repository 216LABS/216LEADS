import { withBase } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { SettingsHeader } from "@/components/settings-bits";
import { Card } from "@/components/ui";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

// Issue #72: the Settings "Account" group had no page for the person themselves.
export default async function AccountPage() {
  const { user, org, role } = await requireOrg();
  return (
    <>
      <SettingsHeader title="Your account" />
      <div className="space-y-4">
        <Card className="divide-y divide-line">
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-slate">Email</span>
            <span className="font-semibold">{user.email}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-slate">Business</span>
            <span className="font-semibold">{org.name}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-slate">Role</span>
            <span className="font-semibold capitalize">{role}</span>
          </div>
        </Card>
        <PasswordForm />
        <Card className="flex items-center justify-between gap-3 p-5">
          <span className="text-sm">Sign out on this device.</span>
          <form action={withBase("/auth/signout")} method="post">
            <button className="focus-ring tap rounded-[6px] border border-line px-4 text-sm font-semibold hover:bg-paper">Sign out</button>
          </form>
        </Card>
      </div>
    </>
  );
}

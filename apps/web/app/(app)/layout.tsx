import { AppShell } from "@/components/app-shell";
import { AccountBanner } from "@/components/account-banner";
import { TermsBanner } from "@/components/terms-banner";
import { needsAcceptance } from "@/lib/legal";
import { isAdmin, requireOrg } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { org, user } = await requireOrg();
  const terms = await needsAcceptance(user.id).catch(() => false);
  return (
    <AppShell orgName={org.name} trade={org.trade} isAdmin={isAdmin(user.email)} banner={<>{terms ? <TermsBanner /> : null}<AccountBanner org={org} /></>}
      locked={org.billing_state === "locked" || org.billing_state === "canceled" ? org.billing_state : null}>
      {children}
    </AppShell>
  );
}

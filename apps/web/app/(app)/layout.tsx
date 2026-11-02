import { AppShell } from "@/components/app-shell";
import { AccountBanner } from "@/components/account-banner";
import { isAdmin, requireOrg } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { org, user } = await requireOrg();
  return (
    <AppShell orgName={org.name} trade={org.trade} isAdmin={isAdmin(user.email)} banner={<AccountBanner org={org} />}>
      {children}
    </AppShell>
  );
}

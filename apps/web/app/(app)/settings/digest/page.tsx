import { requireOrg } from "@/lib/session";
import { SettingsHeader } from "@/components/settings-bits";
import { DigestForm } from "./digest-form";

export const metadata = { title: "Digest and return address" };

export default async function DigestPage() {
  const { org, user, role } = await requireOrg();
  return (
    <>
      <SettingsHeader title="Digest and return address" />
      <DigestForm
        canEdit={role === "owner"}
        initial={{
          digest_enabled: org.digest_enabled, digest_day: org.digest_day,
          digest_emails: org.digest_emails.length ? org.digest_emails : [user.email],
          return_address: org.return_address as never,
        }}
      />
    </>
  );
}

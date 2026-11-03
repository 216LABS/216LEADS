import Link from "next/link";
import { redirect } from "next/navigation";
import { getDirectSql } from "@216leads/db";
import { acceptInvite, type AcceptResult } from "@216leads/ingest";
import { getUser } from "@/lib/session";
import { Logo } from "@/components/logo";
import { Card, LinkButton } from "@/components/ui";

export const metadata = { title: "Join your team" };

const MESSAGE: Record<Exclude<AcceptResult, "joined" | "already_member">, string> = {
  invalid: "This invite link has expired or was already used. Ask the account owner for a new one.",
  wrong_email: "This invite is for a different email address. Sign in with the address the invite was sent to.",
  has_other_org: "Your account already belongs to another business. Sign up with a different email to join this team.",
};

// Accept a team invite (spec 13: the owner invites members). Signed-out visitors sign up or in first.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getUser();
  if (!user) redirect(`/signup?next=${encodeURIComponent(`/invite/${token}`)}`);
  const { result } = await acceptInvite(getDirectSql(), token, user);
  if (result === "joined" || result === "already_member") redirect("/leads");
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Logo />
      <Card className="mt-6 p-5">
        <h1 className="text-lg font-semibold">We couldn&rsquo;t add you to the team</h1>
        <p className="mt-2 text-sm text-slate">{MESSAGE[result]}</p>
        <div className="mt-4 flex gap-3">
          <LinkButton href="/login" variant="secondary">Sign in</LinkButton>
          <Link href="/" className="focus-ring self-center text-sm font-semibold text-navy underline">Home</Link>
        </div>
      </Card>
    </div>
  );
}

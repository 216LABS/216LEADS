"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@216leads/shared";
import { Button, Card, Input, Label } from "@/components/ui";

export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card className="p-5">
      <form onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setLink(null);
        const res = await fetch(withBase("/api/settings/team"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
        const data = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) return setError(data.issues?.[0]?.message ?? data.error ?? "Could not invite");
        setLink(`${window.location.origin}${withBase(data.invite.path)}`);
        setEmail("");
        router.refresh();
      }}>
        <Label htmlFor="invite">Invite by email</Label>
        <div className="flex gap-2">
          <Input id="invite" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="crew@yourbusiness.com" />
          <Button type="submit" variant="navy" disabled={busy}>Invite</Button>
        </div>
      </form>
      {error ? <p role="alert" className="mt-2 text-sm text-lost">{error}</p> : null}
      {link ? (
        <div className="mt-3 rounded-[10px] bg-navy-50 p-3 text-sm" role="status">
          <p className="font-semibold">Send them this link (good for 14 days):</p>
          <p className="num mt-1 break-all">{link}</p>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Issue #79: cancel an open invite (it holds a seat) or take someone off the team.
 * `query` is "invite=<id>" or "member=<user id>".
 */
export function TeamRemove({ query, label, children }: { query: string; label: string; children: React.ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" disabled={busy} aria-label={label} className="focus-ring text-navy underline underline-offset-2"
        onClick={async () => {
          if (query.startsWith("member=") && !window.confirm(`${label}? They lose access right away.`)) return;
          setBusy(true);
          setError(null);
          const res = await fetch(withBase(`/api/settings/team?${query}`), { method: "DELETE" });
          setBusy(false);
          if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not change the team");
          router.refresh();
        }}>
        {children}
      </button>
      {error ? <span role="alert" className="text-lost">{error}</span> : null}
    </>
  );
}

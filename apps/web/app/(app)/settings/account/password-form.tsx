"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button, Card, Input, Label } from "@/components/ui";

const MIN = 8;

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card className="p-5">
      <form onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        if (password.length < MIN) return setMsg({ ok: false, text: `Use at least ${MIN} characters.` });
        if (password !== confirm) return setMsg({ ok: false, text: "The two passwords don't match." });
        setBusy(true);
        const { error } = await supabaseBrowser().auth.updateUser({ password });
        setBusy(false);
        if (error) return setMsg({ ok: false, text: error.message });
        setPassword("");
        setConfirm("");
        setMsg({ ok: true, text: "Password changed. Use it next time you sign in." });
      }}>
        <h2 className="font-semibold">Change password</h2>
        <p className="mt-1 text-sm text-slate">Signed in with a link or Google? Setting a password here lets you sign in with it too.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="confirm-password">Type it again</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <Button type="submit" variant="navy" className="mt-3" disabled={busy}>{busy ? "Saving..." : "Change password"}</Button>
      </form>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-won" : "text-lost"}`}>{msg.text}</p> : null}
    </Card>
  );
}

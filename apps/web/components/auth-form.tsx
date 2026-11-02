"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { withBase } from "@216leads/shared";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button, Input, Label } from "./ui";

export function AuthForm({ mode, googleEnabled }: { mode: "login" | "signup"; googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || (mode === "signup" ? "/onboarding" : "/leads");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [sent, setSent] = useState(false);
  const [useLink, setUseLink] = useState(false);

  const redirectTo = () => `${window.location.origin}${withBase("/auth/callback")}?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    try {
      if (useLink) {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        setSent(true);
        return;
      }
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
  }

  if (sent) {
    return (
      <div className="card p-6 text-center">
        <h2 className="text-lg font-bold">Check your email</h2>
        <p className="mt-2 text-sm text-slate">
          We sent a sign-in link to <span className="font-semibold text-navy">{email}</span>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div>
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {!useLink ? (
        <div>
          <Label htmlFor="password" hint={mode === "signup" ? "8+ characters" : undefined}>Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      ) : null}
      {mode === "signup" ? (
        <label className="flex items-start gap-2 text-sm text-slate">
          <input type="checkbox" required name="terms" className="mt-1 h-4 w-4 accent-navy" />
          <span>By starting your trial you agree to the <Link href="/terms" className="font-semibold text-navy underline">terms</Link> and <Link href="/privacy" className="font-semibold text-navy underline">privacy policy</Link>.</span>
        </label>
      ) : null}
      {error ? <p role="alert" className="rounded-[10px] bg-lost-50 px-3 py-2 text-sm text-lost">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "One moment…" : useLink ? "Email me a sign-in link" : mode === "signup" ? "Create account" : "Sign in"}
      </Button>
      <button type="button" onClick={() => setUseLink(!useLink)} className="focus-ring w-full text-center text-sm font-semibold text-slate underline underline-offset-2 hover:text-navy">
        {useLink ? "Use a password instead" : "Email me a link instead"}
      </button>
      {googleEnabled ? (
        <Button type="button" variant="secondary" className="w-full" onClick={google}>
          Continue with Google
        </Button>
      ) : null}
      <p className="text-center text-sm text-slate">
        {mode === "signup" ? (
          <>Have an account? <Link className="font-semibold text-navy underline" href="/login">Sign in</Link></>
        ) : (
          <>New here? <Link className="font-semibold text-navy underline" href="/signup">Start a free trial</Link></>
        )}
      </p>
    </form>
  );
}

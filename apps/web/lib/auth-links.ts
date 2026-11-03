// Shared by the server auth callback and the browser sign-in form (issue #70).

/**
 * `next` from a sign-in link, kept only when it is a path on this site. "//host" and "/\host"
 * are read by browsers as another host, and anything without a leading "/" is a full URL.
 */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return /[\u0000-\u001f]/.test(next) ? fallback : next;
}

const PLAIN: [RegExp, string][] = [
  [/code verifier|code challenge|both auth code and code verifier/i, "This link has to be opened in the same browser you signed up in. Open it there, or request a new link below."],
  [/expired|invalid.*(link|token|otp|grant)|otp_expired|flow state not found/i, "This link has expired or was already used. Request a new link below."],
  [/invalid login credentials/i, "That email and password don't match. Try again, or use \"Email me a link instead\"."],
  [/email not confirmed/i, "Confirm your email first: open the link we sent you, or request a new one below."],
  [/user already registered/i, "There's already an account with this email. Sign in instead."],
  [/rate limit|too many requests|security purposes/i, "Too many tries. Wait a minute, then try again."],
  [/password should|weak password|password is too/i, "Pick a longer password: 8 or more characters, not a common one."],
];

/** A plain sentence for a Supabase auth error; unknown errors get a generic line, never the raw text. */
export function authErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return PLAIN.find(([re]) => re.test(raw))?.[1] ?? "We couldn't sign you in. Try again, or request a new link below.";
}

import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";

/** Magic-link and OAuth return: exchange the code for a session cookie. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") || "/leads";
  const [safePath, safeQuery = ""] = (next.startsWith("/") && !next.startsWith("//") ? next : "/leads").split("?");
  // Cloning nextUrl keeps the base path (/homesignal in production) on every redirect.
  const to = (pathname: string, search = "") => {
    const u = req.nextUrl.clone();
    u.pathname = pathname;
    u.search = search;
    return u;
  };
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(to(safePath!, safeQuery ? `?${safeQuery}` : ""));
    return NextResponse.redirect(to("/login", `?error=${encodeURIComponent(error.message)}`));
  }
  return NextResponse.redirect(to("/login"));
}

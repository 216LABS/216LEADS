import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { safeNext } from "@/lib/auth-links";
import { appUrl } from "@/lib/urls";

/** Magic-link and OAuth return: exchange the code for a session cookie. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const safe = safeNext(req.nextUrl.searchParams.get("next"), "/leads");
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(appUrl(req, safe));
    return NextResponse.redirect(appUrl(req, `/login?error=${encodeURIComponent(error.message)}`));
  }
  return NextResponse.redirect(appUrl(req, "/login"));
}

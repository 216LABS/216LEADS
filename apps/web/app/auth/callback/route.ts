import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";

/** Magic-link and OAuth return: exchange the code for a session cookie. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/leads";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/leads";
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  return NextResponse.redirect(new URL("/login", url.origin));
}

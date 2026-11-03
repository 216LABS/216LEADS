import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { appUrl } from "@/lib/urls";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(appUrl(req, "/login"), { status: 303 });
}

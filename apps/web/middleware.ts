import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { appUrl } from "@/lib/urls";

const APP_PREFIXES = ["/leads", "/map", "/mail", "/roi", "/settings", "/onboarding", "/admin", "/fix-list", "/help"];

/** Refresh the Supabase session cookie and keep signed-out users out of the app. */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  if (!data.user && APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    // nextUrl.pathname has the base path stripped; appUrl adds it back on the public origin.
    return NextResponse.redirect(appUrl(req, `/login?next=${encodeURIComponent(path + req.nextUrl.search)}`));
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|api/webhooks|api/cron|api/public|api/health).*)"],
};

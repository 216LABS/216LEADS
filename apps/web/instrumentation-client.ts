// Browser Sentry (D3), loaded after the page is interactive and only when a DSN is set, so the
// SDK stays off the critical path (M12 Lighthouse) and out of the bundle users download without one.
import type * as SentryNs from "@sentry/nextjs";
import { sentryOptions } from "./sentry.options";

let sentry: typeof SentryNs | null = null;

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const load = () =>
    import("@sentry/nextjs").then((s) => {
      s.init(sentryOptions("client"));
      sentry = s;
    });
  if (typeof window !== "undefined" && "requestIdleCallback" in window) window.requestIdleCallback(() => void load());
  else setTimeout(() => void load(), 1);
}

export function onRouterTransitionStart(...args: Parameters<typeof SentryNs.captureRouterTransitionStart>) {
  sentry?.captureRouterTransitionStart(...args);
}

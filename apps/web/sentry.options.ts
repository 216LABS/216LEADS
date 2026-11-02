// Shared Sentry options (DevOps addendum D3). With no DSN, Sentry stays off.
// Free Developer plan: 5k errors/month, so client errors are sampled down and noisy
// browser errors are dropped before they reach the quota.
import type * as Sentry from "@sentry/nextjs";
import { appEnv } from "@216leads/shared";

type Options = NonNullable<Parameters<typeof Sentry.init>[0]>;

export function sentryOptions(side: "server" | "edge" | "client"): Options {
  const dsn = side === "client" ? process.env.NEXT_PUBLIC_SENTRY_DSN : process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: appEnv(), // production | staging | local: staging is its own Sentry environment
    release: process.env.NEXT_PUBLIC_RELEASE || undefined,
    sampleRate: side === "client" ? 0.25 : 1,
    tracesSampleRate: appEnv() === "production" ? 0.02 : 0,
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      /^AbortError/,
      /Loading chunk \d+ failed/,
    ],
    beforeSend(event) {
      // Never send user emails to Sentry; ids are enough to find an account.
      if (event.user) delete event.user.email;
      return event;
    },
  };
}

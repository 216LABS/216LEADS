// Sentry for the ingest worker (D3). Off unless SENTRY_DSN is set.
import * as Sentry from "@sentry/node";
import { optionalEnv } from "@216leads/db";
import { appEnv } from "@216leads/shared";

let on = false;

export function initSentry(): void {
  const dsn = optionalEnv("SENTRY_DSN");
  if (!dsn || on) return;
  Sentry.init({
    dsn,
    environment: appEnv(),
    release: optionalEnv("GIT_SHA") ?? optionalEnv("FLY_IMAGE_REF") ?? undefined,
  });
  Sentry.setTag("service", "ingest");
  on = true;
}

export async function reportError(e: unknown, context: Record<string, unknown> = {}): Promise<void> {
  if (!on) return;
  Sentry.captureException(e, { extra: context });
  await Sentry.flush(5000);
}

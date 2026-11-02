import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./sentry.options";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") Sentry.init(sentryOptions("server"));
  if (process.env.NEXT_RUNTIME === "edge") Sentry.init(sentryOptions("edge"));
}

export const onRequestError = Sentry.captureRequestError;

// Issue #72: a bad Stripe or Lob key showed people "Something went wrong" and left nothing in the
// log saying which service failed. Name the service and the kind of failure, in the response and the log.

export interface ProviderFailure {
  status: number;
  /** Shown to the person. */
  message: string;
  /** One line for the server log: service, error type, HTTP status. */
  log: string;
}

const CONFIG = "We've been told and are fixing it. Please try again later.";

export function providerFailure(e: unknown): ProviderFailure | null {
  if (!(e instanceof Error)) return null;
  const err = e as Error & { type?: string; rawType?: string; statusCode?: number; code?: string };
  // Stripe SDK errors: StripeAuthenticationError, StripeCardError, StripeInvalidRequestError...
  if (typeof err.type === "string" && err.type.startsWith("Stripe")) {
    const log = `stripe ${err.type}${err.code ? ` ${err.code}` : ""} ${err.statusCode ?? ""}: ${err.message}`.trim();
    if (err.type === "StripeAuthenticationError" || err.type === "StripePermissionError") {
      return { status: 503, message: `Billing isn't working right now (our Stripe setup was rejected). ${CONFIG}`, log };
    }
    if (err.type === "StripeCardError") return { status: 402, message: err.message, log };
    if (err.type === "StripeRateLimitError" || err.type === "StripeConnectionError" || err.type === "StripeAPIError") {
      return { status: 503, message: "Stripe didn't answer. Try again in a minute.", log };
    }
    return { status: 502, message: `Stripe couldn't do that (${err.type.replace(/^Stripe/, "").replace(/Error$/, "")}). ${CONFIG}`, log };
  }
  // Lob calls throw "Lob <status>: <body>" (packages/ingest/src/mail/provider.ts).
  const lob = /^Lob (\d{3}):/.exec(err.message);
  if (lob) {
    const status = Number(lob[1]);
    const log = `lob ${err.message.slice(0, 300)}`;
    if (status === 401 || status === 403) {
      return { status: 503, message: `Postcard printing isn't working right now (our Lob setup was rejected). ${CONFIG}`, log };
    }
    if (status === 422) return { status: 422, message: "Lob couldn't print this postcard. Check the address and design, then try again.", log };
    return { status: 503, message: "Lob didn't answer. Try again in a minute.", log };
  }
  return null;
}

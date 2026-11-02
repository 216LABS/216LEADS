// Print-and-mail providers (spec 10.1). Lob is the default; PostGrid sits behind the same
// interface; the dry-run provider records pieces locally and never contacts anything (decision 12).
// Live mail is refused: Lob and PostGrid run with test keys only until launch.
import { createHmac, timingSafeEqual } from "node:crypto";
import { optionalEnv } from "@216leads/db";
import { assertKeyAllowed, isLiveKey } from "@216leads/shared";

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface CreatePostcard {
  idempotencyKey: string;
  to: Address;
  from: Address;
  frontHtml: string;
  backHtml: string;
  size: "4x6" | "6x9";
  /** ISO time; the piece can be canceled until then (spec 10.2: now + 15 min). */
  sendDate?: string;
  description?: string;
}

export interface MailEvent {
  providerId: string;
  /** submitted | mailed | in_transit | delivered | re_routed | returned | canceled | unknown */
  status: string;
  at: string;
  raw: string;
}

export interface MailProvider {
  name: "lob" | "postgrid" | "dryrun";
  createPostcard(p: CreatePostcard): Promise<{ id: string; expectedDelivery?: string; costCents?: number }>;
  cancel(id: string): Promise<void>;
  /** A proof PDF (test mode, never mailed) or null when the provider can't make one. */
  proof(p: Omit<CreatePostcard, "idempotencyKey" | "sendDate">): Promise<{ pdfUrl: string } | null>;
  verifyWebhook(raw: string, headers: Headers): MailEvent | null;
}

export class LiveMailRefusedError extends Error {
  constructor(provider: string) {
    super(`${provider}: live mail is refused in this build. Use a test key (decision 12).`);
  }
}

/** Lob postcard event types -> our statuses (spec 10.2). */
const LOB_STATUS: Record<string, string> = {
  "postcard.created": "submitted", "postcard.rendered_pdf": "submitted", "postcard.rendered_thumbnails": "submitted",
  "postcard.mailed": "mailed", "postcard.in_transit": "in_transit", "postcard.in_local_area": "in_transit",
  "postcard.processed_for_delivery": "delivered", "postcard.delivered": "delivered", "postcard.re-routed": "re_routed",
  "postcard.returned_to_sender": "returned", "postcard.deleted": "canceled",
};

const lobAddress = (a: Address) => ({
  name: a.name, address_line1: a.line1, ...(a.line2 ? { address_line2: a.line2 } : {}),
  address_city: a.city, address_state: a.state, address_zip: a.zip, address_country: "US",
});

export function lobProvider(key: string): MailProvider {
  if (isLiveKey("lob", key) || (optionalEnv("LOB_ENV") ?? "test") === "live") throw new LiveMailRefusedError("lob");
  assertKeyAllowed("lob", key);
  const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
  async function call<T>(method: string, path: string, body?: unknown, idem?: string): Promise<T> {
    const res = await fetch(`https://api.lob.com/v1${path}`, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json", ...(idem ? { "Idempotency-Key": idem } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Lob ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }
  const payload = (p: Omit<CreatePostcard, "idempotencyKey">) => ({
    description: p.description, to: lobAddress(p.to), from: lobAddress(p.from), front: p.frontHtml, back: p.backHtml,
    size: p.size, use_type: "marketing", ...(p.sendDate ? { send_date: p.sendDate } : {}),
  });
  return {
    name: "lob",
    async createPostcard(p) {
      const r = await call<{ id: string; expected_delivery_date?: string }>("POST", "/postcards", payload(p), p.idempotencyKey);
      return { id: r.id, expectedDelivery: r.expected_delivery_date };
    },
    async cancel(id) {
      await call("DELETE", `/postcards/${encodeURIComponent(id)}`);
    },
    async proof(p) {
      // A test-mode postcard is Lob's proof: it renders a PDF and is never printed.
      const r = await call<{ url?: string }>("POST", "/postcards", payload(p));
      return r.url ? { pdfUrl: r.url } : null;
    },
    verifyWebhook(raw, headers) {
      const secret = optionalEnv("LOB_WEBHOOK_SECRET");
      const sig = headers.get("lob-signature") ?? "";
      const ts = headers.get("lob-signature-timestamp") ?? "";
      if (!secret || !sig || !ts) return null;
      const want = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
      if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
      const ev = JSON.parse(raw) as { event_type?: { id?: string }; body?: { id?: string }; date_created?: string };
      const type = ev.event_type?.id ?? "";
      if (!ev.body?.id) return null;
      return { providerId: ev.body.id, status: LOB_STATUS[type] ?? "unknown", at: ev.date_created ?? new Date().toISOString(), raw: type };
    },
  };
}

/**
 * PostGrid fallback (spec 10.2), test keys only. Not exercised against PostGrid's API in this
 * build (decision 62); webhooks from PostGrid are not accepted yet.
 */
export function postgridProvider(key: string): MailProvider {
  if (isLiveKey("postgrid", key)) throw new LiveMailRefusedError("postgrid");
  const contact = (a: Address) => ({
    firstName: a.name, addressLine1: a.line1, addressLine2: a.line2 ?? "", city: a.city, provinceOrState: a.state, postalOrZip: a.zip, countryCode: "US",
  });
  async function call<T>(method: string, path: string, body?: unknown, idem?: string): Promise<T> {
    const res = await fetch(`https://api.postgrid.com/print-mail/v1${path}`, {
      method,
      headers: { "x-api-key": key, "Content-Type": "application/json", ...(idem ? { "Idempotency-Key": idem } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`PostGrid ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }
  return {
    name: "postgrid",
    async createPostcard(p) {
      const r = await call<{ id: string }>("POST", "/postcards", {
        to: contact(p.to), from: contact(p.from), frontHTML: p.frontHtml, backHTML: p.backHtml, size: p.size === "4x6" ? "6x4" : "9x6",
        sendDate: p.sendDate, description: p.description,
      }, p.idempotencyKey);
      return { id: r.id };
    },
    async cancel(id) {
      await call("DELETE", `/postcards/${encodeURIComponent(id)}`);
    },
    async proof() {
      return null;
    },
    verifyWebhook() {
      return null;
    },
  };
}

/** Records pieces locally; ids look like "dry_<uuid>". The default with no provider key. */
export function dryRunProvider(): MailProvider {
  return {
    name: "dryrun",
    async createPostcard(p) {
      const d = new Date(Date.now() + 5 * 86_400_000);
      return { id: `dry_${p.idempotencyKey}`, expectedDelivery: d.toISOString().slice(0, 10), costCents: 0 };
    },
    async cancel() {},
    async proof() {
      return null;
    },
    verifyWebhook() {
      return null;
    },
  };
}

/** MAIL_PROVIDER (lob | postgrid | dryrun); defaults to Lob when a key is set, else dry run. */
export function mailFromEnv(): MailProvider {
  const want = optionalEnv("MAIL_PROVIDER");
  const lob = optionalEnv("LOB_API_KEY");
  const pg = optionalEnv("POSTGRID_API_KEY");
  if ((want === "lob" || !want) && lob) return lobProvider(lob);
  if (want === "postgrid" && pg) return postgridProvider(pg);
  return dryRunProvider();
}

export { LOB_STATUS };

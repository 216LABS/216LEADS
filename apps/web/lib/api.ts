import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrgContext, getUser, type OrgContext, type SessionUser } from "./session";
import { rateLimit } from "./ratelimit";
import { canUseApp, planLimits } from "@216leads/shared";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

/** Resolve the signed-in user's org for an API route; 401/403 otherwise. Applies the 60 req/min limit. */
export async function apiOrg(): Promise<OrgContext> {
  const user = await getUser();
  if (!user) throw new ApiError(401, "Sign in first");
  if (!(await rateLimit(`user:${user.id}`, 60, 60_000))) throw new ApiError(429, "Too many requests. Try again in a minute.");
  const ctx = await getOrgContext();
  if (!ctx) throw new ApiError(403, "Finish onboarding first");
  return ctx;
}

/** apiOrg for paid features (export, mail): 402 while the account is locked or canceled (issue #4). */
export async function apiActiveOrg(): Promise<OrgContext> {
  const ctx = await apiOrg();
  if (!canUseApp(ctx.org.billing_state)) throw new ApiError(402, "Your plan isn't active. Pick a plan in Settings → Billing to keep going.");
  return ctx;
}

/** apiActiveOrg for the map and market tools, which are Pro features (spec 11; the trial has them). */
export async function apiMarketOrg(): Promise<OrgContext> {
  const ctx = await apiActiveOrg();
  if (!planLimits(ctx.org.plan).marketTools) throw new ApiError(403, "The map, neighbor ring and competitor tracker come with Pro. Upgrade in Settings → Billing.");
  return ctx;
}

/** Signed in, org optional (the onboarding wizard runs before the org exists). Same rate limit. */
export async function apiUser(): Promise<{ user: SessionUser; ctx: OrgContext | null }> {
  const user = await getUser();
  if (!user) throw new ApiError(401, "Sign in first");
  if (!(await rateLimit(`user:${user.id}`, 60, 60_000))) throw new ApiError(429, "Too many requests. Try again in a minute.");
  return { user, ctx: await getOrgContext() };
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status);
      if (e instanceof z.ZodError) return json({ error: "Invalid request", issues: e.issues }, 400);
      console.error(e);
      return json({ error: "Something went wrong" }, 500);
    }
  };
}

export async function body<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Expected a JSON body");
  }
  return schema.parse(raw);
}

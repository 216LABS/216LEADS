import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrgContext, getUser, type OrgContext } from "./session";
import { rateLimit } from "./ratelimit";

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
  if (!rateLimit(`user:${user.id}`, 60, 60_000)) throw new ApiError(429, "Too many requests. Try again in a minute.");
  const ctx = await getOrgContext();
  if (!ctx) throw new ApiError(403, "Finish onboarding first");
  return ctx;
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

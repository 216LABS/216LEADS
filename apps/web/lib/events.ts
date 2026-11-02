import "server-only";
import { getSql } from "@216leads/db";

/** Product events (D6). Add a name here and to the `event_name` check in a migration together. */
export type EventName =
  | "signup" | "onboarding_done" | "lead_viewed" | "stage_changed" | "postcard_queued" | "checkout_started" | "subscribed";

/**
 * Record a product event. Never throws: analytics must not break the request that triggered it.
 * Props hold ids and small facts only, never homeowner names or emails.
 */
export async function track(name: EventName, who: { orgId?: string | null; userId?: string | null }, props: Record<string, unknown> = {}) {
  try {
    await getSql()`
      insert into event (name, org_id, user_id, props)
      values (${name}, ${who.orgId ?? null}, ${who.userId ?? null}, ${getSql().json(props as never)})`;
  } catch (e) {
    console.error(`track(${name}) failed`, e);
  }
}

/** Record an event only the first time it happens for this user (e.g. signup). */
export async function trackOnce(name: EventName, who: { orgId?: string | null; userId: string }, props: Record<string, unknown> = {}) {
  try {
    const [seen] = await getSql()`select 1 from event where name = ${name} and user_id = ${who.userId} limit 1`;
    if (!seen) await track(name, who, props);
  } catch (e) {
    console.error(`trackOnce(${name}) failed`, e);
  }
}

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSql } from "@216leads/db";
import { supabaseServer } from "./supabase";

export interface SessionUser {
  id: string;
  email: string;
}

export interface OrgRow {
  id: string;
  name: string;
  trade: string;
  plan: string;
  plan_status: string | null;
  trial_ends_at: string | null;
  payment_failed_at: string | null;
  postcard_credits: number;
  phone: string | null;
  website: string | null;
  default_offer: string | null;
  logo_path: string | null;
  return_address: Record<string, string> | null;
  digest_enabled: boolean;
  digest_emails: string[];
  digest_day: number;
  onboarded_at: string | null;
  coach_marks_seen: boolean;
  stripe_customer_id: string | null;
  streetview_enabled: boolean;
}

export interface OrgContext {
  user: SessionUser;
  org: OrgRow;
  role: string;
}

export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
});

/** The user's org (first membership). Null when they have not finished onboarding step 1. */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const user = await getUser();
  if (!user) return null;
  const sql = getSql();
  const [row] = await sql<(OrgRow & { role: string })[]>`
    select o.id, o.name, o.trade, o.plan, o.plan_status, o.trial_ends_at, o.payment_failed_at, o.postcard_credits, o.phone,
      o.website, o.default_offer, o.logo_path, o.return_address, o.digest_enabled, o.digest_emails::text[] as digest_emails,
      o.digest_day, o.onboarded_at, o.coach_marks_seen, o.stripe_customer_id, o.streetview_enabled, m.role
    from org_member m join org o on o.id = m.org_id
    where m.user_id = ${user.id}
    order by o.created_at limit 1`;
  if (!row) return null;
  const { role, ...org } = row;
  return { user, org, role };
});

/** For app pages: signed in and onboarded, or redirect. */
export async function requireOrg(): Promise<OrgContext> {
  const user = await getUser();
  if (!user) redirect("/login");
  const ctx = await getOrgContext();
  if (!ctx || !ctx.org.onboarded_at) redirect("/onboarding");
  return ctx;
}

export function isAdmin(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

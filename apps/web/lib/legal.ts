// Terms acceptance (issue #3): a row per accepted terms/privacy version pair; no hard lockout.
import { getDirectSql } from "@216leads/db";
import { legalVersions } from "./content";

export async function recordAcceptance(userId: string, orgId: string | null) {
  const v = legalVersions();
  await getDirectSql()`insert into terms_acceptance (user_id, org_id, terms_version, privacy_version) values (${userId}, ${orgId}, ${v.terms}, ${v.privacy})`;
}

/** True when the user hasn't accepted the current versions (shows the one-time banner). */
export async function needsAcceptance(userId: string): Promise<boolean> {
  const v = legalVersions();
  const rows = await getDirectSql()`
    select 1 from terms_acceptance where user_id = ${userId} and terms_version = ${v.terms} and privacy_version = ${v.privacy} limit 1`;
  return rows.length === 0;
}

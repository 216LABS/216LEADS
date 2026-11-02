import "server-only";
// Transactional sends from request handlers. Never fail the request because mail failed.
import { createElement } from "react";
import { getDirectSql } from "@216leads/db";
import { appUrl, Invite, sendEmail, Welcome } from "@216leads/email";

export async function sendWelcome(orgId: string, orgName: string, to: string, leads: number) {
  try {
    await sendEmail(getDirectSql(), {
      orgId, kind: "welcome", dedupeKey: `welcome:${orgId}`, to: [to], subject: "Your 216 Leads list is ready",
      element: createElement(Welcome, { orgName, leads, leadsUrl: appUrl("/leads") }),
    });
  } catch (e) {
    console.error("welcome email failed", e);
  }
}

export async function sendInvite(orgId: string, orgName: string, to: string, path: string, inviteId: string, token: string) {
  try {
    await sendEmail(getDirectSql(), {
      orgId, kind: "invite", dedupeKey: `invite:${inviteId}:${token.slice(0, 8)}`, to: [to], subject: `Join ${orgName} on 216 Leads`,
      element: createElement(Invite, { orgName, inviteUrl: appUrl(path) }),
    });
  } catch (e) {
    console.error("invite email failed", e);
  }
}

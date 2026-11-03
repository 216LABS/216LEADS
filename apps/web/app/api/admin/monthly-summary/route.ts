// GET /api/admin/monthly-summary?org=<id>&month=YYYY-MM (issue #9): preview the summary email for
// any org and month, rendered as it would be sent (nothing is sent).
import { createElement } from "react";
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { MonthlySummary, monthlySummarySubject, renderEmail } from "@216leads/email";
import { monthlySummaryData, previousMonth } from "@216leads/ingest";
import { todayEt } from "@216leads/shared";
import { ApiError, handle } from "@/lib/api";
import { requireAdminApi } from "@/lib/imports";

export const GET = handle(async (req: Request) => {
  await requireAdminApi();
  const q = new URL(req.url).searchParams;
  const org = q.get("org") ?? "";
  const month = q.get("month") ?? previousMonth(todayEt());
  if (!z.string().uuid().safeParse(org).success || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, "Pass org=<id> and month=YYYY-MM");
  const sql = getDirectSql();
  const [exists] = await sql`select 1 from org where id = ${org}`;
  if (!exists) throw new ApiError(404, "Org not found");
  const data = await monthlySummaryData(sql, org, month);
  const { html } = await renderEmail(createElement(MonthlySummary, { ...data, unsubscribeUrl: "#preview" }));
  return new Response(html.replace("<head>", `<head><title>${monthlySummarySubject(data)}</title>`), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
});

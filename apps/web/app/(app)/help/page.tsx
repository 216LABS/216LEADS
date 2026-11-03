import { BRAND } from "@216leads/shared";
import { loadDoc, Markdown } from "@/lib/content";
import { buttonClass, Card, PageHeader } from "@/components/ui";
import { ReportProblem } from "@/components/report-problem";

export const metadata = { title: "Help" };

// Help (issue #7): FAQ from content/help.mdx plus the support contact and the problem report.
export default function HelpPage() {
  const doc = loadDoc("help");
  return (
    <>
      <PageHeader title="Help" />
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <Card className="p-5 md:p-6"><Markdown body={doc.body} /></Card>
        <Card className="h-fit space-y-3 p-5 text-sm">
          <h2 className="font-semibold">Questions?</h2>
          <p>Email <a href={`mailto:${BRAND.supportEmail}`} className="font-semibold text-navy underline">{BRAND.supportEmail}</a>.</p>
          <p className="text-slate">{process.env.SUPPORT_RESPONSE_COPY ?? "We reply within 1 business day."}</p>
          <ReportProblem className={buttonClass("secondary")} />
        </Card>
      </div>
    </>
  );
}

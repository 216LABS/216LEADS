import { PageHeader, Card } from "@/components/ui";

export const metadata = { title: "Admin · Imports" };

export default function ImportsPage() {
  return (
    <>
      <PageHeader title="Records-request imports" sub="Upload monthly ORC 149.43 permit lists from suburbs." />
      <Card className="p-6 text-sm text-slate">The importer arrives in milestone M11.</Card>
    </>
  );
}

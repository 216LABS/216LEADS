import { LegalView, legalMetadata } from "@/components/legal-view";

export const metadata = legalMetadata("refunds");

export default function Page() {
  return <LegalView page="refunds" />;
}

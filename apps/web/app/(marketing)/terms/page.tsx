import { LegalView, legalMetadata } from "@/components/legal-view";

export const metadata = legalMetadata("terms");

export default function Page() {
  return <LegalView page="terms" />;
}

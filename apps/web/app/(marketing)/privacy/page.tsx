import { LegalView, legalMetadata } from "@/components/legal-view";

export const metadata = legalMetadata("privacy");

export default function Page() {
  return <LegalView page="privacy" />;
}

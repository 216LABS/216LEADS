// Timeline titles for public-record events on lead detail (issue #74).

const EVENT_TITLE: Record<string, string> = {
  permit: "Permit", sale: "Sold", violation: "City violation", condemnation: "Condemnation", demolition: "Demolition",
  boardup: "Board-up", rental_registration: "Rental registration", certificate_of_occupancy: "Certificate of occupancy", lead_safe: "Lead-safe certificate",
  disclosure: "Rental disclosure",
};

/** "Lead-safe certificate: Lead safe certificate" reads as a stutter; keep the record type only when it adds something. */
const sameWords = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");
export function eventTitle(kind: string, rawType: string | null): string {
  const title = EVENT_TITLE[kind] ?? kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return rawType && !sameWords(title, rawType) ? `${title}: ${rawType}` : title;
}

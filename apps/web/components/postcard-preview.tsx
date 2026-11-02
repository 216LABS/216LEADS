// Postcard preview (spec 9.5): front headline + back offer, phone, site and the required small
// print. M8's builder reuses it with the real templates; addressing is always "Current Resident".
import { BRAND } from "@216leads/shared";

export function PostcardPreview({ business, headline, offer, phone, website, logoUrl }: {
  business: string; headline: string; offer: string | null; phone: string | null; website: string | null; logoUrl?: string | null;
}) {
  const site = website?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Postcard preview">
      <div className="flex aspect-[3/2] flex-col justify-between rounded-[12px] bg-navy p-4 text-white shadow">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- the org's own uploaded logo, served from our API */}
          {logoUrl ? <img src={logoUrl} alt="" className="h-8 w-8 rounded bg-white object-contain p-0.5" /> : null}
          <span className="text-sm font-semibold">{business}</span>
        </div>
        <p className="text-xl font-bold leading-tight">{headline}</p>
      </div>
      <div className="flex aspect-[3/2] flex-col justify-between rounded-[12px] border border-line bg-white p-4 text-navy shadow">
        <div>
          <p className="font-bold">{offer || "Your offer goes here"}</p>
          <p className="num mt-1 text-sm">{phone || "(216) 555-0100"}</p>
          {site ? <p className="text-sm text-slate">{site}</p> : null}
        </div>
        <div className="flex items-end justify-between gap-3 text-[10px] leading-snug text-slate">
          <span>Based on public records. To stop mail: {BRAND.optoutUrl}</span>
          <span className="shrink-0 rounded border border-line px-2 py-1 text-right">Current Resident<br />address</span>
        </div>
      </div>
    </div>
  );
}

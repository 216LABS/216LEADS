import Script from "next/script";
import { BRAND } from "@216leads/shared";
import { Logo } from "@/components/logo";
import { OptoutForm } from "./optout-form";

export const metadata = { title: "Stop mail to your home" };

// Homeowner opt-out (spec 14, issue #2). Public, no login; printed on every postcard.
export default function OptoutPage() {
  const site = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      {site ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /> : null}
      <Logo />
      <h1 className="mt-6 text-2xl font-bold">Stop mail to your home</h1>
      <p className="mt-2 text-slate">
        Enter your street address and ZIP. No business using {BRAND.name} will mail this address again. We only keep the address, nothing else.
      </p>
      <OptoutForm siteKey={site ?? null} />
      <p className="mt-6 text-xs text-slate">{BRAND.footerAddress}</p>
    </div>
  );
}

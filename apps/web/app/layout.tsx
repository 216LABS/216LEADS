import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Public_Sans } from "next/font/google";
import { EnvBanner } from "@/components/env-banner";
import { COLORS } from "@/lib/theme";
import { siteOrigin } from "@/lib/site";
import "./globals.css";

// Public Sans: the US government's open typeface, for a product built from public records. Its tabular
// figures carry the numbers; JetBrains Mono is only for code.
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-public", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

const description = "Know which homes need you next. Built from public records by 216LABS.";

export const metadata: Metadata = {
  // Absolute URLs in link previews resolve against the public site, not the vercel.app host.
  // Origin only: Next adds the base path to file-based images (opengraph-image) itself.
  metadataBase: new URL(siteOrigin()),
  title: { default: "216 HomeSignal", template: "%s · 216 HomeSignal" },
  description,
  // Metadata URLs don't get the base path automatically.
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg` },
  openGraph: { type: "website", siteName: "216 HomeSignal", title: "216 HomeSignal", description },
  twitter: { card: "summary_large_image", title: "216 HomeSignal", description },
  // Staging and previews stay out of search (robots.ts disallows them too).
  ...(process.env.APP_ENV === "production" ? {} : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = {
  themeColor: COLORS.navy,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <EnvBanner />
        {children}
      </body>
    </html>
  );
}

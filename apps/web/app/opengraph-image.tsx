import { ImageResponse } from "next/og";
import { BRAND } from "@216leads/shared";
import { COLORS } from "@/lib/theme";

// Link preview card for shared links (issue #70 QA). Twitter uses it too (summary_large_image).
export const alt = `${BRAND.name}: ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: COLORS.navy, color: COLORS.paper }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 600 }}>
          {/* The logo mark (components/logo.tsx), drawn in paper on navy. */}
          <svg width="56" height="56" viewBox="0 0 32 32">
            <path d="M4 16 16 5.5 28 16" fill="none" stroke={COLORS.paper} strokeWidth="3" strokeLinecap="square" />
            <rect x="12.5" y="14" width="7" height="7" fill={COLORS.signal} />
            <path d="M7 26.5h18" stroke={COLORS.paper} strokeWidth="3" strokeLinecap="square" />
          </svg>
          <span style={{ opacity: 0.7, fontWeight: 500 }}>216</span>
          <span style={{ marginLeft: -6 }}>HomeSignal</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 72, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1 }}>{BRAND.tagline}</div>
          <div style={{ fontSize: 32, opacity: 0.8 }}>Home leads from public records, for Northeast Ohio trades.</div>
        </div>
        <div style={{ fontSize: 28, opacity: 0.7 }}>{`${BRAND.domain} · by ${BRAND.by}`}</div>
      </div>
    ),
    size,
  );
}

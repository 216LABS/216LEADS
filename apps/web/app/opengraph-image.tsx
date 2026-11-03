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
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: COLORS.signal }} />
          {BRAND.name}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>{BRAND.tagline}</div>
          <div style={{ fontSize: 32, opacity: 0.8 }}>Home leads from public records, for Northeast Ohio trades.</div>
        </div>
        <div style={{ fontSize: 28, opacity: 0.7 }}>{`${BRAND.domain} · by ${BRAND.by}`}</div>
      </div>
    ),
    size,
  );
}

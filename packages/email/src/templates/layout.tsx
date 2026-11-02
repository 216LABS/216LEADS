/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Shared email frame: plain, mobile-first, inline styles only (spec 12). Footer carries the
// postal address and, for the digest, the unsubscribe link.
import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { BRAND } from "@216leads/shared";

export const C = { navy: "#0F2A44", orange: "#F26B1D", paper: "#F7F5F0", slate: "#4A5563", line: "#E3DFD6", won: "#2E7D4F" };
export const font = 'Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export function Layout({ preview, children, unsubscribeUrl }: { preview: string; children: ReactNode; unsubscribeUrl?: string }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: C.paper, fontFamily: font, color: C.navy, margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: 560, backgroundColor: "#ffffff", borderRadius: 12, padding: "24px 20px", border: `1px solid ${C.line}` }}>
          <Text style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>
            216 <span style={{ color: C.orange }}>Leads</span>
          </Text>
          {children}
          <Hr style={{ borderColor: C.line, margin: "24px 0 12px" }} />
          <Section>
            <Text style={{ fontSize: 11, lineHeight: "16px", color: C.slate, margin: 0 }}>{BRAND.disclaimer}</Text>
            <Text style={{ fontSize: 11, lineHeight: "16px", color: C.slate, margin: "8px 0 0" }}>
              {BRAND.footerAddress}
              {unsubscribeUrl ? (
                <>
                  {" · "}
                  <Link href={unsubscribeUrl} style={{ color: C.slate }}>Unsubscribe from this digest</Link>
                </>
              ) : null}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const p = { fontSize: 15, lineHeight: "22px", margin: "0 0 12px", color: C.navy } as const;
export const muted = { fontSize: 13, lineHeight: "19px", margin: "0 0 8px", color: C.slate } as const;
export const button = {
  backgroundColor: C.orange, color: "#ffffff", borderRadius: 10, padding: "12px 18px", fontWeight: 700, fontSize: 15, textDecoration: "none",
  display: "inline-block",
} as const;

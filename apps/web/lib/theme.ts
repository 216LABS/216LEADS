// Brand colors for places CSS classes can't reach (MapLibre paint, SVG attributes, metadata).
// Same values as the tokens in app/globals.css; components use the Tailwind classes instead.
export const COLORS = {
  navy: "#0f2a44",
  signal: "#f26b1d",
  signal600: "#c2410c",
  paper: "#f7f5f0",
  line: "#e3e0d8",
  won: "#2e7d4f",
  lost: "#b42318",
  white: "#ffffff",
  mutedPin: "#8aa1b8",
  permit: "#6d28d9",
  sale: "#0e7490",
  flood: "#2563eb",
  heat: "#fdba74",
} as const;

export const BRAND = {
  name: "216 HomeSignal",
  by: "216LABS",
  tagline: "Know which homes need you next.",
  domain: "216labs.dev/homesignal",
  optoutUrl: "216labs.dev/homesignal/optout",
  footerAddress: "216LABS LLC, 1474 Rosewood Ave, Lakewood, OH 44107",
  /** Support contact (issue #7); SUPPORT_EMAIL overrides it for reply-to. */
  supportEmail: "sam@216labs.dev",
  disclaimer:
    "Built from public records. May be incomplete or out of date. Not a consumer report; do not use for credit, insurance, employment or housing decisions.",
} as const;

/** The 13 v1 trades. `m1` marks the six templates that ship first. */
export const TRADES = [
  { key: "roofing", label: "Roofing", icon: "Home", m1: true },
  { key: "hvac", label: "HVAC", icon: "Fan", m1: true },
  { key: "plumbing", label: "Plumbing", icon: "Droplet", m1: true },
  { key: "electrical", label: "Electrical", icon: "Zap", m1: true },
  { key: "lawn_care", label: "Lawn care", icon: "Sprout", m1: true },
  { key: "tree", label: "Tree service", icon: "TreeDeciduous", m1: true },
  { key: "painting", label: "Painting", icon: "Paintbrush", m1: false },
  { key: "gutters", label: "Gutters", icon: "CloudRain", m1: false },
  { key: "siding", label: "Siding", icon: "PanelsTopLeft", m1: false },
  { key: "remodel", label: "Remodeling", icon: "Hammer", m1: false },
  { key: "pest", label: "Pest control", icon: "Bug", m1: false },
  { key: "septic", label: "Septic", icon: "Container", m1: false },
  { key: "waterproofing", label: "Waterproofing", icon: "Umbrella", m1: false },
] as const;

export type TradeKey = (typeof TRADES)[number]["key"];

export function tradeLabel(key: string): string {
  return TRADES.find((t) => t.key === key)?.label ?? key;
}

export type PlanKey = "trial" | "starter" | "pro" | "exclusive" | "canceled";

export const PLANS = {
  starter: { key: "starter", label: "Starter", monthly: 99, annual: 990, maxZips: 3, credits: 0, users: 1, exclusiveZips: 0, marketTools: false,
    features: ["1 trade, up to 3 zips", "Lead list + Monday digest", "Tracker + CSV export"] },
  pro: { key: "pro", label: "Pro", monthly: 199, annual: 1990, maxZips: 10, credits: 50, users: 2, exclusiveZips: 0, marketTools: true,
    features: ["Up to 10 zips", "Map, neighbor ring, competitor tracker", "Auto-mail + ROI", "50 postcard credits/mo"] },
  exclusive: { key: "exclusive", label: "Exclusive", monthly: 349, annual: 3490, maxZips: 10, credits: 150, users: 4, exclusiveZips: 5, marketTools: true,
    features: ["Everything in Pro", "Your trade locked in up to 5 zips", "150 postcard credits/mo", "4 users"] },
} as const;

export type PaidPlanKey = keyof typeof PLANS;

/** Trial gets Pro features with Starter's zip count so the wizard stays simple. */
export const TRIAL = { days: 14, maxZips: 3, cardCredits: 25 } as const;

export function planLimits(plan: string) {
  if (plan === "starter" || plan === "pro" || plan === "exclusive") return PLANS[plan];
  return { ...PLANS.pro, key: plan, label: plan === "trial" ? "Trial" : "Canceled", maxZips: TRIAL.maxZips, credits: 0 };
}

export const POSTCARD_PRICE_CENTS = 99;
export const MAIL_UNDO_MINUTES = 15;
export const NO_REPEAT_DAYS = 30;
export const CSV_DAILY_ROW_CAP = 2000;
export const MAP_POINT_CAP = 5000;

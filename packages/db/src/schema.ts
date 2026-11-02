// Drizzle mirror of the tenant tables. SQL migrations are the source of truth;
// public-record tables (parcel, parcel_event, ...) are queried with raw SQL because
// most of that work is PostGIS and bulk upserts.
import {
  bigserial, boolean, date, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid,
} from "drizzle-orm/pg-core";

export const leadStatus = pgEnum("lead_status", ["new", "contacted", "quoted", "won", "lost", "skipped"]);
export const LEAD_STATUSES = leadStatus.enumValues;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const tz = (name: string) => timestamp(name, { withTimezone: true });

export const org = pgTable("org", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  trade: text("trade").notNull(),
  logoPath: text("logo_path"),
  phone: text("phone"),
  website: text("website"),
  defaultOffer: text("default_offer"),
  returnAddress: jsonb("return_address").$type<ReturnAddress | null>(),
  stripeCustomerId: text("stripe_customer_id"),
  plan: text("plan").notNull().default("trial"),
  planStatus: text("plan_status"),
  planInterval: text("plan_interval"),
  trialEndsAt: tz("trial_ends_at"),
  paymentFailedAt: tz("payment_failed_at"),
  postcardCredits: integer("postcard_credits").notNull().default(0),
  digestEnabled: boolean("digest_enabled").notNull().default(true),
  digestEmails: text("digest_emails").array().notNull().default([]),
  digestDay: integer("digest_day").notNull().default(1),
  streetviewEnabled: boolean("streetview_enabled").notNull().default(false),
  onboardedAt: tz("onboarded_at"),
  coachMarksSeen: boolean("coach_marks_seen").notNull().default(false),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export type ReturnAddress = { name: string; line1: string; line2?: string; city: string; state: string; zip: string };

export const orgMember = pgTable("org_member", {
  orgId: uuid("org_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role").notNull().default("owner"),
}, (t) => [primaryKey({ columns: [t.orgId, t.userId] })]);

export const orgInvite = pgTable("org_invite", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  token: text("token").notNull(),
  acceptedAt: tz("accepted_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const territory = pgTable("territory", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  kind: text("kind").notNull(),
  zip: text("zip"),
  municipalityId: integer("municipality_id"),
  isExclusive: boolean("is_exclusive").notNull().default(false),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const scoringProfile = pgTable("scoring_profile", {
  orgId: uuid("org_id").primaryKey(),
  templateKey: text("template_key").notNull(),
  templateVersion: integer("template_version").notNull(),
  weights: jsonb("weights").$type<Record<string, number>>().notNull().default({}),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  exclusions: jsonb("exclusions").$type<Record<string, unknown>>().notNull().default({}),
  learnedWeights: jsonb("learned_weights").$type<Record<string, number>>().notNull().default({}),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const orgSuppression = pgTable("org_suppression", {
  orgId: uuid("org_id").notNull(),
  addrNorm: text("addr_norm").notNull(),
  parcelKey: text("parcel_key"),
  reason: text("reason").notNull().default("existing_customer"),
}, (t) => [primaryKey({ columns: [t.orgId, t.addrNorm] })]);

export const lead = pgTable("lead", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  parcelKey: text("parcel_key").notNull(),
  score: integer("score").notNull(),
  reasons: jsonb("reasons").notNull(),
  pitch: text("pitch"),
  triggerEventId: integer("trigger_event_id"),
  triggerLabel: text("trigger_label"),
  triggerDate: date("trigger_date"),
  status: leadStatus("status").notNull().default("new"),
  statusChangedAt: tz("status_changed_at").notNull().defaultNow(),
  firstTouchAt: tz("first_touch_at"),
  wonAmount: integer("won_amount"),
  lostReason: text("lost_reason"),
  visibleFrom: tz("visible_from").notNull().defaultNow(),
  firstSurfacedAt: tz("first_surfaced_at").notNull().defaultNow(),
  lastScoredAt: tz("last_scored_at").notNull().defaultNow(),
  hidden: boolean("hidden").notNull().default(false),
});

export const leadNote = pgTable("lead_note", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  leadId: uuid("lead_id").notNull(),
  authorId: uuid("author_id"),
  body: text("body").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const leadActivity = pgTable("lead_activity", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: uuid("org_id").notNull(),
  leadId: uuid("lead_id"),
  kind: text("kind").notNull(),
  data: jsonb("data").notNull().default({}),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const usageLedger = pgTable("usage_ledger", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: uuid("org_id").notNull(),
  kind: text("kind").notNull(),
  qty: integer("qty").notNull(),
  amountCents: integer("amount_cents"),
  refId: uuid("ref_id"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

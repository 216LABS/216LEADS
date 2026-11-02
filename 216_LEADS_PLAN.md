# 216 HomeSignal: Full Product & Business Plan

Brand, features, UX, architecture, pricing, unit economics, cold-email go-to-market, launch timeline and risks for a NE Ohio public-records lead product for home-service trades. Researched 2026-11-01 (ET).

**Tags:** **[V]** checked live today · **[S]** secondary source or needs confirming · **[J]** my judgment

## Contents

- [Bottom line](#bottom-line)
- [1. Brand](#1-brand)
- [2. Features: v1, v2, later](#2-features-v1-v2-later)
- [3. UI and UX](#3-ui-and-ux)
- [4. Architecture](#4-architecture)
- [5. Turning free messy data into value](#5-turning-free-messy-data-into-value)
- [6. Pricing and packaging](#6-pricing-and-packaging)
- [7. Unit economics and $10K/mo](#7-unit-economics-and-10kmo)
- [8. Getting customers (cold email)](#8-getting-customers-cold-email)
- [9. Onboarding and first week](#9-onboarding-and-first-week)
- [10. Launch timeline](#10-launch-timeline)
- [11. Running costs](#11-running-costs)
- [12. Risks and legal](#12-risks-and-legal)
- [13. Build spec for your coding agent](#13-build-spec-for-your-coding-agent)
- [Sources](#sources)

---

## Bottom line

| Metric | Value | Detail |
|---|---|---|
| Brand | **216 HomeSignal** | by 216LABS; served at 216labs.dev/homesignal |
| Starter / Pro / Exclusive | **$99 / $199 / $349** | + $0.99 postcards [J] |
| Customers for $10K/mo take-home | **~70-80** | ~150 if all Starter [J] |
| To a sellable v1 | **3 weeks** | M1 list in 2 wks, mail in wk 3 [J] |

Search demand for this kind of product is tiny in SEO terms ("permit leads", "new homeowner leads" and "building permit leads" each show about 10 searches/mo; "leads for contractors" 480/mo at a $56.70 CPC) [V]. So the business is won by direct outreach to the ~272 HVAC shops (and similar counts in other trades) around Cleveland [V], with a teaser built from real county numbers. The product wins on three things competitors here don't combine: per-trade "why this home" reasons from permits and city data, a neighbor-ring and competitor tracker built from public permits, and done-for-you postcards with ROI proof from later public permits.

> **Status:** Nothing was sent, posted or bought. DataForSEO spend this round: $0.12 (about $0.95 across all rounds). Your computer is offline; that did not affect this work, which all ran on my box.

---

## 1. Brand

Every name below had its .com checked by RDAP; unregistered means RDAP returned not found [V]. No USPTO search was run directly, so trademark status is unverified [S].

| Name | .com | Notes | Verdict |
|---|---|---|---|
| North Coast Signal | available [V] | Very local, warm. Harder to spell over the phone; limits expansion past NE Ohio | Alternate |
| Keyturn | taken; keyturnleads.com and keyturn.co free [V] | 260 searches/mo for existing use [V]; split brand | Alternate |
| Doorstep Brief / New Owner Brief | available [V] | Nice for the Monday digest; too narrow for the whole app | Use as digest name |
| Leadstoop | available [V] | Cute; reads as generic lead-gen | Pass |
| Doorlist | taken; doorlisthq.com free [V] | Existing brand with 1,900 searches/mo [V] | Pass |
| FirstKnock | taken [V] | Live competitor at firstknock.app selling $0.94 new-homeowner postcards [V] | Pass |
| 216 HomeSignal | served at 216labs.dev/homesignal | Local and memorable for Cleveland; 216 is the city area code. Chosen 2026-11-01 | **Pick** |

- **Name:** 216 HomeSignal, "by 216LABS" in the footer and emails, served at 216labs.dev/homesignal
- **Tagline:** Know which homes need you next.
- **Voice:** Plain, local, a little blunt. Talks like a sharp office manager, not a SaaS deck. Numbers first, no hype words.
- **Colors:** Navy #0F2A44, Signal Orange #F26B1D, Paper #F7F5F0, Slate #4A5563, Green #2E7D4F (won), Red #B42318 (lost)
- **Type:** Inter for UI, JetBrains Mono for addresses and numbers
- **Mark:** House outline with an orange pulse dot at the roof peak
- **Domain:** the product lives at 216labs.dev/homesignal; buy a separate cold-email domain, see section 8

---

## 2. Features: v1, v2, later

| Feature | What it does | Ships |
|---|---|---|
| Trade templates + perfect-customer controls | Pick a trade, tune home age, value, lot, heat type, owner-occupied, towns, exclusions | v1 (6 trades), v1.1 (13) |
| Lead list + "why this home" | Score 0-100 with 3-5 plain reasons, each linked to the public record | v1 |
| Next-job triggers | Just sold (30 days), city citation, neighbors pulling the same permit | v1 |
| Lightweight tracker | New/contacted/quoted/won/lost, notes, swipe actions. Not a Jobber competitor | v1 |
| Monday digest | Top 10 new homes + competitor of the week, 6:00 AM ET | v1 |
| CSV export | Addresses, scores, reasons. Never owner names | v1 |
| Map + layers | Leads, permits, sales, violations, flood; lasso to mail | v2 (week 3) |
| Postcards | Branded template, mail selected or auto-mail new matches via Lob, 15-min undo | v2 (week 3) |
| Neighbor ring | After a job, mail the 20-40 homes around it | v2 |
| Competitor permit tracker | Which roofers/HVAC shops pull permits in your zips, how many, where | v2 |
| Exclusivity | Lock a trade in up to 5 zips; others see shared leads 72 hours later | v2 |
| ROI + attribution | Homes you mailed that later pulled a permit: you won it, or a named competitor did | v3 (weeks 4-6) |
| Heat map | Where permits and sales cluster this quarter | v3 |
| Violations fix list | Open Cleveland code citations mapped to your trade | v3 |
| Learned weights | Won/lost outcomes nudge each signal's weight (0.8x to 1.25x) | v3 |
| Records-request importer | Monthly ORC 149.43 results from suburbs as CSV/XLSX/PDF | v3 |
| Later | Storm-event mode, QR call tracking, multi-trade bundles, partner referrals, Akron/Summit full coverage | Later |

Per-trade signals that the data supports today [V for fields, J for weights]: roofing uses years since the last roof permit, home age, tree canopy and the 2022 Cleveland roof-condition survey; HVAC uses last mechanical permit and "no gas line" (8,777 single-family Cuyahoga homes, a heat-pump pitch); lawn care and tree use county grass and canopy percentages per parcel; septic uses sewer type; plumbing and electrical lean on pre-1950 construction (840 of October's 1,190 sales were built before 1960).

---

## 3. UI and UX

Mobile first, because owners check leads in the truck. Bottom tabs: Leads, Map, Mail, ROI, Settings. Lessons from competitors [V from reviews and feature pages]: PropStream's 165+ filters read as cluttered on mobile, so keep 6 controls; DealMachine's daily smart lists, cost preview before mailing and prepaid wallet are worth copying; Tradepost's ROI slider sells the plan.

1. **Onboarding, 5 steps, under 3 minutes.** Trade tile, then zips/towns with live counts ("44107: 214 homes match") and exclusive badges, then perfect-customer controls with a live 5-home preview, then logo/phone/offer, then plan. No card for the trial.
2. **Lead list.** Cards with address, score chip, trigger pill ("Sold 6 days ago"), two reasons, status. Swipe right = contacted, left = skip. Desktop gets a table with bulk mail and export.
3. **Map.** Score-colored pins, layer toggles, lasso to mail, tap a won job for the neighbor ring.
4. **Lead detail.** "Why this home" with links to the city permit page, suggested pitch with copy button, facts grid, full public timeline with contractor business names, notes, won amount / lost reason.
5. **Postcard builder.** 3 templates per trade, live preview, proof PDF, "Current Resident" addressing, cost screen showing what was removed (suppressed, mailed in last 30 days), auto-mail toggle with weekly and dollar caps.
6. **ROI dashboard.** Mailed, contacted, quoted, won, revenue, cost, ROI multiple, plus a "proof from public records" table and monthly PDF.
7. **Settings.** Perfect customer, territories, brand, mail rules, team, billing, digest, and a per-town data-coverage page so nobody is surprised.

---

## 4. Architecture

```
Public sources ──► Ingest worker ──match──► Postgres + PostGIS ──► Signals + scoring ──leads──► Next.js app ──► Lob, Resend, Stripe
(ArcGIS, XLSX,     (Fly.io cron,           (parcel,                (YAML templates)             (RLS per org)    (mail, digest, billing)
 HTML, CSV/PDF)     raw to storage)         parcel_event)                                                              │
                                                 ▲                                                                     │
                                                 └───────────────────────────── webhooks ──────────────────────────────┘
```

- **Stack [J]:** Next.js 15 + TypeScript + Tailwind/shadcn on Vercel; Supabase Postgres (PostGIS, pg_trgm) + Auth; Drizzle; ingest CLI on Fly.io; MapLibre; Resend; Lob (PostGrid fallback); Stripe Billing with a postcard meter; Sentry
- **Data model:** One canonical parcel table keyed 'county:id' plus an append-only parcel_event table (sale, permit, violation, rental, condemnation...). Tenant tables (org, territory, scoring_profile, lead, mail_piece, attribution) all under row-level security
- **Matching:** Parcel id first (Cleveland permits use the same 8-digit number as the county [V]), then normalized address, fuzzy street within same number+zip, then 30 m geo; leftovers retried 14 days
- **Scoring:** Config-driven: weighted signals per trade template x user multipliers x learned weights, plus trigger boosts; reasons are the top contributing signals with evidence
- **Tenancy:** Parcel data only reachable through territory-checked server code, so no customer can export the county. Exclusivity is a (trade, zip) lock
- **Daily jobs (ET):** 04:30 Cuyahoga, 04:45 Lake, 05:00 Cleveland, 05:15 Stark, 05:30 match, 05:40 signals, 05:50 score, 06:00 auto-mail, 06:15 attribution; Monday 06:00 digest
- **Privacy:** Owner-name fields dropped at parse; mail goes to "Current Resident"; global homeowner opt-out at /optout; returned mail auto-suppressed
- **Observability:** job_run table with expected vs actual counts, /admin jobs page, Sentry, alert if a source goes 3 days without new rows

---

## 5. Turning free messy data into value

| Source | Live today | Freshness | Value to a trade |
|---|---|---|---|
| Cuyahoga parcels + transfers | 572,828 parcels; transfers to 10-29 [V] | Daily | New owners, year built, sqft, lot, gas/water/sewer, value |
| Cleveland building permits | 202,564 since 2015; 1,333 in Oct, 1,213 with a contractor business [V] | Daily | Last roof/HVAC/etc. permit per home, neighbor activity, competitor tracker, attribution |
| Cleveland violations | 61,615 total; 805 in Oct [V] | Daily | Fix-list: citations mapped to trades |
| Cleveland rentals / condemnations | 97,872 / 2,623 [V] | Daily | Exclusions (or a landlord list for some trades) |
| Cleveland 2022 property survey | Roof, gutters, siding, windows, porch condition [V] | One-time | Condition reasons, labeled with the 2022 date |
| CCPC tree canopy | 484,989 parcels with canopy/grass % [V] | Static | Tree, gutter, lawn targeting |
| FEMA flood zones | NFHL zones layer [V] | Monthly | Waterproofing, sump, plumbing |
| Lake parcels + sales | 114,622 parcels; 773 sales in Oct [V] | Daily | Same as Cuyahoga |
| Lake monthly permits XLSX | July latest, 568 rows [V] | ~3-month lag | Permit history + contractor DBA |
| Medina residential permits | 365 in Oct [V] | Monthly | Permit history + contractors |
| Stark sales | 922 arms-length sales in Oct [V] | Daily | New-owner triggers (limited home facts) |
| Summit permits | Sequential lookup works for 2026 [V]; GovWell move [S] | Unclear | Best effort, M3 |
| Suburb records requests | ORC 149.43 monthly asks | Monthly | Fills permit gaps outside Cleveland |

The value is in the joins, not any one file: a home that just sold, was built in 1938, has had no roof permit since 2015, sits under 40 percent canopy, and has two neighbors who re-roofed last month is a far better postcard target than a raw new-mover list. And because permits are public, we can later show the customer whether that home hired them or a named competitor, which no list vendor can.

---

## 6. Pricing and packaging

| Plan | Price | Includes |
|---|---|---|
| Starter | $99/mo | 1 trade, up to 3 zips, lead list, digest, tracker, CSV |
| Pro | $199/mo | 10 zips, map, neighbor ring, competitor tracker, auto-mail, ROI, 50 postcard credits |
| Exclusive | $349/mo | Pro + exclusive trade lock in up to 5 zips, 150 credits, 4 users |
| Postcards | $0.99 each | Beyond credits; Lob cost $0.649-0.909 [V] |

**Anchors [V]:** Tradepost $99/mo + $0.87/card; FirstKnock $0.94/card; Modern Postcard from $0.96; ZipLeads $50 data / $149 managed; DealMachine and PropStream are investor tools at higher tiers.

**Terms [J]:** annual = 2 months free; 14-day trial, no card; founding offer Pro at $149 locked for the first 20 customers; guarantee "no job booked in 60 days, month 2 refunded".

**Churn defenses:** monthly ROI PDF, exclusivity (losing your zip to a competitor hurts), auto-mail habits, and the competitor tracker as a reason to open the app.

---

## 7. Unit economics and $10K/mo

Assumptions [J]: plan mix 50% Starter / 35% Pro / 15% Exclusive gives about $172 ARPU; plus about $40/mo postcard margin; minus Stripe fees gives roughly $195 contribution per customer. $10K take-home needs about $13.5K pre-tax profit.

**Monthly profit before tax by customer count**

| Customers | Monthly profit before tax |
|---|---|
| 10 | $1,870 |
| 25 | $4,675 |
| 50 | $9,350 |
| 75 | $14,175 ← ~$13.5K pre-tax = $10K take-home |
| 100 | $19,000 |

| Metric | Value | Detail |
|---|---|---|
| Customers needed | ~70-80 | blended mix [J] |
| If Starter only | ~150 | [J] |
| New customers from email | 5-6/mo | 600 emails, 3% positive, 30% close [J] |
| To $10K/mo | 9-15 mo | faster with referrals [J] |

---

## 8. Getting customers (cold email)

- **Prospects: DataForSEO business listings by trade and radius.** 272 HVAC contractors within 40 km of Cleveland with 5+ reviews; every sampled one had a website and phone, none had an email [V]. Get emails only from each business's own site contact page. No appends.
- **Domain: separate sending domain (e.g. a try-216homesignal style domain; check availability) on 2-3 Google Workspace inboxes.** SPF, DKIM, DMARC; 2-3 weeks warm-up; never from the product domain.
- **Volume: 20-40 emails/day, sent by hand or a light tool.** Personalize town and trade. Stop on any reply.
- **Teaser: real local numbers + 5-row sample.** e.g. 1,190 single-family sales in Cuyahoga in October, 840 built before 1960 [V]. Sample rows are generated from live data at send time with house numbers partly masked and no names.
- **Replies: "list" = send their free zip list within a day, then offer a 15-minute screen share.** "stop" or any opt-out = suppress forever, honored well inside CAN-SPAM's 10 business days.

Draft sequence in your voice (lowercase, no pricing in email 1, no em dashes). Bracketed parts are filled from live data per prospect.

### Email 1, day 0

**subject:** {town} homes that need a {trade}

```text
hey {first name},

pulled the county records this morning. 1,190 single-family homes sold in cuyahoga in october, and 840 of them were built before 1960. most of those new owners haven't picked a {trade} yet.

i built a list for {town} with the reason each home probably needs you (old permit, just sold, city citation, neighbors doing the same job). here's 5 from {zip}:

[5 masked rows: street, year built, reason]

want the full list for your zips? reply "list" and i'll send it over, free.

Sam Filipiak
216LABS
https://216labs.dev
(330) 604-7380

not interested? reply "stop" and i won't email again.
216LABS LLC, 1474 Rosewood Ave, Lakewood, OH 44107
```

### Email 2, day 3

**subject:** re: {town} homes that need a {trade}

```text
quick add: {competitor count} other {trade} shops pulled permits in {zip} last month. i can show you which streets they're working so you can mail the neighbors. want the list? just reply "list".

(same signature and footer)
```

### Email 3, day 8

**subject:** last one from me

```text
no worries if the timing's off. the list for {zip} refreshes every monday, so if you ever want it, reply "list" and it's yours.

(same signature and footer)
```

---

## 9. Onboarding and first week

1. **Day 0.** 15-minute screen share: set trade, zips, perfect customer; upload current customers to exclude; show 3 strong leads with reasons.
2. **Day 1.** First 25 postcards to their top new owners (trial credits); proof approved together.
3. **Day 3.** Check-in text from you only if they gave you their number: which leads looked right, which didn't; adjust sliders.
4. **Day 7 (Monday).** First digest lands. Ask them to mark 5 leads contacted/skipped so the feedback loop starts.
5. **Day 12.** Trial-ending email with what they got: homes surfaced, mailed, any calls. Founding price offer.

---

## 10. Launch timeline

| Week | Build | Sell |
|---|---|---|
| 1 | Repo, schema, Cuyahoga + Cleveland ingest, matching | Buy domains, set up cold domain and start warm-up |
| 2 | Scoring, 6 templates, onboarding, list, detail, digest, Stripe (M1) | Build prospect list (roofing, HVAC first) and scrape contact pages |
| 3 | Map, postcards + Lob, auto-mail, neighbor ring, competitors, Lake/Stark/Medina (M2) | Send first 20/day; demo calls |
| 4 | Attribution and ROI | 30/day; first 3-5 founding customers |
| 5-6 | Heat map, fix list, learned weights, importer, opt-out (M3) | Add lawn, tree, plumbing, electrical prospects; ask for referrals |
| 7-12 | Remaining templates, polish from feedback | Steady 30-40/day; target 15-20 customers by week 12 |

---

## 11. Running costs

| Scale | Fixed software cost |
|---|---|
| 10 customers | ~$80/mo |
| 50 customers | ~$400/mo |
| 200 customers | ~$510+/mo |

Fixed software costs at list price [J, re-check before launch]: Vercel, Supabase, Fly.io, Resend, map tiles, Sentry, domains; the jump at 50 is mostly Lob's $260/mo Startup plan, which pays for itself above about 1,000 cards/mo by cutting the per-card cost from $0.909 to $0.649 [V]. Postage and print are passed through per card.

---

## 12. Risks and legal

### Mitigations in the design

- No owner names anywhere; mail to "Current Resident"
- Global homeowner opt-out, returned-mail suppression, 30-day no-repeat rule
- Reasons always link to the public record, plus a not-a-consumer-report disclaimer
- Cold email only, CAN-SPAM footer and opt-out; no calls, no texts, no appends
- Polite ingest: 1 request/second, no login, captcha or token-walled sources

### Risks

- Reuse terms on some ArcGIS datasets are unstated; check each license [S]
- Data gaps: suburbs outside Cleveland need records requests; Lake permits lag ~3 months [V]
- Sources can change or move (Summit to GovWell [S])
- USPS address hygiene and "Current Resident" rules for First Class need confirming with Lob [S]
- Ohio telemarketing law (ORC 4719) is why there are no cold calls; attorney review still pending
- "216 HomeSignal" trademark not searched at USPTO [S]

---

## 13. Build spec for your coding agent

A self-contained spec for Claude Code is on my box at `/workspace/insight/BUILD_SPEC.md` (1,034 lines) with a 15-page PDF at `/workspace/insight/BUILD_SPEC.pdf`. It covers ground rules, milestones with acceptance checklists, stack and repo layout, env var names, the full SQL schema with RLS, every ingestion job with verified URLs and field maps, matching rules, the scoring engine and all 13 trade templates, API routes, UI screens, mail, Stripe, email, compliance, tests and running costs.

---

## Sources

- Cuyahoga Parcel_Fabric_Taxparcels FeatureServer/1 (gis.cuyahogacounty.gov)
- Cuyahoga CCPC UTC2019_Metrics_Final MapServer/0 (tree canopy)
- City of Cleveland open data ArcGIS (services3.arcgis.com/dty2kHktVXHrqO8i): Building_Permits, Complaint_Violation_Notices, Rental_Registrations, Current_Condemnations, Citywide_Property_Survey_2022
- Lake County GIS_Parcels_WGS84 and lakecountyohio.gov/building-inspection/monthly-permits
- Stark County Auditor StarkCountySales FeatureServer
- Medina County building.co.medina.oh.us permitList.php
- FEMA NFHL MapServer/28
- DataForSEO keyword volumes + Google business listings (2026-11-01)
- RDAP .com/.app lookups (2026-11-01)
- Lob, PostGrid, Modern Postcard, FirstKnock, Tradepost, ZipLeads, DealMachine, PropStream public pricing/feature pages

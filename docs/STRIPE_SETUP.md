# Stripe setup

Everything below is done in the Stripe dashboard; the code never creates products, prices or coupons. Do it once in **test mode** (staging and local) and once in **live mode** (production). Outside production the app refuses live keys.

## 1. Products and prices

| Env var | Product | Price |
|---|---|---|
| `STRIPE_PRICE_STARTER_MONTHLY` / `_ANNUAL` | Starter | $99 / month, $990 / year |
| `STRIPE_PRICE_PRO_MONTHLY` / `_ANNUAL` | Pro | $199 / month, $1,990 / year |
| `STRIPE_PRICE_EXCLUSIVE_MONTHLY` / `_ANNUAL` | Exclusive | $349 / month, $3,490 / year |
| `STRIPE_PRICE_POSTCARD_METERED` | Postcards | $0.99 per unit, usage-based, billed monthly, attached to the meter below |

Meter: event name `postcards_sent` (`STRIPE_METER_POSTCARDS`), aggregation **sum**, value key `value`. M8 reports one unit per postcard beyond the org's credits.

## 2. Founding offer coupon (issue #5)

Coupon: **$50 off, duration forever, max redemptions 20, applies to the Pro product only.** Put its id in `STRIPE_FOUNDING_COUPON_ID`. Checkout applies it automatically to Pro **monthly** while redemptions remain; the "n of 20 spots left" line reads `times_redeemed` (cached 5 minutes) and hides at 0. If the coupon is missing or used up, Checkout runs at full price with no error.

Open question for Sam: should Pro **annual** get a founding price? It doesn't today.

## 3. Customer Portal

Settings → Billing → Customer portal:
- Allow customers to update payment methods, view invoices.
- Allow switching plans between the 3 products (monthly and yearly prices), proration on.
- Allow cancel **at end of billing period**, and collect a cancellation reason (stored on the org as `cancel_reason`).

## 4. Failed payments

Settings → Billing → Subscriptions and emails: **Smart Retries on**; **send emails when card payments fail on**. The app shows a 7-day grace banner (`past_due`), then locks the account until the invoice is paid; paying unlocks it right away.

## 5. Webhook

Endpoint: `https://216labs.dev/leads/api/webhooks/stripe`, events:
`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Every event is processed once (by `event.id`).

## 6. Keys

`STRIPE_SECRET_KEY` (`sk_test_...` on staging, `sk_live_...` only in production). Stripe Tax is not set up (issue #12).

## Billing states (issue #4)

| State | When | What works |
|---|---|---|
| `trialing` | 14 days from sign-up, no card | everything |
| `active` | subscription active (or canceled but paid period not over) | everything |
| `past_due` | payment failed, under 7 days | everything, red banner |
| `locked` | trial over with no plan, or 7+ days past due | only Settings → Billing; no digests, no export, unsent postcards canceled |
| `canceled` | plan ended | same as locked |

Data is never deleted when locked or canceled. How long to keep a locked org's data is not decided yet (kept indefinitely for now). One free trial per email address: a second org for the same address starts locked.

# Changelog

What changed in 216 Leads, in plain words. Release notes per tag are generated on GitHub from PR titles; this page is the short customer-facing version.

## Unreleased (build phase)

### Data
- Every home in Cuyahoga County (572,828 parcels) with sales, plus Cleveland building permits, code violations, rental registrations, condemnations, demolitions, board-ups, the 2022 citywide property survey, tree canopy and FEMA flood zones. Updated daily.
- Cleveland permits are tied to the right home 99% of the time.

### Leads
- Homes ranked for your trade with the public-record reasons behind each score ("Last roof permit 2009", "Sold 6 days ago").
- Fair scoring in towns that don't publish permits: missing records are estimated from similar homes instead of counted as zero.

### Privacy
- No homeowner names are stored anywhere. Contractors who are individuals appear as "Independent contractor".

### Under the hood
- Staging environment, automatic checks on every change, error tracking, uptime checks, nightly ingest alerts and weekly encrypted backups.

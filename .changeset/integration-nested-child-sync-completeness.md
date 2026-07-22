---
"@memberjunction/integration-engine": patch
"@memberjunction/server": patch
---

Stop silently truncating nested-child data in REST integration sync, plus two reliability fixes.

- **Nested-child completeness** — `DescendTemplateVars` now drains a parent's FULL paginated child collection instead of capping it at `ctx.BatchSize`. The outer batch size bounds how many PARENTS a call processes (resumable via the parent keyset, never mid-child), so applying it to the per-parent child fetch permanently dropped every record past the first batch with no bookmark to ever revisit it. Live-verified: Wild Apricot Donation/Event/Invoice/Payment (single-parent, capped at 200 each) and a Mailchimp list's full 501-member set now land completely.
- **Write-verification errors** — classify a create that returns no rows (`"no rows returned from SQL"`) as a distinct, non-retryable `WRITE_VERIFICATION_ERROR` instead of the retryable `DATABASE_ERROR` catch-all; retrying an identical write only reproduces the identical miss.
- **Narrower DATABASE_ERROR match** — the over-broad `"sql"` substring match was routing deterministic failures through retry-with-backoff for no reason; it now keys on real transient signals (deadlock / connection lost).
- **StartSync run-detection window** — extend the poll for the run record (fast first 2s, longer tail) so a large connector's synchronous setup (e.g. HubSpot's 168 entity maps) isn't misreported as "no run created" while it is genuinely syncing.

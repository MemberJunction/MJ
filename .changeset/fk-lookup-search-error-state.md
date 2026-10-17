---
"@memberjunction/ng-base-forms": patch
---

A foreign-key dropdown whose search fails or never answers now shows an error with Retry, instead of "No matches" or an endless "Searching…".

- **Timeout.** A lookup that has not answered after `FKSearchTimeoutMs` (new `mj-form-field` input, default 20 s; zero or less waits indefinitely) shows "The search took too long." The request is not cancelled; a late answer is dropped.
- **Failure is not "No matches".** `DefaultFKLookupStrategy` now throws `FKLookupFailedError` when its view fails, where it used to return no rows. The field shows "The search failed." with Retry. A registered strategy that throws still falls back to MJ's own rows; the error row appears only when that fallback fails too or the lookup timed out.
- **Retry** re-runs the same query and keeps focus in the input.
- New exports: `FKLookupFailedError`, `FKSearchTimeoutError`, `WithFKSearchTimeout`. A strategy should throw rather than return no rows when its query fails.

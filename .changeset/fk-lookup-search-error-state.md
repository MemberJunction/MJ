---
"@memberjunction/ng-base-forms": patch
---

A foreign-key dropdown whose search fails or never answers now shows an error with Retry, instead of "No matches" or an endless "Searching…".

- **Timeout.** A lookup that has not answered after `FKSearchTimeoutMs` (new `mj-form-field` input, default 20 s; zero or less waits indefinitely) shows "The search took too long." The request is not cancelled; a late answer is dropped.
- **Failure is not "No matches".** A failed lookup view shows "The search failed." with Retry.
- **Retry** re-runs the same query and keeps focus in the input.
- New exports: `FKSearchTimeoutError`, `WithFKSearchTimeout`.

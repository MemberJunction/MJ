---
"@memberjunction/core": patch
---

Stop falsely reporting paginated sweeps as duplicate RunViews, and honour telemetry exemption on batch reads

A paginated sweep read the same entity page after page, and every page was reported as a **Duplicate RunView**. Surfaced by the "Entity Vector Sync - Daily" job, which logged five bogus warnings on every run.

The single-RunView fingerprint already carried `StartRow`/`AfterKey` — with a comment explaining exactly why ("otherwise page 2 collides with page 1"). The **batch** fingerprint did not. That gap mattered far more than it looks: `ProviderBase.RunView` delegates to `RunViews([params])` whenever `BypassCache` or `AfterKey` is set, and **unconditionally on the client** — so a keyset sweep never uses the single path at all. Every page arrived as a size-1 batch, all pages collapsed onto one fingerprint, and the analyzer fired from page 2 on.

Fixed by folding per-view pagination cursors into the batch fingerprint. This is a correctness fix rather than an exemption: each page genuinely *is* a distinct query. It also clears the same false positive for **all client-side pagination**, since the client routes every `RunView` through `RunViews`.

**Also fixes `RunViewParams.Telemetry.Exempt` being silently ineffective for batch reads.** Exemption was threaded through the deprecated batch path but not the live one, so a caller who correctly marked an intentional repeat got warned anyway — with nothing to indicate their exemption had been dropped. Because of the delegation above, this also broke exemption for `BypassCache`/`AfterKey` single reads. A batch is exempt only when *every* view in it is exempt, since one telemetry event covers them all.

No data path changes — telemetry fingerprint construction and exemption plumbing only.

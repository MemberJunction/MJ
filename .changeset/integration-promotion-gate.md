---
"@memberjunction/integration-engine": minor
---

Custom-column promotion gate (U3) + opt-in reclaim planner (U7) — two pure decision functions in `CustomColumnPromotion.ts`; the engine PLANS, the consumer executes.

**U3 — hold promotion until a full sync (`planPromotions` + `PromotionPlanOptions.LockUntilFullSync`).** After a rediscovery, an *incremental* sync only re-syncs changed rows, so unchanged rows still carry now-vanished keys in their overflow JSON — a coverage scan over that stale mix could **phantom-promote** a column the source already dropped. A full sync evicts every stale key per-row (`reconcileOverflowValue`, shipped in the schema-fidelity change), making the scan trustworthy. When `LockUntilFullSync` is set, `planPromotions` plans **nothing** — the engine's half of "lock column-application until the sync after a schema change." The engine supplies the lever; the consumer owns the state (it knows when a full sync completed) and pulls it. Default (undefined/false) = unlocked, so existing callers are unchanged.

**U7 — opt-in reclaim of vanished promoted columns (`planColumnReclamations`).** A promoted column the source stops sending currently lingers all-NULL (non-destructive by design). This adds a **pure, triple-gated, default-OFF** planner: it returns candidates only when the deployment opts in (`ReclaimVanishedColumns`) AND a full sync was observed (`FullSyncCompleted`), and even then only for a column that is BOTH all-NULL across that full sync AND absent from the source. Nothing is dropped by default, and a column holding data is never a candidate. Symmetric to `planPromotions`: the engine only PLANS the drop; the consumer/RSU performs the destructive DDL.

Both are pure and deterministic (sorted output), matching the existing `decideLengthOverlay` / `reconcileOverflowValue` pattern. Unit-tested (2 lock cases + 4 reclaim cases). No migration; no behavior change unless a caller passes the new options.

---
"@memberjunction/integration-engine": minor
"@memberjunction/server": minor
---

Integration apply path: stop record-map write amplification, surface pagination violations, and stop blocking the connection wizard on a schema refresh.

`MJ: Company Integration Record Maps` is the highest-volume table the sync path writes — one row per external record ever mapped, re-touched every sync — and it was the last integration bookkeeping entity still shipping with `TrackRecordChanges = 1`, so every mapping upsert also wrote a `RecordChange` row and doubled a sync's write volume. Nothing reads that history: the mapping row is the current state, and operators audit a sync through the per-run artifact stream. Change tracking is now off for that entity; existing history rows are left in place. Separately, a connector returning an oversized batch (a pagination-contract violation) is now reported rather than absorbed silently, and the connection wizard launches its schema refresh without waiting on it.

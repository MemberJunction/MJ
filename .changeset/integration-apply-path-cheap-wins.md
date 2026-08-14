---
"@memberjunction/integration-engine": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
---

Integration apply path: stop record-map write amplification, surface pagination violations, and stop blocking the connection wizard on a schema refresh.

`MJ: Company Integration Record Maps` is the highest-volume table the sync path writes — one row per external record ever mapped, re-touched every sync — and unlike its run-log siblings it still shipped with `TrackRecordChanges = 1`, so every mapping upsert also wrote a `RecordChange` row and doubled a sync's write volume. Nothing reads that history: the mapping row is the current state, and operators audit a sync through the per-run artifact stream. Change tracking is now off for that entity; existing history rows are left in place. Separately, a connector returning an oversized batch (a pagination-contract violation) is now reported rather than absorbed silently, and `IntegrationUpdateConnection` can launch its schema refresh without waiting on it.

`MJCompanyIntegrationEntityServer` gains `SuppressActivationSchemaRefresh`, a transient opt-out that stops the activation (`IsActive` false→true) schema refresh from running inside `Save()` when the caller is going to run it itself. `IntegrationCreateConnection` sets it for `awaitSchemaRefresh: false`, which makes that flag actually non-blocking on create — previously the Save-side refresh ran first and awaited, so the mutation paid a full live introspect regardless — and moves the introspect after the connection test, so a connection rejected by that test is rolled back without having written IntegrationObject rows. Default false, so every other activation path is unchanged.

`IntegrationConnectorCreationPipeline.Run()` now honours a caller-supplied `RunID` even when it coalesces onto an already-running or just-completed run for the same CompanyIntegration. Previously the supplied ID was silently discarded, so a caller that had already handed it to a client as "the run to tail" left that client polling a run directory that was never created — `IntegrationTailRunEvents` answering "Run not found" forever, which is indistinguishable from "hasn't started yet". A coalesced call now publishes a terminal alias run under the requested ID that mirrors the served run's outcome and names it, so the ID is always tailable.

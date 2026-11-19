---
"@memberjunction/integration-engine": patch
---

Incremental push (Push / Bidirectional entity maps) now selects, pushes and advances correctly. Four defects in `IntegrationEngine`'s push path, found while proving the Informz bidirectional connector against the real engine, each made incremental push a silent no-op or a permanently stalled loop for every connector:

- **Record Changes entity name.** The push loader queried the unprefixed `Record Changes` entity; the only registration is `MJ: Record Changes`, so the RunView failed, the loader returned nothing, and no incremental push ever found a change.
- **JSON-quoted push watermark.** A `simple` RunView returns `ChangedAt` as a `Date`; assigned to the text watermark it serialised with quotes (`"2026-…Z"`), and the next pass's `ChangedAt > '…'` filter could never match. `ChangedAt` is now normalised to ISO text in the loader.
- **A Delete that cannot be performed errored forever.** A Delete for a record with no record map (never pushed) or for a connector without delete support was routed into the create/update branches with no attributes, refused by the connector, counted errored, and re-selected on every pass because the watermark was held. It is now a documented `PUSH_SKIPPED` and the watermark may advance (while a failed record-map read throws so transient lookup errors retry instead of skipping). The push record-map lookup also scopes by `EntityID`.
- **Watermark precision.** `ChangedAt` has up to seven fractional digits in the database but reaches the engine at millisecond precision, so a record changed at `.2666667` sat above a `.266` watermark and was re-pushed on the next pass. The stored push watermark rounds up to the next whole millisecond whenever doing so remains strictly below the earliest failed record's timestamp.

Deployed Push or Bidirectional maps that have silently pushed nothing will begin pushing MJ changes to their vendors after this lands. On a map with no existing push watermark (`WatermarkValue` null), the first incremental push runs with no `ChangedAt` lower bound and replays the entity's full `MJ: Record Changes` history (excluding System-user rows); operators who want to push only new changes going forward should set a push watermark before upgrading.

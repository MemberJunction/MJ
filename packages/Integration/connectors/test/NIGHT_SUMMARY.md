# Integration Framework — Overnight Work Summary

What got done autonomously, the current state, what's blocked on you, and the exact morning plan.

## Done tonight (autonomous, no credential exposure)

### 1. Raised the PR — #2752
**"Integration Framework: Major Enhancement — Bidirectional Sync, Conflict Resolution, No‑Watermark
Scale & Dual‑Dialect Parity"**, against `next`. Source‑only commit (`696174efaa`); **no** `plan.md`, **no**
migrations, **no** generated code. Full capability breakdown + testing approach + reviewer notes in the body.

### 2. Wired the Merkle / partition hash‑diff reconcile (B4) — it was BUILT‑not‑wired; now WIRED
- Opt‑in no‑watermark sync mode: accumulate → bucket by stable identity → order‑independent rollup → diff
  vs last snapshot → deep‑apply only changed/added partitions; the rest are proven‑identical and skipped.
- Snapshot persists on the watermark record (`WatermarkType='ChangeToken'`, no schema change).
- **GraphQL is the source of truth**: enabled via entity‑map `Configuration.partitionReconcile` — now
  settable on `IntegrationCreateEntityMaps` / `IntegrationUpdateEntityMaps` and readable on `ListEntityMaps`.
- **Adversarially reviewed** (4‑lens, data‑loss focus) → `fix‑then‑ship`. Fixed: **`fullSync` now re‑applies
  ALL partitions** (critical — otherwise a full sync run to repair out‑of‑band drift would silently skip the
  unchanged‑rollup partition); the `RecordsProcessed` count invariant; documented the RAM tradeoff. The
  review confirmed the data‑loss invariants are clean (identity‑keyed partitions, order‑independent rollups,
  first‑sync/corrupt → full reconcile, orphan sweep over the full fetched‑id set catches deletes).
- Engine **368/368** (added partition‑key, fullSync‑semantics, and watermark keyset/rollup unit tests).

### 3. Channel proven earlier — the deterministic credential path works
Tier‑1 (connector ↔ real HubSpot: 130 objects, contacts 282 fields) and Tier‑2 association (15 contacts /
19 companies / **11 contact↔company pairs**, FK pairs populated) **ran live** via the broker — the token
value was never read. This proves the "use it, never read it" channel end‑to‑end.

### 4. Docs (for your review)
- `TEST_MATRIX_2N.md` — the runnable 2^N plan: Phase 0 onboarding (P0.0–P0.5) + the full sync matrix
  (completeness, identity/idempotency, watermark/content‑hash/Merkle, keyset/restart, bidirectional/conflict,
  deletes/tombstone, DAG contract, rate/concurrency, resilience, value‑handling, generated actions), each with
  exact GQL/DB ops + assertions + flags ([both‑dialects], [needs‑HS‑data], [needs‑restart], [write]) + the
  dual‑DB replication + the result format.
- `INTEGRATION_ADDITIONS.md` — itemized list of everything added (B4 now marked WIRED).
- `FRAMEWORK_TESTABLE_CAPABILITIES.md` — capability → observable signal map, with our discussion folded in.

## State of the tree
- PR #2752 open; branch pushed (`696174efaa`).
- Engine 368/368, connectors green, MJServer + schema‑builder build clean.
- Harness (`gql-live-harness.mjs` + adapters + `run-plan.mjs` + the broker) is built and self‑tested (mocks),
  covering Phase‑0 setup + forward pull + backward CRUD. The additional matrix phases are **designed**
  (TEST_MATRIX_2N) and will be implemented against the **first real sync** so they match actual behavior
  rather than being written blind.

## Blocked on you (the live runs need these — I can't do them without your sudo / would disrupt your env)
1. **Restart the broker** (stopped) — same command as before; it now hot‑reloads, so it's the last restart.
2. **Clean SQL Server DB + bootstrap** — empty DB → `mj migrate` → `mj sync push` → `mj codegen` (this branch)
   → build → start MJAPI/MJExplorer. (P0.0.)
3. **Rebuild + restart MJAPI** to pick up the resolver `Configuration` additions (so the GQL toggle works live).
4. **Postgres‑backed MJAPI** for the #1 axis (second instance on a different port).
5. **HubSpot test data** — the `[needs‑HS‑data]` items (duplicate records, edits for incremental, deletable
   test records, edge‑value records, a large/same‑timestamp set). You offered to help; I'll hand you the exact
   API calls so cleanup is exact.

## Morning plan (with you)
1. Broker up → `hubspot-diag` (resolve IDs) → **first real GQL sync on SQL Server** to validate the path.
2. Implement the remaining matrix phases against that validated path; run the read‑only / write / restart
   tests; then the Postgres replication.
3. Seed the `[needs‑HS‑data]` cases with you; run them.
4. Produce the result deliverables: `summary.md` (what happened, per phase, plain English) + `results.json`
   (scrubbed `IntegrationGetRun` payloads, DB count rows, relevant `progress.jsonl` events) — every test with
   an NLP statement + the JSON evidence.

## Then (your steps)
- New branch off `next` (== this branch) for **Fonteva / GrowthZone** — later.
- You check MJExplorer (UI critique fine; it should work since it's all through GQL).
- You push + have the external software run it against the live AWS account; we keep production SQL Server +
  production Postgres (Azure/AWS) in mind throughout.

Kapish. 🌙

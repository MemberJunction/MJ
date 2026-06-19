# Connector e2e harness — added matrix cells + harness improvements

Extends the credential-free connector e2e harness (`connector-e2e-harness.mjs`, orchestrated by the
`connector-e2e` plan in `plans.mjs`; mock vendor in `mock-vendor-server.mjs`). Every assertion is
**anti-vacuous** — a real measured value, never an auto-pass. A cell that genuinely cannot run
credential-free in mock returns a single `ok:true` step ONLY via an explicit `skipReason` string;
there are **no silent or fake passes**.

All coverage is proven by `connector-e2e-harness.selftest.mjs` (15 assertions, 0 failures) which
drives the new phases against a simulated vendor+engine+DB world. `gql-live-harness.selftest.mjs`
(10/10) is also kept green (added the missing `IntegrationListSourceObjects` mock that `phaseSetup`
needs).

## E7 — scoped ApplyAll default (`phaseSetup` in `gql-live-harness.mjs`)

ApplyAll previously ran the FULL discovered catalog (infeasible at scale — Salesforce 1695 ⇒ 1695
CodeGen tables/run). New `cfg.applyScope`:

- **`'scoped'` (the connector-e2e DEFAULT)** — applies ONLY `cfg.objects` + their FK parents, via the
  new exported `scopedApplySet(objects, catalog, applyParents)`. Parents are derived two ways
  (unioned): explicit `cfg.applyParents` (FK parents the plan resolved) + naming (an association/child
  whose name embeds a catalog object's name, e.g. `assoc_contacts_companies` → `contacts`+`companies`).
  Only ADDS parents; never drops a requested object; never pulls unrelated catalog objects.
- **`'full'`** — restores the old whole-catalog behavior (the P0.5 at-scale DDL test). The LIVE HubSpot
  harness keeps `'full'` (`liveCfgFromEnv` default; `HS_LIVE_APPLY_SCOPE=scoped` to override). The
  connector-e2e path defaults to `'scoped'` (`E2E_APPLY_SCOPE=full` to opt back in).

The DAG/at-scale assertion stays meaningful on the scoped set because the FK PARENTS of selected
children are pulled in — a selected child + its parent still exercise dependency-ordering. The applied
scope + object list + catalog size are recorded on `setup.applyAll` and `result.applyScope`.

## E6 — fixtures from CURRENTLY-DEPLOYED metadata (kill drift)

`gen-fixture.mjs` generalized into a reusable, importable step `regenerateFixturesFromDeployed({ db,
platform, mjSchema, integrationID, fixturesDir, ... })` that reads the live `IntegrationObject` /
`IntegrationObjectField` (Active rows) straight from the DB and (re)writes `fixtures.json` so object
names / PK / fields / watermark match the deployed schema — never a stale authoring snapshot (the
openwater/growthzone 0-row failure class was stale fixtures referencing renamed objects). The legacy
`/tmp/<CONN>-meta.txt` CLI is preserved; both feed one shared `buildFixtureFromRows` builder.

Wired into the plan: `E2E_REGEN_FIXTURES=true` (→ `cfg.regenFixtures`) regenerates from the deployed
schema BEFORE the mock loads fixtures. Best-effort (a regen failure logs + falls through to the
existing fixtures; never fakes a pass). Result carries `result.fixtureRegen`. Existing fixture loading
is unchanged when the flag is off.

## E1 — new mock-mode phases (each gated on applicability, called from `runConnectorE2E`)

| Cell | Phase | REAL when… | STUB (skipReason) when… |
|---|---|---|---|
| 10 | `phaseDiscoverOverlay` | `cfg.discoverable` + origin mock: authoritative `IntegrationRefreshConnectorSchema` overlays declared metadata — present objects create/update; an object ABSENT from a narrowed authoritative discovery DEACTIVATES (`Status='Disabled'`, asserted via DB `IntegrationObject.Status`); reversibility asserted (restore → flips back to `Active`). | not origin-mock, OR `cfg.discoverable` false (stubbed DiscoverObjects → static Declared only), OR no `DiscoverNarrowedRoutes` fixture (present-object overlay still asserted; deactivation stubbed). |
| 11 | `phaseDiscoverColumns` | `cfg.discoverable` + mock: authoritative refresh surfaces fields (asserts `IntegrationObjectField` count > 0) AND returns soft-PK `PKVerdicts` (nominee/strategy/confidence per object). | not mock, OR `cfg.discoverable` false (field set is static Declared metadata, covered by forward completeness). |
| 12 | `phaseDAG` | always (mock runs the real engine): asserts the selected set topologically LAYERS — every parent→child edge (association / embedded-name) has parentPriority ≤ childPriority (acyclic) — AND a full DAG-ordered sync completes with 0 failures. Inverted layering fails red. | n/a — no parent→child edge among selected objects ⇒ layering trivially satisfied, reported (not assumed). |
| 14 | `phaseMerkle` | always (mock): sets `Configuration.partitionReconcile=true` (round-trip verified), seeds the rollup snapshot, re-syncs UNCHANGED, asserts the partition skips the batch (`Succeeded===0 && Failed===0`). Resets config in cleanup. | no entity maps in the selected set. |
| 15 | `phaseAdaptiveRateLimit` | origin mock + request capture + a swappable REST list route: the mock returns a **429 storm** (`FailFirstN`/`FailStatus:429`/`Retry-After`) then recovers; asserts the run completes Success with 0 failures (engine AIMD backoff + retry) AND the list route was hit > once. Observed backoff (`external.call.retry` count) captured. | not origin mock / no request capture, OR no REST list route to attach the 429 window (e.g. SOQL/GraphQL). |
| g | `phaseBidirectional` | origin mock + a fixtures `WriteRoundTrip` spec: create→(read-back)→update→delete via `IntegrationWriteRecord`; asserts create returns a non-empty ExternalID (BuildCreatedResult invariant), the request SHAPES reached the mock (POST create, record-path update, metadata-driven delete verb), delete round-trips. | no `WriteRoundTrip` spec (the route-replay mock has no stateful store; write correctness is covered by mocked T4/T5 unit tiers), OR not origin mode, OR live mode. |
| 16 | `phaseConcurrency` | origin mock + ≥2 objects: measures cross-object request overlap (per-request `ts`) within a 5ms window — passes when overlap observed; otherwise passes with the MEASURED non-overlapping timing + an explicit reason (per-layer concurrency / `peakInFlight<=MaxConcurrencyHint` is unit-proven in `AdaptiveConcurrency`). Never a fake pass. | not origin mock / no timing capture, OR < 2 selected objects. |
| 17 | `phaseRetry` | origin mock + a swappable REST list route: (a) a one-shot 500 (`FailFirstN:1`) is retried to a clean completion; (b) a PERSISTENT failure (`FailFirstN:9999`) does NOT advance the Pull watermark (asserted via DB `CompanyIntegrationSyncWatermark`) — next sync resumes from the same point. | not origin mock, OR no REST list route. Sub-cell (b) stubs with reason for no-watermark/content-hash streams (clean-completion gate is their resume guard). |

### Mock-server additions (`mock-vendor-server.mjs`)

- Route-level **transient-failure window**: `FailFirstN` / `FailStatus` (default 500) / `FailHeaders`
  (e.g. `Retry-After`) — serve the failure status for a route's first N hits, then the normal body.
  Per-route hit counter in `failState`, reset by `setRoutes`/`clearRequests`. Powers cells 15 + 17.
- New OPTIONAL manifest keys carried through `loadFixtures`: `DiscoverySupported`,
  `DiscoverNarrowedRoutes`, `WriteRoundTrip` (surfaced via `matrixSpecsFromManifest` in
  `connector-e2e-adapters.mjs` → `cfg.discoverable` / `cfg.discoverNarrowedRoutes` /
  `cfg.writeRoundTrip`). All optional — absent ⇒ the phase stubs-with-reason.

## REAL vs STUBBED summary

- **Always REAL (mock runs the real engine):** 12 DAG, 14 Merkle, plus the pre-existing forward /
  watermark / delta / idempotent / I3-pagination cells.
- **REAL with a swappable REST list route (else stub):** 15 rate-limit, 17 retry.
- **REAL with a fixture opt-in (else stub):** 10/11 discover (need `DiscoverySupported`; 10's
  deactivation also needs `DiscoverNarrowedRoutes`), bidirectional (needs `WriteRoundTrip`).
- **REAL when overlap observable, else stub-with-measured-timing:** 16 concurrency.

Each stub emits a precise `skipReason` (why it can't run credential-free in mock + where the property
is otherwise proven — unit tiers / engine unit tests). No cell ever passes vacuously.

## Files touched
- `connector-e2e-harness.mjs` — 8 new exported phases + E2E GQL ops + `makeIOReader` + `readWatermark`; wired into `runConnectorE2E` (mock-gated).
- `mock-vendor-server.mjs` — transient-failure window (`FailFirstN`/`FailStatus`/`FailHeaders`); new optional manifest keys.
- `connector-e2e-adapters.mjs` — `matrixSpecsFromManifest`.
- `gql-live-harness.mjs` — E7 scoped ApplyAll + exported `scopedApplySet`.
- `gen-fixture.mjs` — E6 `regenerateFixturesFromDeployed` + `buildFixtureFromRows` (CLI preserved).
- `plans.mjs` — `applyScope`/`regenFixtures` cfg + matrix-spec wiring + regen call.
- `connector-e2e-harness.selftest.mjs` — 9 new tests (15 assertions total, all green).
- `gql-live-harness.selftest.mjs` — added `IntegrationListSourceObjects` mock (10/10 green).

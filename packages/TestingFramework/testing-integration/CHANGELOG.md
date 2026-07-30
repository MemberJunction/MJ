# @memberjunction/testing-integration

## 5.50.0

### Patch Changes

- fab223d: fix(testing): fail loudly when a server-transport integration bundle resolves a rebound client provider, and make the ai-verify persistence poll truthful + tunable (#3251)
  - `IntegrationTestDriver` now aborts a `server`-transport bundle with a clear, harness-attributed `Error` if the resolved provider is not a Database provider (i.e. a client-transport bundle rebound the process-global provider earlier in the process), instead of silently running the bundle over the wire. This enforces the previously prose-only suite-ordering invariant.
  - `ai-verify.ts`'s `fetchById` bounded poll no longer asserts "fire-and-forget write never landed" (which claimed data loss that did not occur); it states the actual bound it waited and names the new `MJ_IT_FETCH_POLL_MS` env knob (default 12000ms) so loaded boxes can widen the window.

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/server-bootstrap-lite@5.50.0
  - @memberjunction/testing-engine@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/sqlserver-dataprovider@5.50.0
  - @memberjunction/testing-engine-base@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- 4c441dd: Close out every open cache-audit defect (B39–B44) plus the reachable differential throw found in adversarial round 3.
  - **B40** — `CacheLocal` + `Aggregates` returned no aggregates at all, even on a cold miss. Three independent drops in one pipe: the client's cache-check input map omitted `Aggregates` from the request, the resolver's coreParams map omitted them again, and the engine's `stale` reply dropped the computed results. All three now forward; the client parses values back to native types. `client-cache` is 13/13 and now registered in the deterministic gate.
  - **B39** — a `ViewID`-only `RunView` failed for _every_ caller (including the view's owner): the internal `MJ: User Views` lookup ran without a context user, and a miss fell through to `undefined` ("Entity undefined not found in metadata"). The user is now threaded through `EntityStatusCheck` → `GetEntityNameFromRunViewParams`, and a genuine miss throws an error naming the view and the cause.
  - **B41** — the differential-merge decline path now performs a **real full fetch** (CacheLocal stripped + BypassCache, so re-entry into the smart-cache transport is structurally impossible) instead of throwing away the caller's whole batch; with that fallback in place, the `hasNarrowingSegment` guard is restored on `ApplyDifferentialUpdate`.
  - **B42** — `OrderBy` (fingerprint segment [2]) joins the maintenance classifier: an in-place upsert appends out of order, so ordered slots invalidate on save (delete still removes in place — removal preserves relative order).
  - **B43** — the RunQuery TTL cache-hit now checks `UserCanRun` before serving; the fingerprint carries no user segment, so user A's warmed slot was served to user B with no permission check. Deny or unresolvable metadata falls through to normal, authorized execution.
  - **B44** — an every-field `Fields` list (the `entity_object` widening) now normalizes to `f:*` in the client fingerprint **only**, restoring in-place maintenance for the client's most common slot shape without touching what is fetched.

  Also: the round-3 finding that the "unreachable" differential throw was in fact reachable (aggregate slots and defensive `MaxRows` caps both failed live) is fixed at the server seam — `RunViewsWithCacheCheck` no longer offers a differential for subset/aggregate-shaped params, falling back to the same full-refresh path its own validation already uses.

- 0e52ff6: Add the `cache-gauntlet` integration bundle (CG1–CG6) — live coverage of the subset-slot × mutation cell that shipped two production cache bugs.

  An audit of the 61 existing cache checks found the exact bug class had **no live coverage**: `S16` tests that `MaxRows` _fingerprints_ separately (slot identity), `S17` tests that a _filtered_ slot invalidates on save, and `S23` tests that an _unfiltered_ slot upserts in place — but nothing ever saved into a **subset** slot. Both #3195 (`totalRowCount` collapse) and #3199 (rows maintained in place) lived in that gap.

  The bundle also pins the per-operation asymmetry that made #3199's delete half a _separate_ bug: filtered-DELETE is legitimately maintained in place (a deleted row matches no predicate), while subset-DELETE is not (removal shrinks the slot below the caller's limit). CG3 guards the legitimate half so a future over-correction doesn't needlessly invalidate it.

  Verified to actually catch the regression: with `isSubsetFingerprint` neutered, CG1/CG2/CG4/CG5 go red while CG3 correctly stays green — the checks discriminate rather than firing indiscriminately.

  Two adjacent gaps were investigated and are documented rather than silently left:
  - **Cross-server invalidation is already covered** by the existing `cross-server-invalidation-tests.ts` rig (XS1/XS2), but it has **no subset-slot coverage** and is **not registered in `run-all.ts`**, so it can rot unnoticed.
  - **Schema-drift staleness is now covered by CG6 — and it found a real defect (B38).** In-place maintenance (`UpsertSingleEntity`/`RemoveSingleEntity` → `storeCachedResults`) carries `totalRowCount` forward but **not `schemaHash`**, so a single save strips the hash; `isSchemaStaleCacheEntry` short-circuits on a missing hash and never fires for that slot again. Reproduced directly: cold read → `1bd8ea31`, after one SAVE → `NONE`. Schema-drift protection therefore only covers slots never written to. This is the same class of omission as #3195, which fixed `totalRowCount` on this exact write path. **CG6 is intentionally RED** pending the fix.

- 1e5b9b2: Fix a structural defect in RunView cache maintenance classification, plus the two holes it caused.

  Three shipped bugs (#3195 `totalRowCount`, #3199 rows, B38 `schemaHash`) were all symptoms of one root cause: `isFilteredFingerprint` inspected **only** fingerprint segment `[1]`, so segments appended later were silently classified as "safe to maintain in place":
  - **H1** — a saved view's `WhereClause` lives on the VIEW, not in `params.ExtraFilter`, so the filter segment stays `_`. Its slot was upserted in place on save and served rows the view's own `WhereClause` excludes. Views are how users are shown a restricted row set, so this reads as a data/permission leak.
  - **H3** — the per-user RLS predicate is appended as `rls:<hash>` after the filter segment is built. Same misclassification: a save by user A was upserted into user B's RLS-scoped slot, injecting a row B's predicate excludes. An RLS bypass.

  `hasNarrowingSegment()` replaces the segment-`[1]` check with a **deny-by-default allowlist**: only `imr:` (which widens the set) and the connection suffix are treated as safe; everything else, _including unknown future segments_, is treated as narrowing. A new segment can now cost a cache refill, but can never silently serve wrong rows.

  **H2** — aggregates were dropped by in-place maintenance, so a caller that asked for `COUNT(*)` got `Success: true` with no aggregate. The first fix attempt _carried the cached aggregate forward_ and was worse: it served `rows=7` alongside `COUNT(*)=6`. A caller can detect a missing aggregate; it cannot detect a stale one. Aggregate-bearing slots (`aggHash` segment) are now invalidated on **either** mutation, since the value is not derivable in JS. The delete branch previously bypassed classification entirely and now consults it.

  **H4/H5** — `ApplyDifferentialUpdate` refuses to merge into subset, narrowing, or aggregate slots, invalidating instead. It recomputed `schemaHash` (stamping today's schema onto rows fetched under the old one, masking drift) and still shrank subset slots — the third instance of #3199, previously unpinned by any test.

  **H6** — `cross-server-invalidation-tests.ts` documented that run-all included it behind `RUN_CROSS_SERVER=1`; that inclusion never existed, so it had never run in the gate. Now registered behind its documented gate.

  New `cache-gauntlet` checks CG7 (view slot) and CG8 (aggregate consistency) pin H1 and H2 live; the unit slot-maintenance matrix gains view/aggregate rows plus deny-by-default property tests.

- 3d0255b: Add server-free `./registry` and `./checks/*` subpath exports so client-first integration dispatchers stop loading server packages through the root barrel.

  The barrel re-exports `./bootstrap` (server) plus every check module, so a client dispatcher reaching for `TestRunner`/`IntegrationCheckRegistry` transitively loaded `@memberjunction/core-entities-server` — and the ClassFactory then resolved entities to their SERVER subclasses (`MJTagScopeEntityServer`) instead of the client classes a browser loads. That silently defeated the point of client-first testing.

  `./registry` exports only verified server-free primitives (runner, registry, check types, tiers, config — `check.ts`'s every import is `import type` and therefore erased). Client dispatchers pair it with `./client` plus a direct side-effect import of their own bundle via `./checks/*`, so only the intended checks register.

  Verified: `MJ: Tag Scopes` now resolves to `MJTagScopeEntity` (was `MJTagScopeEntityServer`), and the registry contains only the dispatcher's own bundle.

- 243523e: Make the client integration bootstrap browser-faithful. Split the bootstrap into a server-free shared core (`bootstrap-shared`), a server-free client bootstrap (`bootstrap-client`, exported via a new `./client` subpath), and the server bootstrap (`bootstrap`). Client dispatchers importing `bootstrapIntegrationClient` from `@memberjunction/testing-integration/client` now register only the CLIENT generated entity subclasses (via `@memberjunction/core-entities`, exactly like MJExplorer) and never load `@memberjunction/server-bootstrap-lite` / `@memberjunction/sqlserver-dataprovider`. Previously any client import transitively pulled in server-only `*EntityServer` subclasses whose constructors throw on a client provider, making a "client" integration test a server/client hybrid rather than a faithful browser client. The barrel still re-exports everything for the driver / server dispatchers, so existing consumers are unaffected.
- 88d707b: Headless clients can now run AI agents over the GraphQL wire.
  - **`graphql-dataprovider`** — `GraphQLAIClient.RunAIAgent` forced `fireAndForget = true` for every caller, and `FireAndForgetHelper.subscribeToPubSub` called `dataProvider.PushStatusUpdates` — a browser/Angular-only channel. Any provider lacking it (a headless integration client, Node/MCP consumer) crashed with `PushStatusUpdates is not a function`. The helper now feature-detects the channel at its single choke point: when `PushStatusUpdates` is absent it delegates to the resolver's already-existing **synchronous** mode (re-send with `fireAndForget: false`, await the inline sanitized result via a new optional `extractSyncResult` seam). The browser/full-provider path is byte-for-byte unchanged — WebSocket completion + idle-stall reconcile, needed for Azure's ~230s proxy timeout — so only providers without the channel take the synchronous branch. `graphQLAIClient` wires both `RunAIAgent` and `RunAIAgentFromConversationDetail` to the seam. Known follow-up: `conversationId` is still not a wire mutation arg (the resolver passes `undefined`); `conversationDetailId` works.
  - **`testing-integration`** — `ai-verify.fetchById` now bounded-polls (fire-and-forget Action-Execution-Log / child-prompt-run writes can land after a run handle returns, especially under the fast server-in-process transport), `verifyAgentRun` gains a `skipActionLogs` option, and `WireRunOptions` threads `conversationId`.

- 1a15bd2: Add the **"Integration Test" `TestType`** — a headless, metadata-driven integration tier that runs the real MJ provider stack (live SQL Server / GraphQL, real cache managers + engines, real entity saves; no browser, no mocks) inside the Testing Framework, focused first on cache-integrity. The standalone `tsx` cache suites in `packages/MJServer/integration-test-scripts/` are graduated into first-class check bundles on one shared registry, so the same definitions run identically via the `npm run test:integration` aggregator **and** via `mj test` / `TestRun` (the `IntegrationTestDriver`) — a single source of truth.

  **New package `@memberjunction/testing-integration`.** Dedicated-process bootstrap that installs an instrumented `LocalCacheManager` as the first caller (`bootstrapIntegrationServer` / `bootstrapIntegrationClient` / `installInstrumentedCacheFirst`, gated by `MJ_INTEGRATION_TEST=1`); the `IntegrationCheckRegistry` + `NamedCheck` contract; the `InstrumentedLocalStorageProvider` / `UniqueFilter` / `TestRunner` / `ai-verify` proof primitives; and the `IntegrationTestDriver` (`@RegisterClass(BaseTestDriver, 'IntegrationTestDriver')`), which dispatches a Test's configured bundles against one bootstrapped context and maps each check to an `OracleResult`. `@memberjunction/testing-cli`'s run/suite commands install the instrumented cache first under `MJ_INTEGRATION_TEST=1` (byte-for-byte unchanged otherwise); the old `lib/harness.ts` becomes a thin re-export shim. The pre-built `@memberjunction/server-bootstrap` class-registration manifest is regenerated (and the package gains a `@memberjunction/testing-integration` dependency) so `IntegrationTestDriver` is registered in-process and survives tree-shaking.

  **Graduated check bundles (single source of truth).** Every standalone suite is now a thin dispatcher of a registry bundle with a metadata `Test` record (IT01–IT23) joined to an "Integration Tests" suite:
  - **Deterministic server:** `server-cache` (S1–S31), `runquery-cache`, `dataset-cache`, `aggregates-cache` (AGG1–3), `record-process`, `record-process-facade`, `scheduled-jobs`, `field-rules-bulk-update`, `remote-operations`, `ai-skills`, `api-keys`, `predictive-studio` seams, `rls-isolation` (RLS1–RLS10 — the two overlapping RLS implementations were merged into one canonical bundle), plus the final three graduated in this pass: `lists` (LS1–3, keyset pagination), `open-app-teardown` (OAT1–2, the FK-graph cascade + link-less Application cleanup — adds a `@memberjunction/open-app-engine` dependency), and `user-routines` (UR1–16, the entity servers + dispatcher end-to-end).
  - **Deterministic client** (needs a live MJAPI; skips cleanly otherwise): `remote-op-wire-progress` (the client bootstrap now derives a `ws(s)://` subscription URL from the HTTP endpoint so the RO-3 progress WebSocket actually connects — it previously passed an empty `wsurl` and threw `Invalid URL` the moment a live MJAPI was reachable, so the check could never pass), and `rls-isolation-client` (RLS7 — the client smart-cache companion to `rls-isolation`, now given its own seeded-Skip IT record instead of being a driver-only orphan).
  - **Live-model** (`RUN_AGENT_TESTS`): `prompt-runner`, `agent-runner`, `concurrent`, `remote-op-ai-authoring`.

  **tsx↔metadata sibling parity is now enforced.** The check logic lives once in a registry bundle; its two "siblings" are a `tsx` dispatcher script and a metadata `Test` record — both thin pointers. A new `sibling-parity.test.ts` drift-check (unit test) fails the build if any registered bundle is missing a dispatcher or an IT record, or if either points at a non-existent bundle (a small, reasoned `NO_TSX_DISPATCHER` allowlist covers deliberately driver/MJAPI-only bundles like `rls-isolation-client`). Backed by a new `IntegrationCheckRegistry.GetBundleNames()`; the coverage-loss guard was extended to the three new bundles. This closed the last three un-graduated `tsx` suites and the one registry-only bundle so all bundles now have both siblings.

  **Tiering & gating.** A single tier model (`tiers.ts`: `deterministic` | `mutation` | `live-model`, with `IsTierEnabled()` reading `RUN_MUTATION_TESTS` / `RUN_AGENT_TESTS`) is honored identically by the aggregator and the driver, so a flag skip-passes the same way on both paths.

  **Engine-level fixture lifecycle.** A per-bundle `BundleLifecycle` (Setup → run → Teardown in FK-safe order) plus suite-scoped `SuiteFixtureContext` (`@memberjunction/testing-engine-base`) with additive `BaseTestDriver.SetupSuite()` / `TeardownSuite()` hooks; `TestEngine.RunSuite` guarantees teardown + run-status update in a `finally` (pass / fail / thrown `Execute` / timeout), and a thrown `Execute` now resolves to a `Status='Error'` `TestRun` instead of wedging `'Running'`. Mutating suites self-clean identically on both front-ends.

  **RLS / multi-user cache isolation.** New version-controlled seed metadata — a purpose-built **"Integration Test: RLS Scoped Reader"** role (scoped read on `MJ: AI Agent Runs` via `UserID = '{{UserID}}'` and nothing else) plus three inert, login-less test accounts — so the strongest RLS checks (fingerprint divergence / server-superset no-cross-serve / live no-leak) **execute for real** instead of skipping on an admin-only DB. Accounts are `Type='User'`, no auth linkage, clearly named, safe to delete. **The test-only integration records — the IT01–IT23 Tests, the integration suite, AND these RLS principals — live in a dedicated optional sibling root `metadata-optional/integration-test/`, NOT the default-pushed `metadata/` tree**, so none of it (least of all the synthetic `IsActive` accounts) ever reaches a production DB that only syncs `metadata/`. (The inert `Integration Test` TestType definition stays in normal `metadata/test-types/` — it's just a type row, no data or security surface — and the IT records `@lookup` it by name.) Seed the optional records with `mj sync push --dir=metadata-optional/integration-test`; the RLS checks skip-as-pass (with the exact push command logged) when absent.

  **Dashboard legibility.** The custom `MJ: Test Runs` form's `getCheckResults()` now reads `ResultDetails` as the bare `OracleResult[]` the engine actually writes (fixing per-check rendering for all engine runs; mapping extracted into an Angular-free, unit-tested `test-run-checks.ts`), and the runs view binds `<mj-execution-context>` to the run's machine/CI fields. The Test Run dialog's "Execution Failed" banner no longer renders empty — a `failureMessage` getter falls back through top-level `errorMessage` → a synthesized per-test summary → the single test's message → a generic note (applies to every TestType).

  **CI / release gate.** New `run-all.ts` aggregator + root `npm run test:integration` spawn each deterministic server suite in its own process (so each owns `LocalCacheManager.Initialize` as first caller) and collapse the per-suite `0/1/2` exit codes into one. The deterministic SQL Server tier is a blocking PR gate.

  **Cross-platform & cross-server seams.** `DbConfig` gains a `Platform` field (`DB_PLATFORM` ∈ {sqlserver, postgresql}, default sqlserver) and `bootstrapIntegrationServer` dispatches accordingly (the PG path ships behind the tracked PG user-cache prerequisite; no PG CI lane yet). A `RUN_CROSS_SERVER=1` spec proves a `Save()` in one MJAPI invalidates a cached read in a second sharing one DB + Redis.

  **RunView cache-layer fixes (`@memberjunction/core`).** Four real bugs the new suites surfaced, fixed in `localCacheManager.ts` + `providerBase.ts`:
  - **SECURITY:** the cache-hit path returned _before_ the DB provider's read-permission gate, so a user lacking `CanRead` could be served rows a permitted user had warmed (an observed cross-user data leak). `PreRunView` and the `RunViews` batch now skip the cache when the user lacks read permission on the entity, falling through to the DB path's proper denial (server-cache S31).
  - **SECURITY:** closed the **ViewID-only** variant of that bypass. The S31 gate keys off the entity resolved from `params.EntityName`; a `ViewID`/`ViewName`-only request (the Explorer-standard saved-view shape) resolved no entity there, so a read-denied user could still hit a slot a permitted user warmed for the same ViewID. `ProviderBase.cacheDeniedForViewOnlyRequest` (both cache paths) now resolves `ViewEntity` synchronously and applies the `CanRead` gate, or **fails closed** for a `ViewID`/`ViewName`-only request whose entity is only known after the async view lookup the cache-hit path skips. This also closes the RLS cross-serve for view-by-ID (two differently-scoped users no longer share a ViewID slot). Pinned by `providerBase.viewOnlyCacheGate.test.ts` + integration check server-cache **S31b** (**operators: prioritize this upgrade — S31 + S31b are both data-leak fixes**).
  - **SECURITY:** a **stored view's identity** now participates in the RunView cache fingerprint (`vw:` segment). A saved view carries its own server-side `WhereClause` that is not reflected in `params.ExtraFilter`, so a filtered view and a plain unfiltered read of the same entity previously produced identical fingerprints and cross-served — the view was handed the unfiltered slot and returned rows _outside its own WhereClause_. Keyed by ViewID / ViewName / ViewEntity PK, appended only when a view identifier is present → plain entity+filter fingerprints stay byte-identical, no cache invalidation (server-cache S29).
  - **`IgnoreMaxRows`** now participates in the RunView cache fingerprint, so an `IgnoreMaxRows` request no longer collides with (and is served) the capped slot for the same entity. Appended only when true → existing fingerprints stay byte-identical, no cache invalidation (server-cache S28).
  - **`AggregateResults`** are remapped to the caller's requested order on a cache hit; the aggregate fingerprint is order-insensitive by design, so a reordered request must not inherit the warming caller's order (aggregates-cache AGG3).

  **Review-response hardening (PR #3020).** Beyond S31b above: a lifecycle bundle's `Setup` and `Teardown` now run inside ONE `try/finally` on both front-ends (driver + tsx dispatchers), and every mutating fixture publishes its handle up-front + populates it as records are created — so a mid-`Setup` crash still tears down whatever was created instead of orphaning it (`runquery-cache` aligned to the shared lifecycle pattern). A single hung check is now bounded by the remaining run budget (a per-check race) instead of running past the driver timeout forever. The integration CI gate's trigger surface was widened (`migrations/**`, the `metadata-optional/**` root, `mj.config.cjs`/`tsconfig*`/`turbo.json`) and given a `push:` backstop mirroring the unit-test gate; the non-`Active` suite-membership exclusion is now surfaced with a concise always-on log; the testing CLI fails fast when it cannot install the instrumented cache first; and the sibling-parity drift-check was extended to cover the `run-all.ts` aggregator wiring and suite-join membership. `mj sync push` now honors `MJ_MIGRATION_REQUEST_TIMEOUT` (MetadataSync's env-driven config defaults, mirroring MJCLI) so the CI metadata push gets the same cold-server request-timeout headroom as `mj migrate` — mssql's 15s default could otherwise abort the push mid-transaction under embedding-on-save + engine-load latency on a cold runner.

  One related cache gap is **deliberately deferred** and documented in-check as a self-healing skip-as-pass: cross-entity **denormalization** invalidation (server-cache S30) — renaming a parent record does not invalidate cached child rows that denormalize its name, because invalidation keys on the changed entity, not on dependent entities. Fixing it requires fanning invalidation out to dependent entities (a broad, higher-risk change), tracked separately; the check re-arms automatically once that lands.

  All changes are additive / back-compat. Verified live against `mj_integrations` via both the `tsx` scripts and the `IntegrationTestDriver` (server-cache 31/31 with `RUN_MUTATION_TESTS`, aggregates-cache 3/3, rls-isolation 9/9; MJCore unit tests 1484/1484, testing-integration 145/145, testing-engine 45/45, testing-cli 23/23); golden-equivalence (`scripts/integration-golden-diff.mjs`) enforces no coverage loss between the two front-ends.

- f1ab36f: Integration-test expansion Wave 1 — three new bundles (26 checks), all client-first where a client surface exists.

  **`app-wiring` (10 checks, client-first)** — the "every shipped app is wired correctly" contract, parameterized over ALL applications so new apps inherit it automatically. Provider↔table parity, nav-item well-formedness, exactly-one-default-tab, **globally-unique DriverClass** (the catalog's latent risk #1), unique slugs, entity/role/settings link resolution, `CanAdmin ⇒ CanAccess`, agent-reference resolution, and non-Active apps excluded from new-user fan-out. Measured 25 apps / 77 nav items / **77 distinct DriverClass values, zero collisions**.

  **`view-execution` (9 checks, client-first)** — the Viewing System data layer over the real wire: dynamic filter row-set equality (by PK set, not counts), Filter-JSON→WHERE compilation, ExtraFilter injection guard, `Fields` projection (+forced PK), OFFSET and keyset pagination completeness (no dup/gap), composite-PK keyset refusal, MaxRows/IgnoreMaxRows, and aggregates-vs-pagination.

  **`metadata-consistency` (7 checks, server transport)** — metadata↔physical-DB audit sweeping all entities: generated views and CRUD procs exist, CHECK-constraint values match `EntityFieldValue`, FK indexes present, field sequences gapless and matching base-view column order, column descriptions, and SchemaInfo coverage/casing.

  Also adds the `G5` static CI gate (`.github/scripts/check-driverclass-registrations.sh`) for DriverClass→Angular `@RegisterClass` resolution, which no server-side check can observe.

  All three ship both parity siblings (tsx dispatcher + metadata IT record joined to the deterministic suite). Every collection-iterating check asserts its collection is non-empty first, so a failed load cannot pass vacuously.

  **MC6 is a ratchet, not an absolute gate**: 270 core-schema columns predate the describe-every-column rule, so it fails only when that count _grows_. PK/FK columns are exempt per `migrations/CLAUDE.md` (correcting an initial 1003 false-positive count).

- 4a03c37: Integration-test expansion Wave 2 — two new bundles (22 checks) covering the core write-side and the permission model.

  **`entity-writes` (8 checks, client-first)** — Record-Change fidelity (exact before/after `ChangesJSON`, offenders identified by content not position), virtual-field capture on both INSERT and UPDATE, keyset `AfterKey` completeness over a real fixture set, keyset guardrail refusals each differing from a passing control by exactly one illegal ingredient, dedup-linger invalidation after save, UUID case-insensitive FK round-trip, `datetimeoffset` round-trip to the millisecond, and server-side `ValidateAsync` enforcement that survives `SkipAsyncValidation`.

  **`permission-engine` (14 checks, client-first)** — provider fan-out from the `MJ: Permission Domains` catalog (every active row ClassFactory-resolves a matching provider), normalized `PermissionAction`/`GranteeType` vocabulary conformance, catalog↔provider capability agreement, unknown-domain fails **closed**, and the **two-access-path asymmetry** for Agents and Skills (cached helper open-by-default vs unified provider closed-by-default over the same table) — where the divergence itself is the assertion, so it cannot collapse silently. Plus grant-flips-the-default-off, permission collapse ordering, and two genuinely distinct identities proving a role-less user gets neither entity CRUD nor any of 13 authorizations.

  Both bundles ship all parity siblings and register best-effort teardown for their mutation-tier checks.

  Note: `permission-engine`'s PE13 is intentionally RED — it pins a confirmed defect where a single unresolvable provider breaks `GetAllUserPermissions` for every user. It is mutation-tier, so the default CI gate stays green.

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [6c910ef]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/server-bootstrap-lite@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/testing-engine@5.49.0
  - @memberjunction/testing-engine-base@5.49.0
  - @memberjunction/sqlserver-dataprovider@5.49.0

# Change Log - @memberjunction/core

## 5.51.2

### Patch Changes

- f560edc: Fix a `TypeError` that could kill an agent mid-run during context assembly, and take down scheduled-job dispatch entirely (`__mj_CreatedAt?.getTime is not a function`, `job.NextRunAt.getTime is not a function`).

  Two defects, one crash:
  - **`BaseEngine.OnExternalCacheChange` poisoned `entity_object` caches (the root cause).** When a cross-server cache-change event carried a payload, its rows — plain JSON objects, since cache payloads are serialized — were assigned straight into the engine property. For a config whose effective `ResultType` is `entity_object` (the default), that silently replaced the array's `BaseEntity` instances with plain objects, so `BaseEntity`'s coercing accessors were bypassed and a date field declared `Date` held a raw ISO string. Rows are now materialized via `TransformSimpleObjectToEntityObject` — the same conversion RunView's own cache-hit path uses — before assignment, with `'simple'` configs still passing through untouched and any failure degrading to the pre-existing full reload. Because materialization is async, the payload branch now claims a refresh generation (`beginConfigRefresh`/`isLatestConfigRefresh`, as `LoadSingleConfig` already does) so overlapping cache events cannot commit out of order. This affects **every** engine with `CacheLocal: true`.
  - **Unguarded `Date` method calls on those fields (the crash sites).** Optional chaining does not protect them — `"…"?.getTime` is `undefined`, and calling it throws. A new `ToEpochMs(value)` helper is exported from `@memberjunction/global` (a pure date utility — it needs no entity or metadata concepts) and now backs every affected read across four engines: `AgentContextInjector.sortExamples`/`sortNotes`, `AIEngine.fallbackGetNotesFromCache`/`fallbackGetExamplesFromCache`, `ConversationEngine.sortConversations`, and the scheduling engine's `isJobDue` plus its `NextRunAt`/`EndAt` diagnostics. It also closes a latent issue in the previous form: an Invalid `Date`'s `getTime()` returns `NaN`, which `?? 0` did not catch, yielding an incoherent comparator.

  Two exposures worth calling out. `AIEngine.fallbackGetNotesFromCache` is reached whenever the note vector service is uninitialized or a query embedding fails, so semantic retrieval with real input text could crash too — not just the empty-input path. And `SchedulingEngine.isJobDue` throws on the _first_ job in the dispatch loop, so a poisoned cache stopped **all** scheduled jobs from running, on every poll, until the cache reloaded.

  `isJobDue` also had a silent variant of the same bug: `evalTime < job.StartAt` does not throw on a string — relational operators coerce toward numbers, an ISO string yields `NaN`, and every comparison is false — so `StartAt`/`EndAt` activation windows silently stopped being enforced and a job could fire outside its range with nothing in the logs. Those comparisons now go through `ToEpochMs` as well.

  Making the cache-event path work also exposed a filtering gap (caught in review): `SchedulingEngineBase` loads `MJ: Scheduled Jobs` unfiltered and applies its Active-only invariant in memory, but only re-applied it on entity events — not after a cross-server cache event, whose payload carries every row. In a multi-instance deployment, one server's engine load could therefore hand another server's dispatch loop Disabled/Paused/Pending jobs. The engine now re-applies the filter (and notifies `JobsChanged$`) after `OnExternalCacheChange`, and `isJobDue` independently refuses non-Active jobs so dispatch can never depend on the array staying pre-filtered.

- 0130b53: fix(core): compare UUID primary keys case-insensitively in BaseEngine cache maintenance.

  `BaseEngine.findEntityIndexByPrimaryKeys` matched primary-key values with a raw `===`, so a UUID that arrived in different casing from different sources — a client-minted lowercase id from `BaseEntity.NewRecord` vs. an uppercase value loaded from SQL Server — failed to match and the event-driven "not found → add it" branch **appended a duplicate row** into the engine cache (the DB stayed correct; every consumer showed the row twice). The comparison is now driven off metadata — `EntityFieldInfo.IsUniqueIdentifier` (PG-aware) → `UUIDsEqual` for UUID columns, strict `===` for everything else — so no string-shape heuristic and non-UUID keys keep exact equality.

- Updated dependencies [f560edc]
  - @memberjunction/global@5.51.2
  - @memberjunction/sql-dialect@5.51.2

## 5.51.1

### Patch Changes

- cc6f321: security: validate and escape user-supplied values in SQL text-building paths, pin JWT algorithms, and compare the system API key in constant time

  Two upstream security commits landed without changesets; this records them for the release notes. All changes are additive/defensive and preserve existing behavior for legitimate inputs.

  **SQL filter validation (`@memberjunction/global`, `@memberjunction/core`, `@memberjunction/generic-database-provider`).**
  - `RunView`'s `ExcludeUserViewRunID` — a GraphQL string input — was interpolated raw into the view `WHERE` clause with no validation, unlike every sibling clause (`ExtraFilter`, `UserSearchString`, `OverrideExcludeFilter` all pass through `ValidateUserProvidedSQLClause`). The value is only ever a `UserViewRun` GUID, so it is now rejected unless it is a well-formed GUID, closing an authenticated injection sink that bypassed entity permissions and row-level security.
  - `DatabaseProviderBase.ValidateUserProvidedSQLClause` now denies `WAITFOR`, the time-based blind-injection vector. No legitimate filter or order-by clause uses it, and the intended subquery capability of `ExtraFilter` is unaffected.
  - `SQLExpressionValidator` now denies references to database system catalogs and metadata objects (`sys.*`, `INFORMATION_SCHEMA`, `syslogins`, `pg_catalog.*`, `pg_authid`/`pg_shadow`/`pg_user`/`pg_roles`) in **all** validation contexts, including `full_query`. These objects sit outside MemberJunction's entity-permission model, so permitting them turned a validated `SELECT` into a schema-enumeration and credential-exfiltration primitive. String literals are stripped before the check runs, so a literal value such as `'sys.x'` is still allowed.

  **Value escaping and parameterization (`@memberjunction/server`, `@memberjunction/core`, `@memberjunction/generic-database-provider`).**
  - `ReportResolver.CreateReportFromConversationDetailID` now binds `ConversationDetailID` through a parameterized `mssql` request as a `UniqueIdentifier` instead of interpolating it into the query string.
  - `GenericDatabaseProvider.CheckRecordRLS` now escapes embedded single quotes in primary-key values before building its `WHERE` clause, mirroring the escaping already present in the `Load()` path.
  - `RowLevelSecurityFilterInfo.MarkupFilterText` now escapes embedded single quotes in substituted user-property values, and treats `undefined` the same as `null`/object — leaving the token unresolved instead of substituting the literal string `"undefined"`.

  **Authentication hardening (`@memberjunction/server`, `@memberjunction/ai-mcp-server`).**
  - The superadmin `MJ_API_KEY` comparison in `getUserPayload` was a plain `===`, which short-circuits on the first differing byte and leaks a timing side channel. Both sides are now hashed to fixed-length SHA-256 digests and compared with `timingSafeEqual`.
  - JWT verification now explicitly pins the accepted signature algorithms to the asymmetric family (`RS256`/`RS384`/`RS512`, `ES256`/`ES384`/`ES512`, `PS256`) on both MJServer's issuer path and MCPServer's JWKS path — defense in depth against `alg=none` and RS256-to-HS256 confusion.

  Regression suites in each affected package pin the new behavior.

- e10a71f: security: harden SQL-filter validation, the OAuth callback handler, API-key lookup, and the new-user domain gate

  **SQL literal stripping (`@memberjunction/global`, `@memberjunction/core`).** Both of MJ's SQL screens — `DatabaseProviderBase.ValidateUserProvidedSQLClause` (which guards `ExtraFilter`, `OrderBy` and `UserSearchString`) and `SQLExpressionValidator` (which guards `Aggregates` and ad-hoc queries) — stripped string literals with a regex that honored **backslash escaping**. SQL Server and PostgreSQL do not treat `\` as an escape, so a payload such as `x = 'a\') ; DROP TABLE Users; --'` was swallowed whole as one "literal" and stripped away before the keyword denylist ran, while the database closed the literal at the real quote and executed the stacked statement. Both screens now share a single `StripSQLStringLiterals` helper that matches SQL-standard doubled-quote (`''`) semantics, and a regression suite in each package pins the behavior.

  **OAuth callback handler (`@memberjunction/server`).** Caller-supplied `connectionId` was interpolated into a raw `ExtraFilter` without escaping; it is now validated as a UUID at the request boundary and escaped at the SQL sink. `frontendReturnUrl` was redirected to after only a URL-parse check, making the callback an open redirect from the trusted MJAPI origin; its origin is now validated against `cors.allowedOrigins` (plus the built-in redirect origins) both when the flow is initiated and when the redirect is issued.

  If you run frontends other than MJExplorer against MJAPI, note that the return-URL allowlist is derived from `cors.allowedOrigins`. Deployments on the default `['*']` are unaffected — every return URL is still allowed. Deployments that have narrowed `cors.allowedOrigins` are mostly self-protecting, since a browser frontend must already be on that list to call `/oauth/initiate` at all, but three cases can now fall back to MJAPI's built-in page instead of returning to the app: a return URL on a _different_ origin than the caller, a server-to-server initiate whose return origin was never CORS-listed, and any proxy setup where the browser-visible origin differs from the configured one (matching is exact on scheme + host + port). Each rejection is logged with the offending URL.

  **API-key lookup (`@memberjunction/api-keys`).** `ValidateKeyByHash` now asserts its argument is a SHA-256 hex digest before building the SQL filter, enforcing the injection-safety invariant at the sink for all present and future callers.

  **⚠️ Behavior change — `userHandling.newUserAuthorizedDomains`.** The new-user domain gate previously authorized against the hostname parsed from the request's `Origin` header, which is trivially spoofable on non-browser requests: a holder of any valid IdP token could auto-provision an account under an authorized domain by forging `Origin`. It now authorizes against the **email domain of the verified identity token**.

  If `newUserLimitedToAuthorizedDomains` is enabled, review `newUserAuthorizedDomains` before upgrading:
  - Entries that are **frontend hostnames** (`app.example.com`, `localhost`) must be replaced with the **email domains** your users sign in with (`example.com`). Deployments where the two happened to coincide are unaffected.
  - Wildcards match in full, so `*.example.com` matches `mail.example.com` but **not** `example.com` — list both if you need both.
  - Identity providers that issue a bare username with no `email` claim can no longer auto-provision; the denial is logged explicitly. Configure the provider to emit an `email` claim, or set `newUserLimitedToAuthorizedDomains: false`.

  The gate is off by default (`newUserLimitedToAuthorizedDomains: false`, `newUserAuthorizedDomains: []`), so deployments that never enabled it are unaffected.

  **⚠️ Related expansion — MCP OAuth auto-provisioning.** Auto-provisioning previously also required a non-empty request `Origin` as a precondition for entering the check at all. `MCPServer`'s `resolveOAuthUser` passes no request domain, so with the domain gate enabled, MCP OAuth users could never be auto-created regardless of their email domain. Now that the spoofable precondition is gone, an MCP OAuth user whose **JWKS-verified** token carries an authorized email domain plus given/family name claims **will** be auto-provisioned, consistent with the browser path. If you run MCP with `newUserLimitedToAuthorizedDomains` enabled and were relying on that side effect to keep MJ user records from being created, add the restriction explicitly (narrow `newUserAuthorizedDomains`, or set `autoCreateNewUsers: false`).

- Updated dependencies [cc6f321]
- Updated dependencies [e10a71f]
  - @memberjunction/global@5.51.1
  - @memberjunction/sql-dialect@5.51.1

## 5.51.0

### Minor Changes

- a8fc549: - Fix BaseEngine cache callback fingerprint mismatch that broke cross-server invalidation via Redis pub/sub by extracting a shared BuildRunViewParamsForConfig method to ensure consistent RunViewParams across LoadSingleEntityConfig, LoadMultipleEntityConfigs, and RegisterCacheChangeCallbacks
  - Eliminate React CDN script execution order race condition in library-loader by enforcing sequential script loading
  - Make ChangeDetectorRef optional in BaseResourceComponent to prevent NG0201 injection errors
  - Regenerate spDeleteAIPrompt and spDeleteAIConfiguration stored procedures to remove stale AIPromptRun.AgentRunID cascade references

### Patch Changes

- @memberjunction/global@5.51.0
- @memberjunction/sql-dialect@5.51.0

## 5.50.0

### Minor Changes

- 623dfc5: Break CodeGen FK cycle between AIAgentRun, AIPromptRun, and ConversationDetail. Move SummaryPromptRunID from ConversationDetail to a new ConversationCompactionRun audit table. Remove AgentRunID from AIPromptRun (derivable via AIAgentRunStep.TargetLogID). Remove agentRunId from AIPromptParams and all write sites across the prompt/agent stack.
- 0ba33b3: Client-issue batch fixes. Exports (Query viewer, Data Explorer, and User Views) now cover the FULL result set — capped at 100k with an over-cap warning — instead of just the on-screen page, and the Data Explorer toolbar Export button opens a unified Excel/CSV/JSON dialog for every view type (Grid/Cards/Map/Timeline). UI-role users can now create and manage Lists, with owner-scoped delete (or Developer/Integration) enforced server-side on BOTH Lists and List Details — a List Detail's authorization is scoped through its parent List's owner, so a user can't delete membership rows of lists they don't own. Also: grid quick-filter matches hidden columns, primary-key integer columns render without thousands separators, the Queries search-box icon/placeholder overlap is fixed, and the streaming thinking-tag stripper no longer leaks partial `<think>`/`</think>` tags split across chunks — and now flushes a genuine trailing tag-prefix (e.g. a response ending in `<`) at end of stream instead of dropping it.

### Patch Changes

- ce6374c: Artifact engine no longer bulk-loads versions at boot; cache guarded.
- deb02b4: Surface parent errors when an IS-A (Table-Per-Type) parent save or delete fails. Previously `BaseEntity.Save` (and, symmetrically, `BaseEntity.Delete`) rolled back and returned `false` without recording anything on the child, so callers saw `LatestResult === null` and an empty `ResultHistory` — every result had been written to the parent object, which callers have no reference to. A child whose parent has NOT NULL columns the child never set therefore failed with no diagnostic anywhere reachable; the same black hole existed when a parent delete failed (e.g. an FK constraint upstream). The child now records a result carrying the parent's field-level errors, naming which parent entity failed, and falling back to the joined error text when the parent reports no message (validation failures leave `Message` empty). Mirrors the existing transaction-group-failure and catch-block paths, including the `currentResultCount` guard against double-reporting. Adds regression tests for both the parent-save and parent-delete failure paths.
- dd04a24: Widen the zod pin from `~3.24.4` to `^3.25.0` so it satisfies `@modelcontextprotocol/sdk`'s peer requirement (`zod ^3.25 || ^4.0`). The old tilde pin has no overlap with the SDK's peer range, which breaks strict package managers (pnpm) and MJCLI's oclif manifest generation under strict installs. zod 3.25.x keeps the classic v3 API at the root import, so this is a version-range correction with no behavior change.
  - @memberjunction/global@5.50.0
  - @memberjunction/sql-dialect@5.50.0

## 5.49.0

### Minor Changes

- c5e4b9e: Agent conversation compaction: durable cross-turn summaries stored on the conversation (Sequence + SummaryPromptRunID, budget knobs on AIAgentType/AIAgent, Compaction run steps), conversation-history retrieval tools (getMessageBySequence, getMessagesByRange, searchConversation, summarizeRange), edit handling with OriginalMessageChanged flagging and a wired chat edit affordance, plus hardening fixes: failed message expansions now surface a reason to the model (breaks an unbounded retry loop), json5 ESM import fix restores the local JSON-repair tier, and SQLConverter no longer truncates PG column comments at escaped apostrophes.

### Patch Changes

- 463aa51: Fix B38: in-place cache maintenance no longer strips `schemaHash`, which had silently disabled schema-drift detection.

  `UpsertSingleEntity`/`RemoveSingleEntity` rewrite a cached slot through `storeCachedResults`, which built a fresh payload carrying `results`, `maxUpdatedAt` and `totalRowCount` — but **not** `schemaHash`. Because `isSchemaStaleCacheEntry` short-circuits on a missing hash (`if (!data.schemaHash) return false`), a single save left that slot permanently unable to detect a post-migration column change. Reproduced: cold read → `1bd8ea31`; after one SAVE → `NONE`. Protection therefore covered only slots never written to.

  Same class of omission as #3195, which fixed `totalRowCount` being lost on this exact write path.

  The hash is **carried forward, not recomputed** — deliberately. Those rows were fetched under the _old_ schema; stamping today's hash onto them would assert they match the current field list and mask the very drift the guard exists to catch. `schemaHash` is now surfaced on `CachedRunViewResult` so the maintenance path can forward it.

  Guarded by `cache-gauntlet` CG6, which found the defect.

- 4c441dd: Close out every open cache-audit defect (B39–B44) plus the reachable differential throw found in adversarial round 3.
  - **B40** — `CacheLocal` + `Aggregates` returned no aggregates at all, even on a cold miss. Three independent drops in one pipe: the client's cache-check input map omitted `Aggregates` from the request, the resolver's coreParams map omitted them again, and the engine's `stale` reply dropped the computed results. All three now forward; the client parses values back to native types. `client-cache` is 13/13 and now registered in the deterministic gate.
  - **B39** — a `ViewID`-only `RunView` failed for _every_ caller (including the view's owner): the internal `MJ: User Views` lookup ran without a context user, and a miss fell through to `undefined` ("Entity undefined not found in metadata"). The user is now threaded through `EntityStatusCheck` → `GetEntityNameFromRunViewParams`, and a genuine miss throws an error naming the view and the cause.
  - **B41** — the differential-merge decline path now performs a **real full fetch** (CacheLocal stripped + BypassCache, so re-entry into the smart-cache transport is structurally impossible) instead of throwing away the caller's whole batch; with that fallback in place, the `hasNarrowingSegment` guard is restored on `ApplyDifferentialUpdate`.
  - **B42** — `OrderBy` (fingerprint segment [2]) joins the maintenance classifier: an in-place upsert appends out of order, so ordered slots invalidate on save (delete still removes in place — removal preserves relative order).
  - **B43** — the RunQuery TTL cache-hit now checks `UserCanRun` before serving; the fingerprint carries no user segment, so user A's warmed slot was served to user B with no permission check. Deny or unresolvable metadata falls through to normal, authorized execution.
  - **B44** — an every-field `Fields` list (the `entity_object` widening) now normalizes to `f:*` in the client fingerprint **only**, restoring in-place maintenance for the client's most common slot shape without touching what is fetched.

  Also: the round-3 finding that the "unreachable" differential throw was in fact reachable (aggregate slots and defensive `MaxRows` caps both failed live) is fixed at the server seam — `RunViewsWithCacheCheck` no longer offers a differential for subset/aggregate-shaped params, falling back to the same full-refresh path its own validation already uses.

- 1e5b9b2: Fix a structural defect in RunView cache maintenance classification, plus the two holes it caused.

  Three shipped bugs (#3195 `totalRowCount`, #3199 rows, B38 `schemaHash`) were all symptoms of one root cause: `isFilteredFingerprint` inspected **only** fingerprint segment `[1]`, so segments appended later were silently classified as "safe to maintain in place":
  - **H1** — a saved view's `WhereClause` lives on the VIEW, not in `params.ExtraFilter`, so the filter segment stays `_`. Its slot was upserted in place on save and served rows the view's own `WhereClause` excludes. Views are how users are shown a restricted row set, so this reads as a data/permission leak.
  - **H3** — the per-user RLS predicate is appended as `rls:<hash>` after the filter segment is built. Same misclassification: a save by user A was upserted into user B's RLS-scoped slot, injecting a row B's predicate excludes. An RLS bypass.

  `hasNarrowingSegment()` replaces the segment-`[1]` check with a **deny-by-default allowlist**: only `imr:` (which widens the set) and the connection suffix are treated as safe; everything else, _including unknown future segments_, is treated as narrowing. A new segment can now cost a cache refill, but can never silently serve wrong rows.

  **H2** — aggregates were dropped by in-place maintenance, so a caller that asked for `COUNT(*)` got `Success: true` with no aggregate. The first fix attempt _carried the cached aggregate forward_ and was worse: it served `rows=7` alongside `COUNT(*)=6`. A caller can detect a missing aggregate; it cannot detect a stale one. Aggregate-bearing slots (`aggHash` segment) are now invalidated on **either** mutation, since the value is not derivable in JS. The delete branch previously bypassed classification entirely and now consults it.

  **H4/H5** — `ApplyDifferentialUpdate` refuses to merge into subset, narrowing, or aggregate slots, invalidating instead. It recomputed `schemaHash` (stamping today's schema onto rows fetched under the old one, masking drift) and still shrank subset slots — the third instance of #3199, previously unpinned by any test.

  **H6** — `cross-server-invalidation-tests.ts` documented that run-all included it behind `RUN_CROSS_SERVER=1`; that inclusion never existed, so it had never run in the gate. Now registered behind its documented gate.

  New `cache-gauntlet` checks CG7 (view slot) and CG8 (aggregate consistency) pin H1 and H2 live; the unit slot-maintenance matrix gains view/aggregate rows plus deny-by-default property tests.

- a8cb2b6: Explicit ClassFactory resolution failure + permission provider fault isolation (B34/B35)

  `ClassFactory.CreateInstance` has never returned `null` for an unregistered key — it falls back to
  instantiating the anchor base class — so every call site written as `if (instance) { use } else { error }`
  had a dead failure branch and silently installed a hollow base-class object.
  - **`@memberjunction/global`**: adds `TryCreateInstance` / `TryCreateInstanceAsync`, which return an
    explicit `ClassResolutionResult<T>` (`Resolved` / `Instance` / `Reason`). Bases that cannot function
    standalone opt in with `static readonly RequiresSubclass = true`: on a fallback they now throw from
    `CreateInstance` and return `{Resolved: false, Instance: null}` from `TryCreateInstance`. Bases without
    the marker keep the historical base-class fallback (e.g. `BaseEntity`) and emit a structured, once-per-key
    warning listing the registered keys for that base plus the call-site stack. `CreateInstance`,
    `CreateInstanceAsync`, and the `Try*` variants all route through one shared resolution path.
  - **`@memberjunction/core`**: `PermissionProviderBase` declares `RequiresSubclass = true` — every member is
    abstract, so a base instance is a method-less stub.
  - **`@memberjunction/core-entities`**: `PermissionEngine.instantiateProviders` uses `TryCreateInstance`, so
    an unresolvable `ProviderClassName` is now genuinely skipped instead of installing a stub as a live
    provider. The `GetAllUserPermissions` / `GetPermissionsGrantedByUser` / `GetPermissionsSharedWithUser`
    fan-outs defer each provider call into a promise body so a SYNCHRONOUS throw (a missing method) is
    isolated by `Promise.allSettled` instead of rejecting the entire aggregate for every user.

- 505c8b5: Fix browser freeze on entity record views whose entity has an integer (non-UUID) primary key.

  `CompositeKey.EqualsKey` compared a loaded entity's raw scalar PK (a JS `number`, e.g. `5`)
  against the URL/tab-derived string form (`"5"`, produced by URL-segment parsing). The strict
  `!==` between a number and a string is always true, so record-identity checks never converged
  for integer PKs — the record view re-ran its work every change-detection/navigation cycle and
  looped indefinitely, freezing the browser tab (most visibly on back/forward navigation). UUID
  PKs are strings on both sides, so they were unaffected. Scalar values are now string-coerced
  before comparison; the case-insensitive `UUIDsEqual` path for string/string values is unchanged.

  Also hardens the Explorer shell's record URL building: the `CompositeKey` URL segment (`ID|<value>`)
  now has its `|` encoded so the built URL matches Angular's serialized `router.url` (which
  percent-encodes `|` to `%7C`). Previously the raw pipe made `syncUrlWithWorkspace`'s
  `currentUrl !== newUrl` check permanently true, a latent re-navigation loop under
  `onSameUrlNavigation: 'reload'`. The read side already `decodeURIComponent()`s this segment, so
  both sides stay consistent.

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

- 85575cf: Fix: MaxRows-limited RunView results are no longer maintained in place by the local cache. A `MaxRows`/`StartRow` slot holds a truncated/offset SUBSET of the matching set, so upserting a saved row grew it past the caller's own row limit (a `MaxRows: 1` slot served 2, 3, 4 … rows) and removing a deleted row shrank it below. Such slots are now conservatively invalidated on save/delete — the same treatment filtered slots already receive — and repopulated from the database on the next read.
- 9c07270: Convert the `RequiresSubclass` marker from a static class property to a `@RequiresSubclass()` decorator, and fix an inheritance bug in how it was read.

  `@RequiresSubclass()` applies an own, non-enumerable marker (`__mj_RequiresSubclass`) to the class prototype, and `ClassRequiresSubclass(classOrInstance)` reads it via an **own-property** check.

  That own-property semantics is the substantive change. The previous `(baseClass as X).RequiresSubclass === true` read walked the constructor prototype chain, so **every subclass of a marked base also reported `true`** — meaning a ClassFactory resolution against a concrete, perfectly instantiable subclass would have wrongly thrown. The marker now applies to exactly the class that declared it.

  The decorator also matches the existing `@RegisterClass` idiom, keeps the marker key defined in one place rather than retyped as a literal per base, and centralizes the own-property check so call sites can't get it wrong.

  Backward compatible: the legacy `static RequiresSubclass = true` form is still honored (with the same own-property semantics).

- e945700: Fix a null-dereference crash when a `RunView` with `ResultType: 'entity_object'` (or a `Fields` projection) materializes an entity whose registered class cannot be constructed in the current runtime context — for example a server-only `*EntityServer` subclass instantiated inside a client/GraphQL process, where its constructor intentionally throws. `ProviderBase.GetEntityObject` now falls back to the generic `BaseEntity` (the same class a context without that subclass registered — a real browser client — resolves), and `TransformSimpleObjectToEntityObject` emits a clear, actionable error instead of dereferencing `null.constructor`. Surfaced by a client-first integration RunView sweep across all entities. Also corrects the ServerBootstrap class-registration manifest count constant (975 → 976) to match the actual registration array length.
- 1475e6c: Fix RunView `TotalRowCount` diverging between `count_only` and paginated reads. The local cache maintained `totalRowCount` as the size of the cached slice rather than the database total, so for a paginated / `MaxRows`-limited slot the total collapsed to the subset size after the first differential merge or in-place save/delete event. A fresh `count_only` read (never cached) then reported a larger count than a cached paginated read of the same entity. `ApplyDifferentialUpdate` now honors the server's authoritative row count, and the in-place upsert/remove path maintains the total across the row delta instead of dropping it.
- 6d0ec83: Run registered PreRunView AND PostRunView data hooks on the `RunViewsWithCacheCheck` path (engaged by `CacheLocal` RunViews and directly invokable by clients over GraphQL). It previously executed via `buildWhereClauseForCacheCheck` / `InternalRunView` without applying either hook, silently skipping BOTH halves of the enforcement seam: **PreRunView** (input scoping filters middleware injects into `ExtraFilter`) and **PostRunView** (output data masking / audit of the returned rows). PreRunView now runs once per item before the cache-currency check and every execution leg; PostRunView runs once per row-bearing item at the outbound boundary — after projection, per request, never baked into the shared cache — so rows returned via any leg (fresh query, server-cache serve, or differential) get the same masking the hooked non-cached path applies. `current` items carry no rows (the client keeps its cache, masked when an earlier response populated it). RLS, applied deeper in the provider, was never affected. Both `RunPreRunViewHooks` and `RunPostRunViewHooks` are made `protected` on `ProviderBase` for this sibling pipeline. `RunQueriesWithCacheCheck` is deliberately untouched — there is no `PreRunQuery`/`PostRunQuery` hook seam.
- 70c658c: Add configurable startup mode ('full' | 'task') for fast CLI/script boot. StartupManager.Startup() accepts startup options; 'task' mode skips all @RegisterForStartup engine pre-warm (engines lazy-load on first touch) while 'full' preserves existing behavior. Mode resolves via a shared four-level precedence chain (MJ_STARTUP_MODE env var > programmatic option > mj.config.cjs startup.mode > entry-point default). MJAPI defaults to 'full'; MJCLI, mj-sync, and CodeGen default to 'task'. Measured 14x CPU reduction on mj sync validate.
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [9c07270]
  - @memberjunction/global@5.49.0
  - @memberjunction/sql-dialect@5.49.0

## 5.48.0

### Patch Changes

- 09e1b4b: Fix Apply to my Form (resolve spec code, handle Pending overrides, improve # typeahead), auto-add app schemas to excludeSchemas on OpenApp install/upgrade, surface RenderedSQL through RunQueryResult and TestQuerySQL, strip ORDER BY before outer-wrapping unparseable SQL in MaxRows, fix lazy-config loader variable name collisions in codegen manifest, and add read-only provider support and missing SQL function keywords in PostgreSQL provider
  - @memberjunction/global@5.48.0
  - @memberjunction/sql-dialect@5.48.0

## 5.47.0

### Patch Changes

- b216f2b: Fix: a failed `TransactionGroup` no longer crashes the host process. **Both** `BaseEntity.Save()`'s and `BaseEntity.Delete()`'s `TransactionNotifications$` subscribers mishandled failure in an async rxjs `next`-handler that runs after the enclosing `try/catch` has unwound — `Save()` threw the notification error outright, and `Delete()` dereferenced `error.Errors` unguarded, a `TypeError` when the transaction group signals failure via returned per-item results with no error object (the GraphQL-client transaction group's shape). rxjs re-throws either on a fresh macrotask → `uncaughtException` → process exit (MJServer guards `unhandledRejection` but not `uncaughtException`). Both subscribers now record a failed `BaseEntityResult` on the entity's `ResultHistory` — null-safely, and guarded so a provider that already recorded the failure isn't double-recorded. The transaction still rolls back, `Submit()` still returns `false`, and each entity's `LatestResult.Success === false`.
- Updated dependencies [06a1e44]
- Updated dependencies [31da520]
  - @memberjunction/sql-dialect@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- d526470: Fix the MergeRecords GraphQL mutation end-to-end. Server: rehydrate the input's plain `{ KeyValuePairs }` objects into `CompositeKey` class instances before calling the provider (every merge previously failed with "request.SurvivingRecordCompositeKey.Values is not a function"), and correct the `RecordMergeLogID` / `RecordMergeDeletionLogID` output field types from `Int` to `String` — merge log IDs are uniqueidentifiers since the v2 GUID migration, so successful merges failed at response serialization of the `RecordMergeLogID` GUID. Core: `CompleteMergeLogging` now writes each deletion log's ID back into `RecordStatus[].RecordMergeDeletionLogID` (it was created but never returned, so the field was always null), and `RecordMergeDetailResult.RecordMergeDeletionLogID` is typed `string | null` to match the GUID it actually carries (was `number | null`).
- 84fa44c: Stop deep-cloning the metadata graph for providers that reuse the global provider's metadata (#3083). The reuse fast path (`ignoreExistingMetadata: false` — MJServer's per-request providers) now builds a per-instance AllMetadata shell: shallow-copied array containers whose elements are the global provider's immutable-post-Config Info object instances, instead of re-instantiating every EntityInfo/EntityFieldInfo/etc. (~1s of synchronous, event-loop-blocking constructor work per provider on a ~600-entity install, twice per GraphQL request — and the blocking made concurrent requests inflate each other; the shell is microseconds). Because the top-level array containers are per-instance, in-place array mutations (sort/push/splice) on the ~20 AllMetadata collections themselves (provider.Entities, AllQueries, etc.) by request-scoped code stay request-local exactly as they did in the deep-clone era. Everything BELOW that level is shared: the Info objects must be treated as read-only (as they always were on a client's global provider), and that includes their nested arrays — an in-place sort/push on entity.Fields, entity.RelatedEntities, application.ApplicationEntities, and the like now mutates process-wide state, where the deep clone kept it request-local (a repo-wide sweep found no code doing this today). CurrentUser stays per-instance, so RLS fallback semantics are unchanged. Subclass overrides of CloneAllMetadata are still honored on the fast path for backward compatibility (new code should override CreateSharedMetadataShell). Reuse-path providers also now build their entity lookup maps (EntityByName/EntityByID were silently falling back to linear scans), and the fast path requires the global provider to actually have entities loaded (an unconfigured global no longer donates an empty graph). Also fixes entity-permissions' entity selector mutating the provider's live Entities array via in-place sort.
  - @memberjunction/global@5.46.0
  - @memberjunction/sql-dialect@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/global@5.45.1
- @memberjunction/sql-dialect@5.45.1

## 5.45.0

### Minor Changes

- 45d121b: Use entityPrimaryKeys for DataGrid React row keys and update metadata component definitions
- 21e33fe: Move Skip to a client-side Open App and remove server-embedded agent; scope-gate query/view/search resolvers with API-key scope authorization; add credential-store fallback for component registry keys; support Open App in-process lifecycle hooks with interactive prompts.
- b7cf50f: CodeGen-integrated external-entity field sync (`manageExternalEntities`).

  CodeGen now introspects the **remote** schema of external-data-source entities and syncs their `EntityField` metadata — the remote analogue of how it already manages view-backed `VirtualEntity` fields from `INFORMATION_SCHEMA`. This removes the manual-field-definition limitation for external entities.
  - **`@memberjunction/core`**: the schema-introspection contracts (`ExternalObjectType` / `ExternalSchemaColumn` / `ExternalSchemaObject` / `ExternalSchemaDescriptor`) move here from the engine; `ExternalDataSourceReadRouter` gains abstract `IntrospectExternalSchema(externalDataSourceID, schemaName?, contextUser?, provider?)` — so build-time consumers reference them without a hard dependency on the engine/driver SDKs.
  - **`@memberjunction/external-data-sources`**: `ExternalDataSourceReadRouterImpl.IntrospectExternalSchema` resolves the driver and delegates to its `IntrospectSchema`.
  - **`@memberjunction/codegen-lib`**: a new `manageExternalEntities` / `manageSingleExternalEntity` pass (mirroring `manageSingleVirtualEntity`) introspects each external entity's remote object, maps native types to MJ types (`mapExternalNativeTypeToMJ` — best-effort across PostgreSQL/Snowflake/MongoDB, falling back to `nvarchar(MAX)`), and creates/updates/deletes `EntityField` rows, reusing the virtual-entity field machinery. Real PK info from introspection is honored (falling back to first-column-as-PK).

  The pass resolves the router via `MJGlobal.ClassFactory`, so it requires the EDS engine + the relevant driver to be loaded in the CodeGen process; when none is registered it logs a clear message and skips (no effect on non-external entities). Native-type→MJ mapping is best-effort and refined by the existing LLM field-decoration pass + review.

- f4f11fa: External Data Sources — read MJ entities and queries directly from remote systems (Snowflake, MongoDB, PostgreSQL) without replicating their data into the MJ database.

  An Entity (or Query) that carries an `ExternalDataSourceID` is proxied live to a remote system through a pluggable driver, then returned through MJ's standard typed `RunView` / `RunQuery` / `Load` APIs. Behavior is fully additive: any entity/query with a null `ExternalDataSourceID` is unchanged and never touches the new code path.
  - **`@memberjunction/core`**: new abstract `ExternalDataSourceReadRouter` — the dependency-inversion seam (`RunViewExternal` / `RunQueryExternal` / `GetCacheTTLSeconds`) that lets foundational providers reach the EDS engine via `MJGlobal.ClassFactory` without any compile-time dependency on driver SDKs or the credential subsystem. `EntityInfo` gains `ExternalDataSourceID` / `ExternalObjectName`. `LocalCacheManager.SetRunViewResult` gains an optional `ttlMs` (with read-time expiry) so external reads can be time-bounded like RunQuery already is.
  - **`@memberjunction/core-entities`**: `ReadOnlyExternalBaseEntity` — `BaseEntity` subclass whose `Save`/`Delete` reject (populating `LatestResult`); MJ is never the system of record for external data.
  - **`@memberjunction/external-data-sources`**: the server-only engine — `ExternalDataSourceReadRouterImpl` (registered for the ClassFactory), `BaseExternalDataSourceDriver` contract, and `ExternalDataSourceRouter` (per-source driver + connection-pool cache, credential resolution). `BaseExternalDataSourceDriver` now provides `withConnectionRetry` — on an auth/credential failure it evicts the cached connection (forcing a fresh credential resolve) and retries the read once, self-healing rotated/expired credentials without a process restart; each driver implements `invalidateConnection`.
  - **Drivers** — `@memberjunction/external-data-source-postgres`, `…-snowflake` (PAT auth; `snowflake-sdk` as an optional peer loaded by dynamic import to avoid AWS-SDK version skew), `…-mongodb` (SQL-`WHERE`→Mongo filter translation, document-sampling introspection). Each wraps its read operations in the auth-retry self-heal and closes the evicted connection on the failure path.
  - **`@memberjunction/generic-database-provider`**: external dispatch for `RunView`, `RunQuery`, and single-record `Load` — guarded by an `ExternalDataSourceID` null check so MJ-DB entities are untouched. Browser/Explorer reads flow through the same provider path, so they route externally transparently. External `RunQuery` results are checked against the query's declared `QueryField` metadata (case-insensitive); when a remote object's columns have drifted, a warning is logged naming the missing field(s) while the rows are still returned (non-fatal, per the plan). External reads (both `RunView` and `RunQuery`) are cached with a TTL sourced from the data source's `DefaultCacheTTLSeconds` — external data can't be event-invalidated, so it's time-bounded instead (mitigating per-query cost on warehouses); external `RunView` writes without a TTL are refused to prevent stale-forever entries. External reads also **refuse rather than silently bypass** Row-Level Security — if RLS would filter a user's rows the read is rejected with a clear error (RLS can't be enforced on a remote system; users exempt from RLS pass through), and the external single-record `Load` primary-key filter single-quote-escapes values to block SQL injection. Unsupported external RunView params (AfterKey/keyset pagination, Aggregates, a non-empty UserSearchString) now hard-fail with a clear error instead of being silently dropped — a dropped AfterKey would otherwise return the same page on every call (an infinite loop in deep-pagination jobs). External read results now run through the same row post-processing MJ-DB reads get (field decryption + datetime normalization), so an Encrypt-flagged external field no longer surfaces as ciphertext.
  - **`@memberjunction/codegen-lib`**: external-backed entities now generate to extend `ReadOnlyExternalBaseEntity` (explicit custom subclasses still take precedence), and CodeGen skips all SQL-object generation (sprocs/views/permissions/FK-indexes) for them since no MJ table exists. GraphQL Create/Update/Delete mutation resolvers are still generated (gated only by `Allow*API`, like any entity) — they route through `entity.Save()`/`.Delete()`, which `ReadOnlyExternalBaseEntity` rejects before any sproc is reached, so an attempted write **fails loudly** with the read-only reason rather than silently lacking a resolver. (No sproc is generated for these entities, but none is ever called.)

  Additional hardening: the Postgres driver now **verifies TLS server certificates by default** (`sslRejectUnauthorized`, opt-out only for knowingly-accepted self-signed dev endpoints) instead of silently accepting any certificate; an unbounded external `RunView` (no `MaxRows`) is capped to the entity's `UserViewMaxRows` or a 1000-row default so a single read can't pull an entire remote table; caller-supplied `ExtraFilter` / `OrderBy` clauses are screened for forbidden SQL keywords before reaching the driver (the same screen the MJ-DB path applies); and a saved **UserView** over an external entity now has its stored `WhereClause` / `OrderByClause` folded into the remote read (previously the external dispatch returned before they were applied, so a view silently returned unfiltered, unordered rows).

  Dispatch-completeness fixes (an audit found read paths that bypassed external routing): CodeGen's PostgreSQL phased executor now skips external entities (it previously regenerated view/CRUD DDL and would `CREATE VIEW` against a non-existent base table); datasets fail loud per-item for external-backed entities rather than querying a non-existent MJ base view; `RunViewsWithCacheCheck` routes external entities to the standard external-dispatch path instead of issuing MJ-DB `COUNT/MAX` validation SQL; and external saved queries skip the outer `RunQuery` `CacheLocal` layer so only the TTL-correct `runExternalQueryWithCache` caches them. Two further validation tightenings: a saved view's merged `WhereClause`/`OrderByClause` is now re-screened for forbidden SQL keywords before reaching the driver, and non-quoted (numeric/boolean) primary-key values in the external `Load` filter are type-checked to block unquoted injection. Read-only is also enforced at the **provider layer** — `DatabaseProviderBase.Save`/`Delete` refuse any external-data-source entity regardless of its generated base class (a backstop for the edge case where an explicit custom subclass replaces `ReadOnlyExternalBaseEntity`). And the SQL drivers are **secure-by-default on transport**: Postgres/MongoDB refuse a plaintext connection to a non-local host unless TLS is enabled or `allowInsecureTransport: true` is explicitly set (local hosts stay exempt for dev).

  The starter `ExternalDataSourceType` catalog now seeds **PostgreSQL, Snowflake, and MongoDB** (all `Active` — the shipped drivers), and a developer guide ships at `guides/EXTERNAL_DATA_SOURCES_GUIDE.md`.

  Two new metadata tables (`ExternalDataSource`, `ExternalDataSourceType`) and additive `Entity` / `Query` columns ship in migration `v5.42`. Validated live end-to-end against real Snowflake and MongoDB. SQL Server as an external source is a deliberate fast-follow. Comprehensive unit tests across the engine, drivers, and CodeGen, plus CI-runnable Postgres/MongoDB driver integration suites.

- b2927f1: Omnibus fixes: (1) skill-granted sub-agent execution — resolveSubAgentByName now resolves from the same runtime-effective set the prompt offers and validation approves (skill activations / subAgentChanges), the resolved entity threads into child dispatch, and execution-time not-found retries are bounded by the shared validation-retry cap with a self-correcting available-sub-agents message (fixes an infinite delegation loop observed live on Research Agent → Infographic Agent); (2) RunView dedup/linger cache write-invalidation on entity events (@memberjunction/core); (3) regenerated class-registration manifests.

### Patch Changes

- e370816: External-schema introspection: relationships (foreign keys), PascalCase contract, and Postgres FK discovery.
  - **Relationships seam** — `ExternalSchemaObject` gains an optional, additive `Relationships?: ExternalSchemaRelationship[]`: referencing-side foreign-key descriptors with composite-key support via `ExternalSchemaRelationshipColumn` (`Column` → `ReferencedColumn` pairings, plus `ReferencedObject` / `ReferencedSchema` / optional constraint `Name`).
  - **PascalCase contract** — the whole introspection contract (`ExternalSchemaColumn` / `ExternalSchemaObject` / `ExternalSchemaDescriptor` / the new relationship types) now uses PascalCase members (`Name`, `NativeType`, `Nullable`, `IsPrimaryKey`, `Columns`, `Objects`, `Database`, …), matching MJ's convention for public/exported members (every other exported `@memberjunction/core` interface is PascalCase). The three shipped drivers and CodeGen's `manageExternalEntities` are updated accordingly; contained to the EDS subsystem.
  - **Postgres FK introspection** — the PostgreSQL driver now populates `Relationships` from `information_schema` (referential_constraints + key_column_usage paired via the unique-constraint position, so composite keys map correctly). MongoDB has no foreign keys, and Snowflake's `INFORMATION_SCHEMA` does not expose them reliably, so those leave `Relationships` empty.
  - **CodeGen FK consumption (baseline)** — `manageExternalEntities` now consumes the introspected `Relationships`: for each single-column FK whose referenced remote object is _also_ an imported external entity in the same data source, it sets the FK field's `RelatedEntityID` + `RelatedEntityFieldName` + `IsSoftForeignKey`, then a second `manageEntityRelationships` pass materializes them into `EntityRelationship` records (the external FKs are processed after the main relationship pass, so they get their own). Composite FKs and references to non-imported objects are skipped with a log — that hardening is the follow-on. Verified end-to-end via CodeGen against a live Postgres source (an external `orders.customer_id → customers.id` FK becomes a Demo Customers → Demo Orders relationship). CodeGen also now loads the SQL Server / MySQL / Oracle driver packages so external entities backed by those sources can be introspected.
  - **Connection model** — confirmed (and unit-tested) that a single driver instance holds one connection pool per configured data source (`Map<dataSourceId, pool>`), so any number of independent connections per driver type is supported.

- fbee64c: Fix intermittent stale installed-apps state in the Home dashboard and app switcher. BaseEngine's entity-event skip-guards previously dropped the observer notification along with the redundant refresh whenever an event's changes were already reflected in an engine array (in-place save of a cached instance, manual push after create) — so UserInfoEngine's Install/Enable/Disable/UninstallApplication flows never emitted DataChange$ and ApplicationManager.applications$ went permanently stale. Skip paths now emit through the new notifyAlreadyAppliedMutation. Hardening in the same pass: the debounced pipeline buffers ALL events per window and decides refresh-vs-skip as an OR over the batch (ProcessEntityEvents — a lone in-place save can no longer mask a coalesced fresh-instance save); delete membership checks key off the event payload's pre-delete OldValues snapshot (Delete() re-keys the entity via NewRecord() before the debounced handler runs); deletes of rows absent from an array stay silent to avoid phantom delete events on filtered configs (manual-splice engine code notifies explicitly — UninstallApplication now does); transiently-failed event-triggered refreshes get a bounded, backed-off retry instead of stranding observers until an unrelated event; applyImmediateMutation's already-in-array branches gained the same DataChange$ parity. The 'MJ: User Applications' config now uses a 200ms DebounceTime (vs the 1500ms default) so app-config dialog saves reach the UI near-instantly.
- 0b1e009: Fix installed-apps (and any filtered/ordered `BaseEngine` cache) staying "one operation behind" after a multi-change save. Two complementary `BaseEngine` fixes:
  1. **Event-triggered refreshes now read with `BypassCache`** (the operative fix). When a BaseEntity save/delete triggers a full refresh of a config that can't be updated in place (has a Filter/OrderBy — e.g. `UserInfoEngine`'s per-user `_UserApplications`), the refresh was reading back a stale server-cached view result — the cache entry the triggering write should have invalidated — so the engine cache re-synced the PRE-write snapshot and the UI trailed by one operation until a full page reload. The "data just changed, re-read" path (`ProcessEntityEvents`) now reads true DB state instead of through a cache the write just made stale.
  2. **Concurrent full refreshes are ordered by a per-property generation guard** (hardening). `LoadSingleEntityConfig` claims a monotonic generation before its `RunView` and only commits results if still the latest when the view returns — so when several event-driven refreshes overlap (a burst of saves each landing in its own debounce window), the latest-INITIATED refresh wins rather than whichever RunView happens to resolve last. Prevents an earlier refresh that read a staler state from clobbering a newer one.

  Together these fix the multi-op regression (adding/removing/reordering several apps in one save) that single-operation paths didn't surface. Single-refresh behavior is unchanged.

- Updated dependencies [c1f2d3d]
  - @memberjunction/global@5.45.0
  - @memberjunction/sql-dialect@5.45.0

## 5.44.0

### Minor Changes

- 7279819: Fixes PostgreSQL lowercase-schema entity class names breaking mixed-case OpenApp builds.
- 6f74b17: Add an LLM/agentic reasoning pass on top of the embedding/vector duplicate-detection pipeline — "vectors filter, reasoning validates". A small/fast LLM judges high-probability vector candidates (Merge / NotDuplicate / Uncertain) to shrink the human-review set, strengthening or weakening the vector score rather than replacing it. Adds a dual-provider reasoning seam (Prompt/Agent), per-entity gating (EnableLLMReasoning, ReasoningThreshold, AutomationLevel), per-candidate verdict/audit columns, the new @memberjunction/record-comparison engine + resolver/client, and an in-place reasoning UI in the duplicates dashboard. Fully back-compat: EnableLLMReasoning defaults to 0, leaving the vector-only path byte-for-byte unchanged.
- 2f9b863: Add WorkOS (AuthKit) as a first-class authentication provider — end to end, server-side JWT validation and browser-side login. A deployment can now set `type: 'workos'` (server) / `AUTH_TYPE: 'workos'` (browser) and authenticate users through WorkOS just like Auth0, Okta, MSAL, Cognito, or Google.
  - **Server** (`@memberjunction/auth-providers`): `WorkOSProvider` extends `BaseAuthProvider`, registered via `@RegisterClass(BaseAuthProvider, 'workos')`. Maps AuthKit JWT claims to `AuthUserInfo` (with graceful fallbacks) and validates `clientId`; issuer matching, JWKS caching, and retry/backoff are inherited. Wired into `AuthProviderFactory`.
  - **Client** (`@memberjunction/ng-auth-services`): `MJWorkOSProvider` extends `MJAuthBase`, registered via `@RegisterClass(MJAuthBase, 'workos')`. Wraps the `@workos-inc/authkit-js` SDK (`createClient`/`signIn`/`signOut`/`getUser`/`getAccessToken`) behind the standardized provider contract with semantic error classification.
  - **Core** (`@memberjunction/core`): `AUTH_PROVIDER_TYPES` gains `WORKOS: 'workos'`.
  - **Env typing** (`@memberjunction/ng-bootstrap`): the `AUTH_TYPE` union gains `'workos'`, plus `WORKOS_CLIENTID` / `WORKOS_REDIRECT_URI` / `WORKOS_API_HOSTNAME` / `WORKOS_DEV_MODE` keys.

  Includes a full end-to-end integration guide (`packages/AuthProviders/WORKOS.md`) covering the two WorkOS-specific gotchas: the required `email` JWT Template (AuthKit access tokens omit email, which MJ keys users on) and matching the enforced `aud` claim. Additive only.

### Patch Changes

- 5396d90: Add permission-constrained engine loading to BaseEngine — pre-checks entity read permissions during Config() and skips all entity configs (all-or-nothing) when the user lacks access, preventing endless retry loops and console error flooding for org-scoped SaaS users. Engine getters now use GetConfigData() which throws a typed PermissionConstrainedError instead of silently returning empty arrays. Also fixes unsafe GetHighestPowerModel/GetHighestPowerLLM return types and resolves FK_AIAgentRunStep_ParentID race in fire-and-forget step saves.
- d44e430: fix(MJCore): mint the shared IS-A primary key at the root in BaseEntity.NewRecord

  IS-A (Table-Per-Type) child entities share one primary key with their parent chain. NewRecord generated the child's key first, then the parent's own NewRecord() discarded and regenerated it, leaving the child's own PK field stranded at a stale value that the save-SQL builder then INSERTed — causing a foreign-key violation (e.g. FK_ACP_Company). NewRecord now creates the parent chain first (the root mints the single shared key), adopts it onto each level (authoritative routed read + local write), and applies caller newValues last so an explicit PK is honored rather than clobbered. Non-IS-A entities are unaffected.

- Updated dependencies [5396d90]
  - @memberjunction/global@5.44.0
  - @memberjunction/sql-dialect@5.44.0

## 5.43.0

### Minor Changes

- 40eb4e0: Remove leftover integration metadata folders that survived the connector-metadata removal (#2942). Connectors are now managed in the `MemberJunction/Integrations` repo, so MJ carries none of this:
  - `metadata/integration-object-deletes/` — stale one-time `deleteRecord` marker files (`.old-<vendor>-seed.deletes.json` for growthzone/imis/netforum/nimble/propfuel/salesforce/sharepoint) from an earlier connector rebuild; already applied, pure cruft.
  - `metadata/integrations/` — the remaining orphaned files: `.betty.json`, `.mjtomj.json`, `.integrations.json` (File Feed), `.mj-sync.json`, and `additionalSchemaInfo.json`.

  File-level cleanup only — no schema change. Note: the `File Feed` and `Betty AI` Integration **rows** that #2942's migration intentionally retained are not deleted here; their DB removal (and Betty/MJtoMJ repo seeding) is handled by their respective connector PRs.

- 9f6aa87: Generic fire-and-forget save queue, realtime multi-agent floor control, and telemetry fixes.

  **Generic fire-and-forget save queue** (`@memberjunction/global`, `@memberjunction/core`, + adopters) — de-duplicates the hand-rolled "INSERT (fire-and-forget) → chained UPDATE" persistence pattern and makes the "stuck at Running" race structurally impossible:
  - `KeyedSerialTaskQueue` (`@memberjunction/global`) — entity-agnostic per-key serial task chain: same-key tasks serialize, different keys run concurrently, failures are tallied for `flush()` and never propagate. Self-bounding (in-flight set + failure counters), so a long-lived queue that never flushes doesn't grow.
  - `BaseEntitySaveQueue` (`@memberjunction/core`) — entity façade: `Insert` / `Update(entity, applyMutation?)` / `Flush`, with an optional `onError` hook for structured logging. `Update`'s mutation runs _inside_ the post-INSERT task, so it can never be reverted by the INSERT's reload.
  - Adopted in all three hand-rolled copies + the new consumer: `GenericProcessRunTracker` (`@memberjunction/record-set-processor`), `AgentRunStepSaveQueue` (`@memberjunction/ai-core-plus`), `ActionEngine`'s execution log (`@memberjunction/actions`), and `AIPromptRunner` / `AIModelRunner` (`@memberjunction/ai-prompts`). Also fixes a pre-existing `MJLruCache` mock gap in the Actions/Engine test suite.

  **Realtime** (`@memberjunction/ai`, `@memberjunction/ai-bridge-server`, `@memberjunction/ai-gemini`, `@memberjunction/ai-openai`, `@memberjunction/livekit-room-server`, `@memberjunction/ng-livekit-room`) — multi-agent floor control, Gemini meeting mode, the session capability surface with first-agent re-gating, and an idle reaper.

  **Telemetry / core** (`@memberjunction/core`, `@memberjunction/server`) — cacheability-aware duplicate-RunView suggestion for `AllowCaching=false` entities; fixes the telemetry pagination-fingerprint false-duplicate and batches the janitor channel reads.

- ad8d8f1: Remove connector-specific Integration metadata from core MemberJunction. Each connector (Salesforce, NetSuite, MemberSuite, GrowthZone, Pheedloop, etc.) now ships its own Integration + Integration Object/Field rows and credential type from the `MemberJunction/Integrations` repo as an installable Open App, rather than being seeded natively by MJ.
  - Deletes the connector-specific `metadata/integrations/<connector>/` folders, the single-file `.<connector>.json` definitions, and the 22 connector-specific credential-type files (and their schemas) from `metadata/credential-types/`. Only generic integration/credential metadata remains in core.
  - Adds migration `V202606251241__v5.43.x__Remove_Connector_Integration_Metadata.sql`, which deletes the corresponding `Integration` / `Integration Object` / `Integration Object Field` / `IntegrationURLFormat` rows and the 22 `Credential Type` rows from the database, and nulls `RecordChange.IntegrationID` for the removed integrations.

  The migration is a data-only (record) change — no schema change, so no CodeGen run is required. It is guarded so it never touches an integration that has a live `CompanyIntegration` connection, and never deletes a credential type still referenced by an `Integration`, `AIVendor`, `MCPServer`, or `Credential` row. "File Feed" and "Betty AI" are retained (not yet moved to the repo).

### Patch Changes

- a4cdfb0: Restore `metadata/credential-types/schemas/oauth2-client-credentials.schema.json`, which was inadvertently deleted in #2942 alongside the connector-specific credential-type schemas. It is a **generic** OAuth2 client-credentials schema still referenced (via `@file:`) by a retained credential type in `.credential-types.json`, so its removal broke `mj sync push --dir metadata` with a "File reference not found" validation error. No other `@file:` references are dangling.
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
  - @memberjunction/global@5.43.0
  - @memberjunction/sql-dialect@5.43.0

## 5.42.0

### Minor Changes

- 9b9b484: Field active-status enforcement relocation, plus the "Meet" app rename, quieter operational logging, and a telemetry suppression refinement.

  **Field active-status enforcement (`@memberjunction/core`, `@memberjunction/generic-database-provider`)**
  - Deprecated-field warnings and disabled-field exceptions are now enforced at the field-access boundary genuine code flows through — `BaseEntity.Get()`, `Set()`, and `SetMany()` (what the generated strongly-typed accessors call) — instead of on the low-level `EntityField.Value` accessor. This flips a leaky blocklist (assert on every `.Value` touch, then suppress at each internal call site) into a precise allowlist, and fixes false deprecation warnings emitted on every load/save of a record that merely _contains_ a deprecated column (e.g. `"MJ: AI Agent Runs".AgentState`) even when no code uses it.
  - New memoized `EntityInfo.HasInactiveFields` fast-path gate: entities whose fields are all `Active` (the vast majority) pay only a single cached boolean check in the hot read/write paths.
  - `EntityField.ActiveStatusAssertions` is retained as a `@deprecated` no-op for backward compatibility; the six now-redundant internal suppression toggles were removed. Warning caller strings are now accurate (`BaseEntity.Get`/`Set`) instead of the misleading `"EntityField.Value setter"`.

  **Telemetry (`@memberjunction/core`)**
  - Suppress "load this into a dedicated engine cache" telemetry suggestions for entities that have explicitly opted out of caching (`EntityInfo.AllowCaching = false`), reusing the existing flag as the single source of truth.

  **Quieter operational logging (`@memberjunction/scheduling-engine`, `@memberjunction/ai-agents`, `@memberjunction/server`, `@memberjunction/server-bootstrap`, `@memberjunction/server-bootstrap-lite`)**
  - Scheduled-job no-op runs (e.g. the Agent Memory Manager finding no new activity) now collapse to the engine's `Starting`/`Completed` heartbeat; the per-agent and memory-manager internal traces are verbose-only.
  - Cleaner server startup logging: transient boot spinner, true total timing, less redundant output, and the `CustomColumnPromoter` registration log demoted to verbose-only.

  **"Meet" app + local LiveKit dev (`@memberjunction/ng-explorer-core`, `@memberjunction/livekit-room-server`, `@memberjunction/auth-providers`, `@memberjunction/server`)**
  - Renamed the Realtime app to "Meet", with the Live Room now defaulting to the Realtime co-agent instead of starting with no agent, plus a local LiveKit dev server and supporting docs.

- 0fa3cbc: Record Set Processing & Record Processes, plus the Remote Operations primitive.

  **Remote Operations** (`@memberjunction/core`, `@memberjunction/global`, `@memberjunction/graphql-dataprovider`, `@memberjunction/server`) — a typed, provider-routed capability the browser and server both invoke through one call site, the peer of `BaseEntity` (CRUD) and `RunView` (set reads):
  - `BaseRemotableOperation<TInput,TOutput>` with `OperationKey` / `RequiredScope` / `RequiresSystemUser` / `ExecutionMode`; `Execute()` routes per-provider, `ExecuteServer()` runs in-process and never throws on logical failure.
  - `IRemoteOperationProvider.RouteOperation` on `ProviderBase` (the documented power tool), in-process dispatch in `DatabaseProviderBase`, GraphQL marshalling in `GraphQLDataProvider`, and the single generic `ExecuteRemoteOperation` resolver that composes the existing API-key-scope + user-permission auth chain.
  - Genericized value-mapping resolver in `@memberjunction/global` (`getValueAtPath` / `resolveMappingRef` / `resolveValueMapping`) — one canonical mapping engine over pluggable named sources.

  **Record Set Processing substrate** (`@memberjunction/record-set-processor-base`, `@memberjunction/record-set-processor`) — a hardened iterate-a-record-set-and-do-work engine with three pluggable seams (source / processor / run-tracker): batching, bounded concurrency, rate limiting, circuit breaker, checkpoint/resume, and pause/cancel. Ships Array/View/List/Filter/Keyset sources; Action / Agent / Infer record processors; a uniform `WriteBackProcessor` that applies an `OutputMapping` (fields / child record) to any work type; the `RecordProcessExecutor` facade (Scope→source, Work→processor); and the `RecordProcess.RunNow` / `GetRunStatus` / `Pause` / `Resume` / `Cancel` control operations.

  **Record Processes facade** (`@memberjunction/core-entities`, `@memberjunction/core-entities-server`, `@memberjunction/scheduling-engine`, `@memberjunction/actions`) — the `MJ: Record Processes` definition (Work × Scope × Trigger) plus generic `MJ: Process Runs` / `Process Run Details` tracking and the `MJ: Remote Operations` registry. `MJRecordProcessEntityServer` reconciles the owned recurrence Scheduled Job on save; `RecordProcessScheduledJobDriver` runs a process on its cron schedule and links each `ProcessRun` back to its `ScheduledJobRun`; the Entity Action `GetRecordList` View/List fan-out backs scoped iteration.

### Patch Changes

- 2f225e4: CodeGen + SS→PG converter type-correctness on PostgreSQL:
  - **codegen-lib / core / actions-base**: core + codegen type correctness on PostgreSQL, plus a
    PG-only migration repairing TypeScript that the SS→PG baseline conversion corrupted in
    GeneratedCode rows. _(migration → minor)_
  - **sql-converter**: never quote identifiers inside string literals during SS→PG conversion. _(code → patch)_

- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0
  - @memberjunction/sql-dialect@5.42.0

## 5.41.0

### Minor Changes

- 8fd6f59: Realtime Bridges (Phase 0+1): new media-transport layer that connects the one realtime agent engine to external endpoints — meetings (Zoom/Teams/Slack/Meet/Webex/Discord) and telephony (Twilio/Vonage/RingCentral/VOIP). Adds the v5.42 schema (5 entities: AIBridgeProvider with a strongly-typed SupportedFeatures JSON column, AIBridgeAgentIdentity, AIBridgeProviderChannel, AIAgentSessionBridge, AIAgentSessionBridgeParticipant — the bridge is an attachment to the existing AIAgentSession, not a new session). New packages @memberjunction/ai-bridge-base (BaseRealtimeBridge media driver with capability gating, AIBridgeEngineBase cache, pure passive/active/hybrid TurnTakingPolicy) and @memberjunction/ai-bridge-server (AIBridgeEngine completing the deferred server-bridged transport seam — bridge media ↔ IRealtimeSession.SendInput/OnOutput — plus a LoopbackBridge, host affinity and janitor). Five server-side EntityServer validation invariants. Nothing is audio-specific (typed directional audio/video/screen tracks).
- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).
- 659ee5b: Realtime co-agent pairing & type configuration. New `MJ: AI Agent Paired Agents` junction (opt-in: a co-agent with zero rows stays universal — today's zero-config default unchanged; rows restrict + prebuild its target list with an IsDefault preselection), `AIAgent.TypeConfiguration` (agent-type-specific JSON: realtime model preference, per-provider voice, tone/speaking style, override policy, narration pacing), and `AIAgentType.ConfigSchema`/`DefaultConfiguration` (the type publishes a JSON Schema + type-level defaults; effective config = type defaults <- agent config <- runtime overrides, deep-merged per key, server-authoritative). Runtime overrides ride a new `configOverridesJson` session-start argument gated by the seeded `Realtime: Advanced Session Controls` authorization (Developer-mapped) — enforced server-side, disclosed client-side (unauthorized users silently get defaults). ValidateAsync server subclasses enforce ConfigSchema conformance, Realtime-type co-agents, and at-most-one-default-per-co-agent. Conversations UX: co-agent picker for everyone with more than one permitted co-agent (persisted via UserInfoEngine), pairing-constrained target selection, authorization-gated model/config override pickers.
- cc604aa: Agent in-flight memory writes: agents can commit durable cross-run memories mid-run via the memoryWrites loop-response field, gated by AIAgent.AllowMemoryWrite (ON by default — opt out per agent). Writes land as immediately-injectable Provisional agent notes (new Status value, with AuthorType provenance) under framework-enforced guards (descriptive types only, scope clamp, exact-restatement dedupe with same-run supersede, per-run cap, TTL), inject with recency-wins precedence and per-note recorded dates, and are hardened or pruned by a new Memory Manager pass each cycle. Cross-run dedupe requires exact normalized restatement so corrections are never silently absorbed into a stale note; the loop-agent prompt instructs agents not to claim a memory was saved before its result message arrives.
- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

### Patch Changes

- 8c8b658: Realtime UX wave 2 — the progressive-disclosure console (pure-audio-first overlay with the breathing hero orb, disclosure levels 0–4 ratcheted per-user via UserInfoEngine, gear density escape hatch, unified app-bar, fused composer dock; content never flips the console open — the one auto-reveal is a channel's first agent activity, finished artifacts arrive as glowing unfocused tabs, Activity tab pinned last); audio-reactive call visuals (BaseRealtimeClient GetAudioActivity capability — per-direction RMS + 9-bin spectrum metered on all four drivers via a shared RealtimePcmPlayback master-gain tap / WebRTC stream analysers — driving the hero + app-bar orbs and a true-spectrum EQ through a zero-CD rAF loop, with turn-state fallback). Whiteboard: OneNote-style PAGES (v2 JSON with tolerant v1 migration, AddPage/SwitchPage/RenamePage agent tools, page strip with inline rename + right-click Rename/Delete/New-page context menus, agent-authored page garnish), multi-select (marquee, shift-click, single-undo group drag/delete), hold-to-zoom, multi-page HTML/SVG export, shared active-page note on all item tools, UUIDsEqual compliance. ElevenLabs: tool-schema sanitizer (non-string enums + leaf descriptions, fingerprint-stable) and the absorbed-tool-result voice nudge. Conversations: shared auto-naming helper + race-free realtime naming lifecycle on SessionStarted$, slide-panel splitter rework, angular-split dependency removed. Plus integration-test script groundwork (server/client/runquery cache suites) and cache-layer fixes carried on this branch.
- ddaa30e: Fix RunView cache-miss results returning ALL entity columns instead of the caller's requested Fields. The caching pipeline widens params.Fields to all entity fields so cache entries are universal supersets; that superset is now projected back down to the caller's requested Fields on cache misses (it already was on hits), so result shape is identical regardless of cache temperature. Also includes Fields and ResultType in the RunView dedup/linger key so concurrent or near-sequential callers with different field subsets or result types no longer receive each other's projected/transformed result shapes. Additionally, the client-side smart-cache fingerprint now includes a normalized Fields suffix: client cache entries store rows exactly as returned (no widening, no projection on read), so per-field-subset slots prevent a narrow cached entry from validating as current for a different field subset and silently serving rows with missing columns. Client cache entries written before this change are orphaned by the new key format and will expire/invalidate normally (one-time cold start).
  - @memberjunction/global@5.41.0
  - @memberjunction/sql-dialect@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/global@5.40.2
- @memberjunction/sql-dialect@5.40.2

## 5.40.1

### Patch Changes

- e50381b: Realign package versions.
  - @memberjunction/global@5.40.1
  - @memberjunction/sql-dialect@5.40.1

## 5.40.0

### Minor Changes

- 73bb233: Add KeyPrefix column to APIKey table for visual key identification. Stores the configured prefix plus 4 characters of the random body (e.g., "mj_sk_a1b2") at creation time so administrators can differentiate API keys without exposing the full key.
- 43e6c0f: MJ-issued magic-link sessions for external, app-scoped users: passwordless, single-use (or multi-use) invite links that sign external users into MJExplorer confined to one application and a per-link role. MJ issues and validates its own RS256 session tokens (published via JWKS, accepted by the standard auth-provider path), so there's no external IdP dependency or per-user IdP cost. Invite scope (app, role, expiry, max uses) is configured per link, with support for per-invite app/role, resource-scoped RLS sharing, and anonymous sessions — a shared Anonymous principal whose scope rides per-session JWT claims rather than DB roles, so concurrent anonymous visitors can't accrete privileges.

  Also includes two framework changes made along the way:
  - **RunView server-cache RLS fix:** the cache fingerprint now incorporates the per-user Row-Level-Security where-clause, so an RLS-scoped read can no longer be served an unscoped cached result. No-op for users without an RLS filter (byte-identical fingerprint), so normal caching is untouched.
  - **BaseEngine degrades gracefully under restricted roles:** a config load that fails because the current user lacks Read permission is now treated as a permanent condition — the property loads empty and the engine is marked loaded — instead of looping on "not marking as loaded", which previously hung the MJExplorer shell for least-privilege users (e.g. magic-link guests). Only genuinely transient failures (network, server restart) keep retrying.

### Patch Changes

- 804f9f6: Security audit fixes: parameterize SQL queries in GraphQL resolvers to prevent injection, validate entity read permissions on query execution, centralize permission logic in UserCanRun with recursive dependency checks, and fix UUID/multi-provider compliance violations.
  - @memberjunction/global@5.40.0
  - @memberjunction/sql-dialect@5.40.0

## 5.39.0

### Minor Changes

- 361eb4c: Azure-safe principal creation in baseline emitter, plus a freshly-generated v5.38.x baseline (`B202605291452__v5.38.x__Baseline.sql`).
  - `emitPrincipals` now wraps cross-database `master.*` lookups inside `sp_executesql N'...'` string literals so Azure SQL's submission-time parser can't reject the batch. The `SERVERPROPERTY('EngineEdition') = 5` check sets `@associate = 1` on Azure, so the `master.dbo.syslogins` path never executes there — but only the dynamic-SQL wrapper prevents the parser from rejecting the batch before the IF can short-circuit it.
  - New emitter test (`keeps cross-DB references inside string literals (Azure-safe)`) strips quoted literals from the emitted SQL and asserts zero `master.*` references survive outside string literals — regressions surface immediately.
  - New v5.38.x baseline ships with the fix: 0 `master.*` refs outside string literals, 4 `sp_executesql` wrappers (one per SQL user), byte-equivalent to a V-stack-built source DB (0 object/row diffs across 46,432 rows). Previously published v5.34.x and v5.37.x baselines are intentionally untouched — Skyway auto-picks the latest baseline for fresh installs.

- f4bf584: feat(core): BaseEngineRegistry cross-engine cache reverse-lookup + `ExtendedType='Icon'`
  - **`BaseEngineRegistry.FindCachedEntity<T>(entityName, { unfilteredOnly? })`** and
    **`TryGetCachedRecords<T>(...)`** — let UI/code ask "is this entity already fully
    cached by a loaded `BaseEngine`?" and use the live array (favoring unfiltered,
    authoritative sets). Returns the engine, its property config, the live records, and
    whether the cache is unfiltered. Powers instant, DB-free dropdowns for cached entities.
  - **`EntityFieldInfo.ExtendedType`** (`EntityFieldExtendedType`) gains `'Icon'`, marking a
    field whose value is a FontAwesome class for per-row icon rendering.

- ae74fd5: Auto-detect and render Markdown/HTML in long-text form fields. `MjFormFieldComponent`
  now honors an explicit `EntityField.ExtendedType` (`Markdown`/`HTML`/`Code`) and, when it
  is null, runs lightweight client-side content detection on eligible long-text fields
  (TS-type string with `MaxLength >= 255` or unlimited — generic across SQL Server/PostgreSQL).
  Read mode renders `<mj-markdown>` for Markdown, DOMPurify-sanitized `[innerHTML]` for HTML
  (via the new `mjSafeRichHtml` pipe — see below), and a read-only `<mj-code-editor>` for code;
  edit mode uses `<mj-code-editor>` with syntax highlighting for non-plain modes (mode frozen at
  edit entry), while plain fields keep the existing textbox/textarea.

  Widens the `EntityFieldExtendedType` union and the `CK_EntityField_ExtendedType` CHECK
  constraint to include `Markdown` and `HTML` (migration included — run CodeGen after applying
  to regenerate `EntityFieldEntity` types and metadata).

  Adds a reusable, dependency-free `detectRichTextFormat(value, maxScanLength?)` text classifier
  to `@memberjunction/global` (defaults to scanning the first 500 characters) so any consumer can
  sniff Markdown/HTML/plain content.

  Adds reusable safe-HTML rendering to `@memberjunction/ng-shared-generic`: a `PurifyRichTextHtml()`
  function and an `mjSafeRichHtml` pure pipe backed by DOMPurify (HTML + SVG profiles). Unlike
  Angular's built-in `[innerHTML]` sanitizer (which strips all SVG and inline styles), this keeps
  safe inline SVG and richer markup while still removing `<script>`, `on*` handlers, and
  `javascript:`/`data:` URLs — so it's safe for untrusted content yet renders richer HTML. Any
  Angular component can use `[innerHTML]="value | mjSafeRichHtml"`.

- 9bc2916: feat(core): `EntitySaveOptions.OnValidated` — optimistic-UI render hook

  An optional callback on `BaseEntity.Save()` that fires after all pre-flight checks pass
  (`Validate`, `ValidateAsync`, PreSave hooks) but **before** the database write — the
  "render only once known-valid" moment for optimistic UI. Fires exactly once; skipped on
  not-dirty, failed validation, and `ReplayOnly` (which bypasses validation); a thrown
  callback is swallowed + logged so a UI bug can never abort the persist. `Save()`'s boolean
  return contract is unchanged, and there is no server-side behavior change.

- a101a34: Drop the SQL Server MS_Description extended property on ConversationDetailAttachment to the DEPRECATED notice text so R\_\_RefreshMetadata propagates it into Entity.Description on every migrate cycle — eliminating the drift that the metadata-sync file alone could not fix.

### Patch Changes

- 3c53858: feat(forms): inline "create new" from FK fields (event-based) + fold Allow\*API into entity permissions

  When the related record you need isn't in a foreign-key dropdown, you can now create it
  inline. A sticky "➕ Create …" footer (always visible at the bottom of the dropdown,
  prefilled with whatever you typed) requests creation; the new record is auto-selected into
  the field once saved. Gated on create permission + a new `@Input() AllowFKCreate` (default
  true); surface configurable via `@Input() FKCreatePresentation: 'dialog' | 'slide-in'`.

  **`@memberjunction/ng-base-forms`** — the Generic FK field stays generic: it only _emits_ a
  new `create-related` `FormNavigationEvent` (carrying the entity, prefill `NewRecordValues`,
  preferred presentation, provider, and a `Complete(record)` callback). It does **not** open
  the form itself — that would couple a generic component to the app-level form presenter.

  **`@memberjunction/ng-explorer-core`** — `SingleRecordComponent` handles the new
  `create-related` event: opens the related entity's form via `MJFormPresenterService`
  (dialog/slide-in, prefilled), then calls `event.Complete(savedRecord)` so the field selects it.

  **`@memberjunction/core`** — `EntityInfo.GetUserPermisions()` now folds the entity's
  `Allow{Create,Update,Delete}API` flags into the corresponding `Can*` results. An API-driven
  action requires both a role grant **and** the entity allowing that action at all, so a user
  can no longer be reported as able to create/update/delete records of an entity whose API for
  that action is disabled. (Read is unchanged — it has no `Allow*API` flag.)

- Updated dependencies [ae74fd5]
  - @memberjunction/global@5.39.0
  - @memberjunction/sql-dialect@5.39.0

## 5.38.0

### Minor Changes

- 748b2e7: Add deterministic baseline migration toolchain (`mj baseline build` / `compare` / `roundtrip`): introspects + emits the full MSSQL schema (tables, views, procedures, functions, triggers, UDTs, extended properties, database principals, role memberships, and object/schema/type/database permissions) with proven byte-equivalence via the row-by-row comparator. AUTO within-major rebaseline mode derives `Major.Minor` and a `latestV+1m` timestamp from the source migrations directory. Ships with workbench end-to-end script and a `/create-new-baseline-migration` slash-command driver.
- ce7d2f5: Fix non-idempotent metadata sync for `.your-membership.json`: three Integration Object Field records each shared a `primaryKey.ID` with another field in the same file (`OrderID`/`InvoiceID`, and two `Id`/`CampaignId` pairs), so `mj sync push` routed two distinct records to the same DB row and their sync blocks ping-ponged on every run. Reassigned a fresh unique `primaryKey.ID` to the duplicate (`IsPrimaryKey:false`) record in each pair so every field has its own identity. `mj sync push` matches records to rows solely by `primaryKey` (no natural-key fallback), so each record must carry a unique key to be idempotent.
- 6a3ac36: Fix AllowUpdateAPI clearing when EntityField transitions to virtual, use subqueries for organic key INSERTs for portable SQL, prevent permanent engine failure when MJAPI is temporarily unavailable, and centralize RLS exemption check in GetUserRowLevelSecurityWhereClause

### Patch Changes

- 4ee0b06: - `@memberjunction/core`: Add `deferredDelay` configuration parameter to `@RegisterForStartup` options, allowing background engine loading to be delayed by a specified duration in milliseconds.
  - `@memberjunction/aiengine`: Implement `IStartupSink` and annotate the server-side `AIEngine` with `@RegisterForStartup` as a deferred engine with a 15-second delay to automatically load metadata and pre-warm embedding models/vector caches in the background.
- 275afda: DBAutoDoc organic-key detection + PR #2193 per-column normalization:
  - **Organic-key detection phase** in DBAutoDoc's analyze pipeline (optional, off by default): prefilter → per-table LLM normalize (business-space descriptions + concept names + per-column normalization strategy + organic-key gate) → embed → agglomerative cluster → concept-name split → FK-graph transitive bridges → emit to `additionalSchemaInfo.json`. Runs on MemberJunction's AI infrastructure (`BaseLLM` / `BaseEmbeddings` via the ClassFactory), no standalone provider clients.
  - **Per-column normalization**: each emitted `EntityOrganicKey` carries its own normalization function for its column, so a cluster of differently-formatted columns (e.g. phone numbers across systems) each canonicalize to a shared form. Runtime (`EntityInfo.BuildOrganicKeyViewParams`) applies each side's own expression at match time, looking up the spoke entity's organic key by name.

- c0b40c0: `mj sync push` performance overhaul and a related `BaseEntity` fix for fixed-width string columns.

  Measured on a representative ~36,500-record `metadata/` tree (mostly idempotent, including a `metadata/integrations/` dir with 23,789 records):
  - Full sync (incl. integrations): ~6m 49s → **~1m 4s** (~6.5×)
  - Partial sync (excluding integrations): ~1m 37s → **~30.5s** (~3.2×)

  ### `@memberjunction/metadata-sync`
  - **`SyncMetadataEngine`** (new, extends `BaseEngine`) preloads every touched entity once via `BaseEngine.Load` and exposes the result through dynamic per-entity property slots that the sync path consults instead of round-tripping the DB per record. Preload is _unfiltered_ — metadata entities are bounded by design and loading all rows is faster than computing a giant `WHERE … IN (…)` clause, plus it lets `@lookup:` resolution hit the cache even for records not in local files. Oversize warning fires above 100,000 rows on any single entity.
  - **O(1) PK index** built after preload completes. Each per-entity slot is mirrored into a `Map<serializedPK, BaseEntity>`; `loadEntity` uses it for hash lookups instead of the previous `Array.find(... serializePrimaryKey(GetAll()))` scan. This was the single biggest fix — on `MJ: Integration Object Fields` the naïve scan was ~1.2B comparisons (~38 min); the Map drops it to seconds. Self-healing array-scan fallback handles drift from `BaseEngine` event-driven slot mutations.
  - **Resolved-lookup + file content caches**. Resolved `@lookup:` keys memoized in a per-entity-scoped `Map<lookupKey, ID>`; parsed `@include`-preprocessed file contents memoized and invalidated at every write site so multi-pass writes always see fresh contents.
  - **Skip preload for unresolved PK refs** (`@lookup:` / `@parent:` / `@root:` / `@file:` / `@env:` / `@template:`) — those values resolve later in the per-record path. Without this guard the preload would inline literal `@lookup:…` strings into a `WHERE ID = '…'` filter and SQL Server would reject the uniqueidentifier cast.
  - `SyncEngine.getProvider()` is now the single entry point for provider plumbing in cache and lookup writes — no more reaching for `Metadata.Provider` directly.

  ### `@memberjunction/core`, `@memberjunction/sql-dialect`

  Fixed-width / space-padded character types (`nchar`/`char` on SQL Server; `char`/`character`/`bpchar` on PostgreSQL) used to surface their storage padding through `BaseEntity.Get`, causing `Dirty` to compare `"Input     "` against `"Input"` and false-positive every record as dirty. Once preload populated the in-memory comparison this manifested as thousands of spurious "updates" per sync (~4,279 on `MJ: Action Params` alone).
  - New `IsFixedWidthStringSQLType` predicate in `@memberjunction/sql-dialect` plus an abstract `FixedWidthStringTypeNames` getter on `SQLDialect` so the list of fixed-width type names stays in one place per dialect.
  - New `EntityFieldInfo.FixedWidthColumn` getter delegating to the predicate.
  - `EntityField.Value` setter and `BaseEntity.Get` raw fast-path now rtrim string values when `FixedWidthColumn` is true, memoizing back into `_raw` so the trim runs at most once per field per record.

  The `BaseEntity` change is independent of MetadataSync but was exposed by the preload work and is required for the "Unchanged" counts in `mj sync` to be accurate.

- d5a51b3: Optimize metadata loading and caching performance in MJCore:
  - Group fields, values, permissions, settings, and organic keys in `PostProcessEntityMetadata` using pre-indexed Maps, reducing the linking phase from `O(N × M)` to `O(N + M)`.
  - Pre-index batch results in `executeSmartCacheCheck` for direct Map lookups, reducing per-batch lookup cost from `O(N²)` to `O(N)`.
  - `InvalidateEntityCaches` now consults the existing entity→fingerprint reverse index (with remote-storage fallback) instead of linearly scanning the full cache registry, so invalidation cost scales with matched entries rather than total registry size.
- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [30f598d]
- Updated dependencies [c0b40c0]
- Updated dependencies [3d739a3]
  - @memberjunction/global@5.38.0
  - @memberjunction/sql-dialect@5.38.0

## 5.37.0

### Minor Changes

- 4f15f31: Add Feedback Explorer dashboard with 1–10 conversation-rating modal persisting to ConversationDetail, plus a migration granting the UI role Create/Update on MJ: User Settings so user-scoped preferences (e.g. Agent Feedback consent) stop silently failing.

### Patch Changes

- @memberjunction/global@5.37.0
- @memberjunction/sql-dialect@5.37.0

## 5.36.0

### Patch Changes

- 70fce34: Fix MJAPI heap leak by eliminating per-request `SQLServerDataProvider` retention in `BaseEngine` caches. `applyImmediateMutation` now clones entities before storing them so saver providers aren't pinned via `_provider` back-refs. The engine provider-instance cache is now keyed by `IMetadataProvider.InstanceConnectionString` (promoted onto the interface) instead of by provider object identity, and `SetProvider` is first-wins so transient per-request providers can't displace persistent ones.
- 4d16916: Fix dashboard resource navigation to parse OpenEntityRecord recordId as a URL segment so single-PK composite keys round-trip correctly (was producing malformed `ID|ID|<value>` URLs and dropping the record ID), plus add regression tests for `CompositeKey.LoadFromURLSegment`.
  - @memberjunction/global@5.36.0
  - @memberjunction/sql-dialect@5.36.0

## 5.35.0

### Minor Changes

- 6fa8e13: Grant the Developer role CanDelete on the ~218 entities where it previously had Create/Update but not Delete, restricted to developer-owned configuration and metadata. Audit logs, OAuth runtime state, global system config, and end-user-owned content remain locked.
- c1f1cad: Add pluggable geocoding provider abstraction with Google, Geocod.io, and HERE implementations (expands GeoCodeSource enum and adds provider registry). Polish the Home dashboard pin empty state with a dismissible "Don't show this again" preference persisted via UserInfoEngine, and speed up the Add Pin panel by reading from cached DashboardEngine, UserViewEngine, QueryEngine, and ActionEngineBase singletons instead of firing fresh RunViews on every open, with background pre-warm on home load.
- 207cba4: Scope the Developer delete-permission grant migration to the `__mj` schema so it never touches customer-defined schemas, and flip CodeGen's default `CanDelete` for the Developer role to `true` so newly registered entities ship with the Developer role's full CRUD permissions.

### Patch Changes

- 9580189: Fix keyset (AfterKey) pagination infinite loop in vector sync. `GenerateRunViewFingerprint` omitted `AfterKey`, so sequential keyset pages produced identical fingerprints and the dedup/linger layer returned page N's result for page N+1, freezing the seek cursor (observed on multi-page entities like a 2k-row Members table). The fingerprint now includes `AfterKey` (appended only when present, so non-keyset fingerprints are unchanged), fixing all keyset callers. The vectorizer's page reads now also set `BypassCache` since full-table sweeps read each page once, and `EntityVectorSyncer` halts with a clear error if the cursor ever fails to advance.
- aedd4dc: Bubble save SQL composition up to GenericDatabaseProvider as a single orchestrator; SQL Server and Postgres providers now contribute four dialect hooks instead of duplicating the generator. Fixes a PG UPDATE bug where PK wasn't tail appended
- Updated dependencies [ac4b9a5]
  - @memberjunction/global@5.35.0
  - @memberjunction/sql-dialect@5.35.0

## 5.34.1

### Patch Changes

- 3a35358: Surface engine load health in System Diagnostics with per-property success/failure status and error messages, add recovery telemetry to ApplicationManager, cache architecture fixes including schema hash staleness detection, empty result timestamp handling, and timestamp precision tolerance
  - @memberjunction/global@5.34.1
  - @memberjunction/sql-dialect@5.34.1

## 5.34.0

### Minor Changes

- 003317f: Add `EntityField.IsComputed` flag to distinguish SQL Server computed columns and PostgreSQL generated columns from view-only virtual columns. Both flavors continue to be flagged `IsVirtual = 1`, so every existing IsVirtual consumer (sproc generation, GraphQL input types, IS-A inheritance, RLS, form generation) is unchanged. The new flag refines base-view JOIN-target selection in CodeGen — when an FK's related Name Field is `IsComputed = 1`, the generated view joins to the related entity's base table instead of its view, avoiding unnecessary view materialization and unblocking self-referencing FKs whose Name Field is computed. Includes the SQL Server migration that adds the column, extends the `vwSQLColumnsAndEntityFields` metadata view, and updates `spUpdateExistingEntityFieldsFromSchema` to sync the flag from the catalog. The CodeGenLib PostgreSQL provider's pending-fields query already projects `IsComputed`; the corresponding PG view + sproc updates and the PG migration counterpart are produced by the version build / release pipeline (SQLConverter + pg-migrate skill) and are not included here. After deploying, run CodeGen once to repopulate `IsComputed` and regenerate base views that depend on entities with computed Name Fields.
- cfffb6d: Add keyset (seek) pagination to `RunView` via the new `RunViewParams.AfterKey: CompositeKey` field. Iterating large entities (background jobs, scheduled actions, bulk processing) now stays O(log N) per page regardless of depth — `StartRow`-based OFFSET pagination is unchanged and remains the right choice for UI grids.

  **Framework changes**
  - New `RunViewParams.AfterKey: CompositeKey` accepted by all RunView entry points (TS, GraphQL, REST flows that go through RunView).
  - New exported error class `AfterKeyNotSupportedError` (with `Reason` codes `CompositePK | UnsupportedPKType | IncompatibleOrderBy | StartRowConflict | AfterKeyShape`).
  - New exported helper `IsKeysetPaginationOrderableType(sqlType)` and constant `KEYSET_PAGINATION_ORDERABLE_PK_TYPES`.
  - Keyset queries bypass server cache (read + write) automatically — they're inherently single-use so caching is pure overhead.
  - v1 constraint: single-column PK only. Composite-PK entities throw `AfterKeyNotSupportedError` with `Reason: 'CompositePK'`.

  **Migrated callers (now use keyset by default when entity has a single-column PK)**
  - `ScheduledGeocodingAction` (`processMissingForEntity`) — falls back to OFFSET on composite-PK entities.
  - `VectorBase.PageRecordsByEntityID` + `EntityVectorSyncer.startDataPaging` — auto-promotes to keyset when possible. New helper `VectorBase.CanUseKeysetPagination()`. New optional `PageRecordsParams.AfterKey`.

  **Metadata**
  - `Geocoding Maintenance` scheduled job cron updated to weekly (Saturdays 2 AM UTC); description reworded to not hard-code a cadence. Administrators can adjust the `CronExpression` as needed.

  **Documentation**
  - New guide: `guides/KEYSET_PAGINATION_GUIDE.md`.
  - `CLAUDE.md` performance section updated.

  **Out of scope for v1**
  - `ExternalChangeDetection.ChangeDetector` uses `RunQuery` (saved queries with arbitrary SQL), which the framework can't safely rewrite. Stays on OFFSET; tracked as a follow-up.

  **Backwards compatibility**
  - Fully additive. Existing callers that don't pass `AfterKey` are unaffected.

### Patch Changes

- e999e0d: Add cross-server cache invalidation via shared storage provider, fix "No Applications Available" after browser refresh, use cacheSettings.verboseLogging for Redis provider, add ParameterHints to override LLM-generated sampleValues, and thread forceRefresh as BypassCache through BaseEngine config loading
- ae5cfbd: Search Scopes & RAG+ — multi-phase ship

  A bundled feature release across the search pipeline (Phases 2A–6 of
  the Search Scopes & RAG+ initiative). Highlights:

  **SearchEngine pipeline**
  - New `SimpleVectorDatabase` in-process driver — points
    `VectorDBBase` at any entity column with an `EmbeddingVector`
    field. Suitable for dev / agent-memory / small-medium corpora.
    Constructor accepts an empty/missing API key (in-process driver
    has no remote auth target).
  - `VectorDBBase.QueryIndex(params, contextUser?)` — `contextUser`
    is now a proper second parameter instead of being smuggled
    through `filter.__contextUser`. Pinecone/Qdrant/pgvector ignore
    it (they auth via API key); in-process drivers use it for
    RunView's server-side RLS guard. Method-level pattern matches
    MJ's `RunView(params, contextUser)` and `GetEntityObject(name,
contextUser)` conventions.
  - `SearchFusion` — multi-provider score evidence is now preserved
    through RRF. Previously the second provider's `ScoreBreakdown`
    contribution was silently dropped when the same RecordID
    appeared in two provider lists, causing the merged item to
    rank below single-provider hits. Records that match in
    Vector + Entity now carry both contributions and rank
    correctly.
  - Defensive sanitation in `Fuse()` — items with non-finite Score
    (NaN, Infinity), empty/non-string RecordID, or null payloads are
    filtered before fusion. Closes a class of failure modes from
    misbehaving 3rd-party providers.
  - Tier-1 input edge cases hardened — null/undefined/non-string
    Query no longer TypeErrors, surfaces a clean Failure result.
    `EntitySearchProvider` now strips SQL LIKE wildcards (`%`, `_`,
    `[`, `]`) from user input — `Query="%"` no longer matches every
    row through the LIKE-injection vector.
  - Streaming search — `SearchEngine.streamSearch()` v2 emits
    provider events as soon as each provider promise settles
    (concurrent emission), not in registration order.

  **Permission gate (Phase 2A)**
  - `SearchScopePermissionResolver` enforces a 6-step decision tree:
    AgentNone → AgentAssignedNotListed → DirectGrant → RoleGrant →
    AgentUnscopedAll → NoGrant.
  - `AIAgent.SearchScopeAccess` enum (`'None' | 'All' | 'Assigned'`)
    controls agent-side fallback when no per-user/per-role grant
    applies. `BypassCache` propagates through the dedup-linger cache
    so freshly-revoked grants take effect immediately.
  - New tests + agent scenarios cover all 13 permission-matrix cells
    (PM-01..PM-13).

  **Reranker catalog (Phase 2D)**
  - 4 reranker drivers — Cohere, Voyage, OpenAI judge, BGE local —
    all with `@RegisterClass(BaseReRanker, ...)`. Per-search
    `RerankerBudgetGuard` caps API spend; `EstimateCostCents` and
    `CostReporter` per driver. Graceful degradation when the
    upstream SDK rejects/times out/returns malformed responses.

  **Observability (Phase 3)**
  - `MJSearchExecutionLog` — every `Search()` invocation writes one
    row with Status / ResultCount / TotalDurationMs / RerankerCostCents
    / ProvidersJSON (per-source hit counts) / AIAgentID attribution.
    Forbidden gate decisions log `Status='Forbidden'` rows.
  - Knowledge Hub Config dashboard subtab visualizes the log:
    hit-rate, p50/p95 latency, top failure reasons, top users, total
    reranker cost.

  **External providers (Phase 5)**
  - 4 search providers — Elasticsearch, Typesense, Azure AI Search,
    OpenSearch — all with `@RegisterClass(BaseSearchProvider, ...)`.
  - New `AvailableSearchProviders` GraphQL query exposes the
    `BaseSearchProvider.GetAvailableProviders()` runtime catalog to
    the SearchScope form's provider dropdown (P5.5).

  **Angular / UI**
  - Custom `MJSearchScopeFormComponentExtended` (P2D.7 / P4) — fusion
    weights sliders, reranker dropdown, live-preview panel, A/B
    Kendall-tau similarity, CSV export of last 500 invocations.
  - Custom `MJSearchScopeProviderFormComponentExtended` (P5.5) —
    provider dropdown sourced from `MJ: Search Providers` rows,
    annotated with whether each provider's DriverClass is currently
    registered with the server's ClassFactory.
  - Streaming search consumer in `SearchService.StreamSearch()` —
    Angular Observable surface for the `StreamScopedSearch`
    mutation + `SearchStreamEvents` subscription.

  **Migration**
  - `V202605081416__v5.34.x__Search_Scopes_And_RAG_Plus.sql` —
    consolidated. Contains six DDL sections (Phase 1 baseline,
    `SearchScopePermission`, `SearchScope.RerankerBudgetCents`,
    `SearchExecutionLog`, `SearchScopeTestQuery`, unique-constraint
    fix) followed by five CodeGen runs that regenerate the entity
    metadata, sprocs, views, and permission grants for all of the
    above.

  **Test suite**
  - 17 end-to-end agent scenarios (s01–s17) under `agent-scenarios/`,
    driving real LLM tool-calls (Sage agent) against the SearchEngine
    - multi-provider RRF + reranker pipeline. 95 assertions; all PASS.
  - `@memberjunction/search-engine` vitest: 237 unit tests across 21
    files, all PASS. Covers fusion, providers (real + external),
    rerankers, scope template renderer, parent-ID metadata,
    streaming, permission resolver, edge cases, mid-flight failures.

  **Documentation**
  - `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` — comprehensive guide
    covering scope creation, agent integration, permission resolution,
    multi-scope fusion, reranker catalog, observability, external
    providers, how-to templates for adding a new provider /
    reranker / artifact tool library / vector index over an
    embedded entity column. Documents the embedding-regeneration
    contract for ops.

  See `RAG_plan.md` for the full multi-phase plan and `plans/
search-scopes-rag-plus/what-we-built.md` for the customer-facing
  summary.

- 6d8ee1a: no migration
- 72cb92e: Optimize component loading pipeline: remove 163 MB MJ: Components bulk load from ComponentMetadataEngine, add ComponentMetadataEngineServer for server-only use, add generic cache API to LocalCacheManager with server-side registry caching (page refresh component load reduced from 12-20s to ~70ms), add hash-based 304 support for registry fetches, remove proprietary spec caching to client database, and optimize Component Studio to load lightweight summaries on demand.
- Updated dependencies [7d8a0f9]
- Updated dependencies [389d356]
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Minor Changes

- 95eb27e: fix delete SP cascade updates to pass \_Clear flag for tolerant update SPs, preventing FK constraint violations when deleting conversations and other entities with nullable FK references (patch)
- 5cc5326: PostgreSQL end-to-end support — first MJ release where a fresh PG database can be migrated, codegen'd against, signed into, and synced from `mj sync push` without manual intervention. Plus a structural cleanup pass over how the stack handles the database-platform vocabulary and dialect-aware SQL.

  ### PG fresh-install path
  - **`@memberjunction/postgresql-dataprovider`** — replaces the `Nested transactions are not yet supported` throw with full SAVEPOINT-based nesting (mirrors SQL Server's depth/savepoint model). Adds the missing `ValidateDeleteResult` override that the Phase-2 Save/Delete refactor introduced for SS but skipped for PG, so `BaseEntity.Delete()` correctly recognizes successful deletes on PG. RDS-compatible startup wrapper (no `pg_catalog` writes, rejected by managed PG). Per-connection transaction mutex prevents interleaved BEGIN on shared connections during `mj sync` fan-out.
  - **`@memberjunction/sql-converter`** — new `ConditionalDDLRule` handlers for SS-only patterns that previously survived into PG output untranslated: `IF NOT EXISTS (sys.schemas …) EXEC('CREATE SCHEMA [X]')` → `CREATE SCHEMA IF NOT EXISTS "X"`, and `sp_addextendedproperty` schema descriptions → `COMMENT ON SCHEMA "X" IS '...'`. Function-output now emits a `DROP FUNCTION IF EXISTS` guard before recreate so re-runs don't trip "function … is not unique." `ADD COLUMN IF NOT EXISTS` for idempotent column-add migrations. `bit`-parameter body coercion + tagged dollar-quoting on `DO` blocks containing nested `$$`.
  - **`@memberjunction/codegen-lib`** — PG `CodeGenProvider` emits `spCreate*` / `spUpdate*` / `spDelete*` matching the SS-ported baseline (was `fn_create_<snake>`). `pgDialect.ParameterRef` produces `p_<flat lowercase>` matching baseline + runtime `buildCRUDParams`. Without these, every `Save()` against PG failed with `function does not exist`. Pre-pass in `spUpdateExistingEntityFieldsFromSchema` reseats stale negative `Sequence` values from prior interrupted runs at the tail of each entity's positive range, eliminating `UQ_EntityField_EntityID_Sequence` collisions on re-runs. PG-output statement termination — `;` after `INSERT`, `ALTER`, etc. so generated `CodeGen_Run_*.pg.sql` replays cleanly.
  - **`@memberjunction/cli`** (`mj migrate`) — fresh-PG-install blockers: now reads `DB_PLATFORM` from env to select dialect (was config-only); auto-defaults `dbPort` to 5432/1433 based on inferred platform; defaults `BaselineVersion` to `'1'` (Skyway sentinel meaning "auto-select highest-versioned `B__` baseline file"). Without these, `mj migrate` against a PG `.env` silently constructed a `SqlServerProvider`.

  ### Single source of truth for database-platform vocabulary

  Addresses code-review feedback that the stack had three parallel definitions of the same concept and a normalizer in the middle "translating" between them.
  - **`@memberjunction/global`** — new canonical `DatabasePlatform` type (`'sqlserver' | 'postgresql'`) and `resolveDbPlatformFromEnv()` helper that reads from `DB_PLATFORM`. STRICT — only the canonical pair is recognized; legacy aliases (`mssql`, `postgres`, `pg`) are no longer honored, and unrecognized non-empty values **throw** rather than silently falling back to `'sqlserver'`. The earlier dev-only `DB_TYPE` env var is no longer consulted.
  - **`@memberjunction/core`** and **`@memberjunction/sql-dialect`** — both packages re-export `DatabasePlatform` from global instead of defining their own copies.
  - **`@memberjunction/codegen-lib`** — config schema drops `dbType` entirely. `dbPlatform` is the only field. The `dbType()` exported helper is renamed to `dbPlatform()`. `normalizeDbPlatformAndType()` and its tests are deleted.
  - **`@memberjunction/cli`** and **`@memberjunction/server`** — drop their local `resolveDbPlatformFromEnv` copies in favor of the global helper. MJServer's `getDbType()` is now a 1-line wrapper.

  ### SQLDialect as the single source of truth for SQL type ↔ category mapping

  Replaces 5+ hand-coded SQL type-name lists scattered across the codebase ("when you see this pattern repeat, alarm bells").
  - **`@memberjunction/sql-dialect`** — each dialect now exposes 11 typed getters listing the SQL type names IT uses for each conceptual category: `BooleanTypeNames`, `StringTypeNames`, `DateTypeNames`, `IntegerTypeNames`, `FloatTypeNames`, `UuidTypeNames`, `BinaryTypeNames`, `JsonTypeNames`, `CurrencyTypeNames`, `IntervalTypeNames`, `NetworkTypeNames`. New `typeClassification.ts` module unions both dialects into cross-platform predicates (`IsBooleanSQLType`, `IsStringSQLType`, …, plus `IsNumericSQLType` aggregate). New `LowerCase(expr)` method on the base dialect (default `LOWER(${expr})`, ANSI-portable) replaces hardcoded `LOWER(...)` strings in callers. New `BooleanParameterType()` returns `'bit'` on SS, `'boolean'` on PG — used by codegen to emit dialect-correct tolerant-SP `_Clear` parameter declarations. Adding a future dialect = implementing the getters; no other site changes.
  - **`@memberjunction/core`** — `DatabaseProviderBase` gains a `Dialect: SQLDialect` getter, lazily resolved from `PlatformKey`. Server-side code can now write `provider.Dialect.BooleanLiteral(true)` etc. without independently importing `GetDialect`. `util.ts` `TypeScriptTypeFromSQLType` and `FormatValueInternal` rewritten over the predicates — ~70 lines of hardcoded switches collapse to ~25 lines of dispatches. New dep on `@memberjunction/sql-dialect`.
  - **`@memberjunction/codegen-lib`** — `getTypeGraphQLFieldString` 50-line switch replaced with predicate dispatch. `createNewUser.ts` boolean filter that previously avoided dialect-specific SQL via client-side `.filter()` post-pass now uses `dialect.BooleanLiteral(true)` and filters server-side.
  - **`@memberjunction/metadata-sync`** — `sync-engine.ts` lookup-filter type detection uses `IsUuidSQLType` / `IsDateSQLType` instead of a hand-maintained `!== 'uuid' && !== 'datetime' && …` chain. `LOWER()` wrapping goes through `dialect.LowerCase()`. `PushService.ts:isTextLikeColumn` is now a one-liner over `IsStringSQLType`. New dep on `@memberjunction/sql-dialect`.
  - **`@memberjunction/server`** — `auth/newUsers.ts` and `resolvers/IntegrationDiscoveryResolver.ts` boolean filters that previously loaded all rows + filtered client-side now run server-side via `provider.Dialect.BooleanLiteral(true)`.
  - **`@memberjunction/core-entities-server`** — `MJApplicationEntityServer.server.ts` IsActive filter on Users moved server-side via `provider.Dialect.BooleanLiteral(true)`. `MJTemplateContentEntityServer.server.ts` AI enrichment now wrapped in a SAVEPOINT so failures don't poison the outer Save tx (PG's whole-tx-aborts-on-stmt-error policy made this fatal where SS treated it as a per-stmt skip).

  ### Cross-dialect runtime fixes
  - **`@memberjunction/sql-dialect`** — `pgDialect.ParameterRef` flat-lowercase contract; PG type → GraphQL `String` mapping for `character`, `varchar`, `citext`. `sqlDialect.ts` runtime SQL emission: `INTEGER`, `DOUBLE`, `PRECISION`, `BYTEA`, `OID`, `REGCLASS`, `REGPROC`, `NAME` added to `autoQuoteIdentifiers` keyword set so casts in hand-written SQL (`CAST(x AS INTEGER)`) stop being quoted as user-defined types. New `coerceBooleanLiteralsInSQL` pass rewrites SS bit literals (`Bool = 1` / `= 0` / `!= 1` / `<> 0`) to `TRUE`/`FALSE` for fields whose `TSType` is Boolean — fixes `operator does not exist: boolean = integer` for `ExtraFilter` clauses across engines, agents, and dashboards.
  - **`@memberjunction/codegen-lib`** — `applyPermissions` inner catch was binding `e` and shadowing the outer `EntityInfo` loop variable, producing `Error executing permissions file ... for entity undefined` log lines. Renamed to `sqlError` with `instanceof Error` typed message extraction.
  - **`@memberjunction/metadata-sync`** — `mj sync push` tolerates UUID case mismatches (PG returns lowercase, SS returns uppercase) on lookup resolution. `@file:` JSON references serialize to `jsonb` correctly on PG (was double-stringifying via the SS path).
  - **`@memberjunction/core`** (`baseEntity.ts`) — string default values now strip PG's typed-literal wrapper (`'Single'::character varying` → `Single`) before assignment so `MaxLength` validation doesn't fail on the wrapper length.
  - **`@memberjunction/core`** (`entityInfo.ts`) — multi-`IsNameField` resolution rule: when more than one field is marked, prefer the one literally named `Name`. Without this rule the pick depended on insertion order (PG returns DisplayName first, SS returns Name first), producing wrong codegen view aliases on PG.

  ### Breaking changes (for direct config consumers)
  - Any user `mj.config.cjs` with `dbType: 'mssql'` or `dbType: 'postgresql'` must rename to `dbPlatform: 'sqlserver'` or `dbPlatform: 'postgresql'`. The `dbType` field is removed.
  - Any user `.env` with `DB_TYPE=...` must rename it to `DB_PLATFORM=...`. The legacy `DB_TYPE` env var is no longer consulted at all (no fallback). `DB_PLATFORM` accepts only `sqlserver` or `postgresql` (case-insensitive); legacy aliases (`mssql`, `postgres`, `pg`) and any other non-empty value throw a clear "Invalid DB_PLATFORM value" error at startup rather than silently routing the wrong provider.
  - Both `dbType`/`DB_TYPE` were dev-only additions during PG support development (Feb 2026, first appeared in v5.30.0). They were never documented as customer-facing and never exposed a stable contract.

  ### Validation
  - 2,536 unit tests passing across the 8 affected packages (`@memberjunction/global` 381, `@memberjunction/core` 1099, `@memberjunction/sql-dialect` 213, `@memberjunction/codegen-lib` 435, `@memberjunction/metadata-sync` 220, `@memberjunction/server` 188), 0 failed.
  - Fresh-DB PostgreSQL replay clean: `DROP SCHEMA __mj CASCADE` → `mj migrate` applies 127/127 migrations, produces 316 `spCreate*` + 319 `spUpdate*` functions, with 0 `EntityField` rows in the staging-band Sequence range.

- 7e4957d: Universal search performance + correctness fix: honor `EntityField.UserSearchPredicateAPI`, escape LIKE metacharacters, add resilience layer, and stop CodeGen from re-introducing invalid search flags.

  **Why:** `LIKE '%term%'` was the only SQL the data provider ever generated for non-FTX entities, regardless of the configured predicate. CodeGen has been populating `UserSearchPredicateAPI` (Exact / BeginsWith / EndsWith / Contains) for months, but the runtime was discarding it. Combined with primary keys, non-text columns, and `nvarchar(MAX)` columns being auto-flagged as searchable, every keystroke against the global search box produced unindexed scans across tables of arbitrary size.

  **`@memberjunction/generic-database-provider`** — `GenericDatabaseProvider.createViewUserSearchSQL` now:
  - Honors `UserSearchPredicateAPI`: `Exact` emits `= N'term'` (index-seekable), `BeginsWith` emits `LIKE N'term%' ESCAPE '\'` (index-seekable), `EndsWith` emits `LIKE N'%term' ESCAPE '\'`, and the default `Contains` emits `LIKE N'%term%' ESCAPE '\'`. `UserSearchParamFormatAPI` still wins when set.
  - Escapes LIKE metacharacters (`%`, `_`, `[`, `]`, `\`) in user input with `ESCAPE '\'`. Previously a query of `50%` was treated as a wildcard.
  - Skips fields that aren't sensible text-search targets (non-text types; unbounded text on non-FTX entities) so an OR'd OR-predicate isn't built around an implicit per-row CONVERT.
  - Emits `N''` Unicode literals throughout to avoid collation surprises.

  **`@memberjunction/core`** — adds `EntityFieldInfo.UserSearchPredicateAPI: string` so consumers see the value the runtime now honors. Default `'Contains'`.

  **`@memberjunction/search-engine`** — Resilience layer:
  - `EntitySearchProvider`, `FullTextSearchProvider`, and `SearchEngine.Search` reject queries shorter than 3 characters early — these always fan out to full-database scans across every searchable entity.
  - `EntitySearchProvider` wraps each per-entity RunView in a 5-second hard timeout. A slow entity no longer holds up the whole fan-out; the other entities' results still land for the user. The underlying SQL keeps running on the server until it finishes (Request cancellation is a follow-up).
  - `SearchEngine.Search` has an in-process LRU result cache keyed by `(userID, query, MaxResults, MinScore, Filters)` with a 30s TTL and 500-entry cap. Preview-mode searches skip the cache. New `ClearResultCache()` admin/test hook.

  **`@memberjunction/codegen-lib`** — CodeGen guardrails so the metadata stays clean:
  - `applySearchableFieldUpdates` now refuses to set `IncludeInUserSearchAPI = 1` on primary keys, non-text columns, or unbounded text columns whose parent entity has `FullTextSearchEnabled = 0`. The LLM can still propose them; CodeGen drops the proposal silently.
  - `applyEntitySearchConfig` refuses to flip `AllowUserSearchAPI` from `0` to `1` on entities whose names match log/audit/run-history patterns (`*Logs`, `*Audit*`, `*Record Changes`, `*Runs`, `*Run Steps/Messages/History`, `*Execution Logs`). It still allows the LLM to _disable_ search on any entity.

  **Migrations (run via Flyway in the same release):**
  - `migrations/v5/V202605041250__v5.33.x__Search_Hygiene_For_Mj_Schema_And_Field_Types.sql` — disables `AllowUserSearchAPI` on 40 `__mj` log / audit / run-history / snapshot entities (Record Changes, Audit Logs, AI Agent + Prompt Runs, Company Integration Runs/Details/API Logs, Error Logs, Action Execution Logs, Test/Workflow/Recommendation/Scheduled/Duplicate Runs, User View Runs/Details, Report Snapshots, Archive Runs/Details, etc.) and clears `IncludeInUserSearchAPI` on PKs, non-text columns, and non-FTX unbounded text columns system-wide. Freezes the corresponding `AutoUpdate*` flags so CodeGen doesn't re-promote any of these silently.
  - `migrations/v5/V202605041300__v5.33.x__EntityField_UserSearchPredicateAPI_Check_Constraint.sql` — adds a trusted CHECK constraint enforcing the four documented values. Defensively normalizes any out-of-band rows to `'Contains'` first.

  **Behavior change to call out:** any caller that previously relied on `%` or `_` in a `UserSearchString` being interpreted as a SQL wildcard will now match those characters literally. There were no such known callers in the MJ ecosystem; this aligns the runtime with the documented contract.

### Patch Changes

- 74b0be0: Tolerate non-ISO `maxUpdatedAt` values in the smart cache check so a malformed timestamp degrades to a cache miss instead of throwing `Invalid time value`. Also expand the MJAPI GraphQL operation log so nested variables render as truncated JSON instead of Node's `[Object]` placeholders.
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7add405]
  - @memberjunction/sql-dialect@5.33.0
  - @memberjunction/global@5.33.0

## 5.32.0

### Minor Changes

- a7e8b3b: fix(geo): prevent OOM crash loops in ScheduledGeocodingAction by paginating RunView calls (500 records/page), replacing N+1 per-record SQL queries with a bulk Map lookup, adding a safety MaxTotal default of 50,000, and fixing a race condition in CreateGeoCodeRow on concurrent batch inserts
- b9c67ac: Remove stale MSGraph Migration

### Patch Changes

- @memberjunction/global@5.32.0

## 5.31.0

### Minor Changes

- 60e7541: Add --incremental flag for push/pull, lazy embedding loading, indexed batch context lookups, batched pull queries
- 17b8087: no migration but marking as minor due to cache bump stuff added here, good practice, but we're on a minor bump anyway
- 5db36d9: Fix RLS filter target for Unified Permissions Phase 2: rewrite the two `RowLevelSecurityFilter` rows seeded by V202604241700 to reference `__mj.vwAIAgentRuns` instead of the unschema-qualified base table `AIAgentRun`. The original values failed at runtime for UI-role users reading `MJ: AI Agent Run Steps` and `MJ: AI Prompt Runs` because the bare table name didn't resolve and, even schema-qualified, the role lacks SELECT on the base table — only the view.

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 18be074: Fix boundary wildcard stripping in sqlLike filters, fix QueryProcessor default value handling for array-typed parameters, add Chart.js canvas container and no-unwrap-utility-libs lint rules to react-test-harness, and fix SimpleChart label leak through onDataPointClick
- 6779c1e: Lazy field hydration in BaseEntity + smarter engine startup (~30x warm-load speedup, ~14s to ~470ms). Defers per-row Field construction until something mutates or walks Fields, removes a speculative per-view fast-start path, adds a `deferred` flag to `@RegisterForStartup` and an `EnsureLoaded()` shortcut on `BaseEngine` / `AIEngine`. DeveloperModeService and WorkspaceStateManager swapped weak `Get`/`Set` calls for typed accessors. EnsureLoaded calls added at AI engine consumption sites.
- de34786: Add `GetItems<T>(keys, category?)` batched read to `ILocalStorageProvider`. IndexedDB implementation uses a single read transaction with N parallel `get()` calls; Redis uses one `MGET` command. Used internally by `LocalCacheManager.GetRunViewResults` to batch the smart-cache-check warm-load reads (eliminating ~85 sequential per-key IDB transactions per coalesced engine bundle), the dataset-cache load (eliminating 3 redundant data-key reads per cached dataset access), and the metadata-snapshot bootstrap (3 keys → 1 batched read). Also fixes `IsDatasetCached` to probe via the tiny `_date` key instead of pulling the multi-MB dataset blob just for an existence check. No on-disk schema change; no version bump needed for the IDB schema. 28 new unit tests cover generic contract behavior, IDB single-transaction verification, and Redis MGET semantics including per-key error tolerance and deduplication.
- Updated dependencies [7ed7a4b]
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/global@5.30.1

## 5.30.0

### Minor Changes

- 68bf87f: Archive entity CodeGen migration with updated views/SPs, field display name corrections, and RuntimeActionConfiguration type fix
- 4729398: Runtime Actions — Phase 1 complete. Introduces `Action.Type='Runtime'`, a new action type where agents dynamically generate, test, and persist JavaScript actions that execute in MJ's isolated-vm sandbox with a permissioned bridge to metadata, views, queries, entity CRUD, other actions, agents, and AI prompts. Ships the v5.29.x migration (new `RuntimeActionConfiguration`, universal `MaxExecutionTimeMS`, and `CreatedByAgentID` columns on `Action`), the JSONType-authored config interface, the Zod validator with drift detection, the bidirectional IPC bridge in WorkerPool, the full `utilities.*` handler surface, the ActionSmith meta-agent with `Create Runtime Action` / `Test Runtime Action` helpers, Agent Manager wiring, the generic `Execute Agent` action, and Runtime-aware approval UI enhancements. Minor bumps across all touched packages because the schema migration + metadata records are coupled surface changes.
- c199f3b: Phase 2 of the unified permissions architecture: introduces the `IPermissionProvider` interface with 9 domain providers (Entity, Application Role, Dashboard, Resource, Artifact, AI Agent, Collection, Query, Access Control Rule) aggregated by a new `PermissionEngine` singleton, adds explicit Allow/Deny support to `EntityPermission`, and ships the Permissions admin dashboard. Includes migrations for the Permission Domain catalog, EntityPermission.Type column, Dashboard FK cascade delete, ResourcePermission.SharedByUserID, and UI role permission fixes.

### Patch Changes

- 963f2df: Gate the PreRunView/PreRunViews Fields-override on cache eligibility
- b1f32a4: Tighten the fast-startup window so all parallel engine loads share the local cache, defer background metadata validation until after StartupManager finishes, parallelize per-param IndexedDB cache checks, gzip-compress AllMetadata in localStorage, scope UserInfoEngine loads by UserID on the Network provider, and replace GeoDataEngine's Web Worker boundary parser with synchronous parsing to avoid an 11+s structured-clone stall.
  - @memberjunction/global@5.30.0

## 5.29.0

### Minor Changes

- e02e24e: Query rendering pipeline redesign: fix Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection), consolidate duplicated ORDER BY logic into shared analyzer, add RenderPipeline entry point with diagnostic tracing, introduce structural parser and symbol table for composition IR, and integrate SQL dialect objects throughout the parser removing all hardcoded dialect switch statements. SQL comments are now stripped before template evaluation instead of escaped. Production callers (RunQuery, TestQuerySQL) delegate to RenderPipeline. 65+ new tests including recursive CTEs, PostgreSQL dialect variants, and comment-stripping coverage.

  Query dashboard and form UI improvements: replace flat category dropdowns with hierarchical tree dropdowns, default new query category to active folder context, add per-folder create buttons, expose Reusable/CacheEnabled/AuditQueryRuns fields in entity form Details panel, add saving indicator with spinner overlay, fix sub-entity delete by reloading fresh entity copies, and fix tree dropdown not showing pre-selected text for branch-only configurations. Fix extraction pipeline not cleaning up stale Query Fields and Query Entities when extraction produces no results, with 9 regression tests.

### Patch Changes

- @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- 115e4da: Hot-path optimizations and a new BaseEngine observable API.

  **Performance (bundled from #2397, #2405, #2406, #2417):**
  - `BaseEntity.GetFieldByName` and new `GetFieldByCodeName` back Fields lookups with lazy `Map` caches — O(1) in place of O(N) `.find()` scans inside `SetMany`, setters, and serialization. Caches clear on `init()` so re-initialized entities see fresh fields.
  - `Metadata.EntityByName`/`EntityByID` fall back to a lazy `Map` when the provider doesn't own the lookup. UUID keys are normalized so SQL-Server-upper-case and PostgreSQL-lower-case resolve the same entry. Invalidated on `Refresh()`.
  - `BaseInfo.copyInitData` uses `hasOwnProperty` instead of scanning `Object.keys(this)`, and short-circuits the `DefaultValue` case-insensitive match with an exact-equality fast path plus a length pre-check before falling back to `toLowerCase`.
  - `RunView`/`RunViews` post-cache field filtering caches per-call key-to-keep decisions so repeated keys across rows avoid re-lowercasing and re-lookup.

  **BaseEngine observable properties:**
  - New `BaseEngine.ObserveProperty<E>(propertyName)` returns an `Observable<E[]>` backed by a lazy `BehaviorSubject`. Unobserved properties pay zero runtime cost.
  - Five mutation paths (`applyImmediateMutation` add/remove, `LoadSingleEntityConfig`, `LoadMultipleEntityConfigs`, remote-record-data handling) now emit via `emitPropertyChange` so subscribers receive array updates.
  - `UserInfoEngine` exposes `UserNotifications$`, `UserFavorites$`, `UserApplications$` as convenience accessors.

  Fully test-covered: 918/918 tests pass in `@memberjunction/core` including new coverage for each cache and for the observable lifecycle.
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/global@5.27.0

## 5.26.0

### Minor Changes

- a1002f4: - Entities now expose AllowCaching as the runtime source of truth for

### Patch Changes

- @memberjunction/global@5.26.0

## 5.25.0

### Minor Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.

### Patch Changes

- @memberjunction/global@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- 1912726: Add sqlLikeContains, sqlLikeBegins, and sqlLikeEnds template filters for platform-aware LIKE pattern matching
  - @memberjunction/global@5.24.0

## 5.23.0

### Minor Changes

- 513b20c: migration/metadata
- 44bc22b: JSONType strong typing system: adds JSONType, JSONTypeIsArray, and JSONTypeDefinition metadata.

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- 9250070: Update default configs for local cache manager.
- Updated dependencies [247df16]
  - @memberjunction/global@5.23.0

## 5.22.0

### Patch Changes

- 6a5093b: no migration
- e123e4b: bug fixes for RunView cache, Data Explorer, and MCP OAuth scopes
- Updated dependencies [f2a6bec]
  - @memberjunction/global@5.22.0

## 5.21.0

### Patch Changes

- c7dfb20: no migration/metadata changes (yet)
  - @memberjunction/global@5.21.0

## 5.20.0

### Minor Changes

- 2298f8a: Metadata Migration for v5.20.0

### Patch Changes

- @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- 9881045: no metadata or migration files, patch release
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- 2387400: Migrated singleton classes to BaseSingleton pattern and extracted auth providers into standalone package
- 11dba07: no migration
  - @memberjunction/global@5.16.0

## 5.15.0

### Minor Changes

- 662d56b: migration + metadata

### Patch Changes

- d01f697: MJ SQL Parser: unified parser for SQL + Nunjucks templates + composition tokens. Replaces fragmented regex-based SQL parsing across 6 packages with a single MJSQLParser class providing AST-based tokenization, placeholder substitution, CTE extraction, ORDER BY remapping, and deterministic parameter/field extraction. Moves QueryPagingEngine from MJCore to GenericDatabaseProvider with AST-based paging. Fixes backtick quoting, table-qualified ORDER BY remapping, trailing semicolon, and FOR XML parsing bugs.
  - @memberjunction/global@5.15.0

## 5.14.0

### Minor Changes

- 140fc6d: Add HubSpot v4 association fetch, fix empty-string-to-null coercion for HubSpot datetime fields, widen GetCachedObject/GetCachedFields visibility to protected, and fix OpenAI streaming max_completion_tokens parameter

### Patch Changes

- 69b5af4: Add TestQuerySQL resolver and client method for query execution testing, refactor CreateQueryResolver into QuerySystemUserResolver composing CodeGen-generated MJQuery\_ types, add lightweight query catalog for collision detection, unit tests for transitive template composition and ORDER BY stripping, and updated class registration manifests
  - @memberjunction/global@5.14.0

## 5.13.0

### Minor Changes

- d0d9eba: Add metadata migration script for v5.13.0

### Patch Changes

- f72b538: Replace HookRegistry and DynamicPackageLoader with @RegisterClass + ClassFactory middleware pattern, and add GetResolverPaths() to BaseServerMiddleware for auto-discovery of middleware-contributed GraphQL resolvers
- Updated dependencies [f72b538]
  - @memberjunction/global@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.
- d92502e: migration/metadata

### Patch Changes

- @memberjunction/global@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/global@5.10.1

## 5.10.0

### Minor Changes

- f2df653: Add ExternalReferenceID column to AIAgentRun for cross-system run correlation and wire it through Skip proxy. Fix CodeGen validator duplicate generation and cleanup existing duplicates.

### Patch Changes

- 75dd36b: no migration
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0

## 5.8.0

### Minor Changes

- 0753249: Add metadata migration script for v5.8.0

### Patch Changes

- @memberjunction/global@5.8.0

## 5.7.0

### Minor Changes

- 642c4df: Remove migration script V202603021400**v5.6.x**Optimize_RecordChange_Detection_Index because it would significantly increase database size and cause migration timeouts for AIDP upgrades (it adds an index on RecordChange that included FullRecordJSON).

### Patch Changes

- @memberjunction/global@5.7.0

## 5.6.0

### Minor Changes

- 4547d05: Grant UI role Create/Update permissions on 9 agent and conversation entities so end users can use agents like Sage

### Patch Changes

- 76eaabc: Fix SQL validation regex to allow legitimate string values containing SQL keywords, add PlatformSQL support to GraphQLSystemUserClient input types, and mark 25 deprecated AI model-vendor inference pairs as Inactive
  - @memberjunction/global@5.6.0

## 5.5.0

### Minor Changes

- a1648c5: Add MiniMax AI provider package, add MiniMax and Gemini 3.1 Pro models to AI model catalog, fix ng-conversations to prevent client from overwriting server-completed conversation details, and align metadata files with SQL logger output to prevent phantom mj-sync updates
- ee9f788: migrations - postgres sql support!

### Patch Changes

- 2b1d842: Add Qwen 3.5 Plus AI model metadata and revert diagnostic logging for component registry loading
- df2457c: no migration, just small code changes
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/global@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/global@5.3.0

## 5.2.0

### Minor Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- 06d889c: metadata -> migration
- 3542cb6: metadata -> migration

### Patch Changes

- @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Minor Changes

- a3e7cb6: migration

### Patch Changes

- Updated dependencies [4aa1b54]
  - @memberjunction/global@5.0.0

## 4.4.0

### Minor Changes

- bef7f69: Migration for metadata sync

### Patch Changes

- 61079e9: just a plan
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/global@4.3.1

## 4.3.0

### Minor Changes

- 564e1af: migration

### Patch Changes

- @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/global@4.2.0

## 4.1.0

### Minor Changes

- 77839a9: Enable cascade deletes for AI Agent and Prompt entities, add cross-file dependency detection and --delete-db-only flag to MetadataSync for proper deletion ordering, fix CodeGen duplicate variable names for self-referential FKs, add requireConnectivity config to QueryGen, and add Gemini JSON parser support to DBAutoDoc.
- 5af036f: Migration for metadata

### Patch Changes

- @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- 718b0ee: migration
- e06f81c: changed SO much!

### Patch Changes

- 5c7f6ab: EntityByName
- Updated dependencies [8366d44]
- Updated dependencies [718b0ee]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/global@4.0.0

## 3.4.0

### Minor Changes

- a3961d5: feat(codegen): Add soft PK/FK support for messy databases

### Patch Changes

- @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/global@3.0.0

## 2.133.0

### Minor Changes

- c00bd13: Add metadata migration script for 2.133.0

### Patch Changes

- @memberjunction/global@2.133.0

## 2.132.0

### Minor Changes

- 55a2b08: Migration

### Patch Changes

- @memberjunction/global@2.132.0

## 2.131.0

### Minor Changes

- 280a4c7: Add Cerebras as AI inference provider for GLM-4.7 model and improve MetadataSync with recursive @file reference resolution in checksum calculations

### Patch Changes

- 81598e3: no migration just code
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/global@2.130.1

## 2.130.0

### Minor Changes

- 9f2ece4: Migration
- 02e84a2: Add GPT Codex models (5.2-codex, 5.1-codex-max, 5.1-codex-mini), implement SimpleChart stackBy property for stacked bar/column charts, add @file: directive support for component code references, reorganize component metadata with comprehensive documentation, and fix metadata-sync validation for glob patterns with \*\*/ prefix

### Patch Changes

- @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- c391d7d: Migration
- 8c412cf: migration
- fbae243: migration
- c7e38aa: migration
- 7a39231: Add Vertex AI provider with Google GenAI SDK integration, resolve database connection timeout, and improve conversation UI

### Patch Changes

- 0fb62af: Move GraphQL type name utilities to @memberjunction/core and clean up unused imports
- 7d42aa5: Fix non-deterministic entity ordering in metadata system and remove redundant entity sorting in CodeGen
- Updated dependencies [fbae243]
- Updated dependencies [c7e38aa]
  - @memberjunction/global@2.129.0

## 2.128.0

### Minor Changes

- f407abe: Add EffortLevel support to AIPromptModel with priority hierarchy and fix GPT 5.2 naming convention to align with standards

### Patch Changes

- @memberjunction/global@2.128.0

## 2.127.0

### Minor Changes

- c7c3378: Fix memory leaks and improve conversation naming performance
- b748848: Add Gemini 3 Flash and GPT-5.2 AI models, enhance QueryGen with graph-based entity targeting, AI-powered semantic query naming, and optional external SQL file generation

### Patch Changes

- Updated dependencies [c7c3378]
  - @memberjunction/global@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/global@2.126.1

## 2.126.0

### Minor Changes

- 703221e: Migration

### Patch Changes

- @memberjunction/global@2.126.0

## 2.125.0

### Minor Changes

- bd4aa3d: Migration file

### Patch Changes

- @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- 75058a9: Fix metadata provider race conditions, add EntityDataGrid component validation, and enforce Component entity Specification field as single source of truth
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/global@2.122.1

## 2.122.0

### Minor Changes

- 6de83ec: Add component linter enhancements with type inference and control flow analysis, DBAutoDoc query generation features, MCP server diagnostic tools, metadata sync improvements, and enhanced JWKS client with HTTP keep-alive connections and connection pooling to prevent socket hangups
- c989c45: migration

### Patch Changes

- @memberjunction/global@2.122.0

## 2.121.0

### Minor Changes

- a2bef0a: Refactor component-linter with fixture-based testing infrastructure, fix agent execution error handling and payload propagation, add Gemini API parameter fixes, and improve vendor failover with VendorValidationError type
- 7d5a046: Migration to add missing core entity fields.

### Patch Changes

- @memberjunction/global@2.121.0

## 2.120.0

### Minor Changes

- 3074b66: Add agent run auditing and debugging tools, enhance AI agent execution history with search and pagination, improve query parameter extraction and validation, and add linter validation for missing query names
- 60a1831: Fix WebSocket subscription lifecycle management in GraphQL data provider, add Gemini 3 Pro model with 1M token context window, enhance component linter to detect invalid property access on RunQuery/RunView results, and fix testing dashboard dialog rendering issues

### Patch Changes

- 5dc805c: just a prototype
  - @memberjunction/global@2.120.0

## 2.119.0

### Minor Changes

- 7dd7cca: Migration

### Patch Changes

- @memberjunction/global@2.119.0

## 2.118.0

### Minor Changes

- 78721d8: Migration to minor version.

### Patch Changes

- @memberjunction/global@2.118.0

## 2.117.0

### Minor Changes

- 8c092ec: Migration

### Patch Changes

- @memberjunction/global@2.117.0

## 2.116.0

### Minor Changes

- 81bb7a4: Update SingleRecordView Generic Component (metadata)

### Patch Changes

- Updated dependencies [a8d5592]
  - @memberjunction/global@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- 61d1df4: Bump patch version
  - @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/global@2.110.1

## 2.110.0

### Patch Changes

- @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/global@2.106.0

## 2.105.0

### Patch Changes

- @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [2ff5428]
  - @memberjunction/global@2.104.0

## 2.103.0

### Minor Changes

- bd75336: ix: Improve React component system registry handling and chart
  flexibility
  - Enhanced component manager to optimize pre-registered component loading
    by skipping redundant fetches
  - Fixed SimpleChart component to accept any field for grouping, not just
    numeric fields
  - Removed backup metadata file to clean up repository
  - Added support for components with pre-populated code in the registry
  - Improved dependency resolution for local registry components
  - Better logging for component loading optimization paths

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [addf572]
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/global@2.100.1

## 2.100.0

### Minor Changes

- 5f76e3a: feat: Add standard MJ components with improved framework
  patterns

  ### Summary

  Introduces four new standard MemberJunction components that
  follow established framework patterns for library access,
  metadata usage, and component composition.

  ### New Components
  - **SimpleChart**: Lightweight charting component with
    automatic data aggregation, smart chart type selection, and
    proper date formatting
  - **SimpleDrilldownChart**: Extends SimpleChart with integrated
    drill-down capability to show detailed records in a DataGrid
  - **OpenRecordButton**: Smart navigation button that uses
    entity metadata to automatically detect primary keys
  - **SingleRecordView**: Metadata-driven record display with
    multiple layout options and optional OpenRecord button
    integration

### Patch Changes

- @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- 8bbb0a9: - Updated RunView resolver and GraphQL data provider to work with any
  primary key configuration
  - Changed from hardcoded "ID" field to dynamic PrimaryKey array from
    entity metadata
  - Added utility functions for handling primary key values in client code
  - Supports single non-ID primary keys (e.g., ProductID) and composite
    primary keys
  - Fixes compatibility with databases like AdventureWorks that use
    non-standard primary key names
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/global@2.97.0

## 2.96.0

### Minor Changes

- 01dcfde: migration

### Patch Changes

- @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- a54c014: duck typing
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- f8757aa: bug fixes
  - @memberjunction/global@2.93.0

## 2.92.0

### Minor Changes

- 8fb03df: migrations
- 5817bac: migration

### Patch Changes

- @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- f703033: Implement extensible N-provider authentication architecture
  - Created shared authentication types in @memberjunction/core for use
    across frontend and backend
  - Refactored authentication to support multiple providers using MJGlobal
    ClassFactory pattern
  - Implemented dynamic provider discovery and registration without
    modifying core code
  - Added support for multiple concurrent auth providers via authProviders
    array configuration
  - Replaced static method with cleaner property pattern for Angular
    provider dependencies
  - Eliminated code duplication and removed unused configuration methods
  - Maintained full backward compatibility with existing auth
    implementations

  This enables teams to add custom authentication providers (SAML,
  proprietary SSO, etc.)
  without forking or modifying the core authentication modules.
  - @memberjunction/global@2.91.0

## 2.90.0

### Minor Changes

- 146ebcc: migration

### Patch Changes

- @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- @memberjunction/global@2.88.0

## 2.87.0

### Minor Changes

- 58a00df: Removed broken migration

### Patch Changes

- @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- @memberjunction/global@2.85.0

## 2.84.0

### Minor Changes

- 0b9d691: Changes to MJCore/SQLServerDataProvider/GraphQLDataProvider to ensure that calls handle pre/post processing of RunView/RunViews properly regardless of entry point to the provider.

### Patch Changes

- @memberjunction/global@2.84.0

## 2.83.0

### Minor Changes

- e2e0415: Bump to version 2.83.0 to align with migration file versioning

### Patch Changes

- @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- @memberjunction/global@2.82.0

## 2.81.0

### Minor Changes

- 971c5d4: feat: implement query audit logging and TTL-based caching

  Add comprehensive audit logging and caching capabilities to the
  MemberJunction Query system:
  - Add ForceAuditLog and AuditLogDescription parameters to RunQuery for
    granular audit control
  - Implement TTL-based result caching with LRU eviction strategy for
    improved performance
  - Add cache configuration columns to Query and QueryCategory entities
  - Support category-level cache configuration inheritance
  - Update GraphQL resolvers to handle new audit and cache fields
  - Refactor RunQuery method into logical helper methods for better
    maintainability
  - Follow established RunView pattern for fire-and-forget audit logging

### Patch Changes

- 6d2d478: feat: AI Agent UI improvements and server-side context fixes
  - Enhanced AI Agent dialogs with resizable and draggable functionality
    using Kendo UI Window component
  - Improved dialog positioning with consistent center placement and proper
    container context
  - Fixed prompt selector in AI Agent form for better user experience
  - Added missing contextUser parameter to GetEntityObject calls in
    BaseResolver for proper multi-user isolation
  - Fixed createRecordAccessAuditLogRecord calls in generated resolvers to
    include provider argument
  - Added JSDoc documentation to ViewInfo class properties for better code
    documentation
  - Applied consistent dialog styling across all AI Agent management
    components
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- 7c5f844: Bug fixes for SQLServerDataProvider and fix ability to use other providers for MD refreshes up and down the stack
  - @memberjunction/global@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [907e73f]
  - @memberjunction/global@2.79.0

## 2.78.0

### Patch Changes

- @memberjunction/global@2.78.0

## 2.77.0

### Minor Changes

- d8f14a2: significant changes in all of these
- c91269e: migration file for permissions driving minor bump

### Patch Changes

- @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- 7dabb22: feat: add hierarchical CategoryName support for query lookup

  Adds support for hierarchical category paths in query lookup operations.
  The CategoryName parameter now accepts filesystem-like paths (e.g.,
  "/MJ/AI/Agents/") that walk through the QueryCategory parent-child
  relationships.

  ### New Features
  - **Hierarchical Path Resolution**: CategoryName now supports paths like
    "/MJ/AI/Agents/" that are parsed by splitting on "/" and walking down the
    category hierarchy using ParentID relationships
  - **CategoryPath Property**: Added CategoryPath getter to QueryInfo class
    that returns the full hierarchical path for any query
  - **Backward Compatibility**: Existing simple CategoryName usage (e.g.,
    "Agents") continues to work unchanged
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/global@2.75.0

## 2.74.0

### Minor Changes

- d316670: migration - MJCore

### Patch Changes

- @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0

## 2.69.1

### Patch Changes

- 2aebdf5: Patch to repackage failed deployment run
  - @memberjunction/global@2.69.1

## 2.69.0

### Minor Changes

- 79e8509: Several changes to improve validation functionality

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/global@2.69.0

## 2.68.0

### Patch Changes

- b10b7e6: tweaks to EntityField active status assertion - enabled supression per field instance
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [619488f]
  - @memberjunction/global@2.65.0

## 2.64.0

### Patch Changes

- @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1

## 2.63.0

### Patch Changes

- @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/global@2.61.0

## 2.60.0

### Minor Changes

- e512e4e: metadata + core + ai changes

### Patch Changes

- b5fa80a: Improvements to boolean and numeric handling in EntityField Dirty and Set methods
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/global@2.59.0

## 2.58.0

### Patch Changes

- def26fe: Added UUID generation to BaseEntity for entities that have single-column pkey that is uniqueidentifier type
  - @memberjunction/global@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/global@2.57.0

## 2.56.0

### Patch Changes

- @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- 20f424d: DatabaseProviderBase added and changes to SQLServerDataProvider to fix transaction handling
  - @memberjunction/global@2.54.0

## 2.53.0

### Minor Changes

- bddc4ea: LoadFromData() changed to async, various other changes

### Patch Changes

- @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- e926106: Significant improvements to AI functionality

### Patch Changes

- @memberjunction/global@2.52.0

## 2.51.0

### Minor Changes

- 7a9b88e: AI Improvements

### Patch Changes

- @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/global@2.50.0

## 2.49.0

### Minor Changes

- cc52ced: Significant changes all around
- db17ed7: Further Updates
- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [cc52ced]
- Updated dependencies [62cf1b6]
  - @memberjunction/global@2.49.0

## 2.48.0

### Minor Changes

- bb01fcf: bug fixes but bumping minor version here since we have a migration in this PR

### Patch Changes

- @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/global@2.46.0

## 2.45.0

### Patch Changes

- @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- fbc30dc: Documentation
  - @memberjunction/global@2.44.0

## 2.43.0

### Minor Changes

- 1629c04: Templates Improvements + EntityField.Status Column added with related changes

### Patch Changes

- @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/global@2.42.1

## 2.42.0

### Patch Changes

- @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- 3be3f71: Patched sql stored procedure name for tables with name colisions.
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/global@2.37.1

## 2.37.0

### Patch Changes

- @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- 9d709e2: Implemented optional async Validate mechanism for any BaseEntity sub-class to be part of the Save() pipeline.
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- 160f24f: Tweak to default value handling for EntityField class
- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
  - @memberjunction/global@2.36.0

## 2.35.1

### Patch Changes

- 3e7ec64: Strong typing for transaction item callback function and fix bug in SQL Server Data Provider caused by weak typing
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/global@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/global@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/global@2.34.1

## 2.34.0

### Patch Changes

- 785f06a: Improvements to Ask Skip and Skip Chat components for HTML Reports
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/global@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/global@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/global@2.32.0

## 2.31.0

### Patch Changes

- @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [a3ab749]
  - @memberjunction/global@2.30.0

## 2.29.2

### Patch Changes

- 07bde92: New CodeGen Advanced Generation Functionality and supporting metadata schema changes
- 64aa7f0: New query for 2.29.0 to get version history since we aren't using an entity for flyway data anymore. Improvements to query execution to support query execution by name as well as by ID, and general cleanup (code wasn't working before as query ID wasn't enclosed in quotes from days of INT ID types)
- 69c3505: bumped package-lock for 2.280
  - @memberjunction/global@2.29.2

## 2.28.0

### Minor Changes

- 8259093: Communication Provider now supports forwarding messages

### Patch Changes

- @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/global@2.27.1

## 2.27.0

### Patch Changes

- 54ab868: Added LogDebug
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/global@2.26.1

## 2.26.0

### Minor Changes

- 23801c5: Changes to use of TransactionGroup to use await at all times.Fixed up some metadata bugs in the \_\_mj schema that somehow existed from prior builds.Cleaned up SQL Server Data Provider handling of virtual fields in track record changesFixed CodeGen to not emit null wrapped as a string that was happening in some casesHardened MJCore.BaseEntity to treat a string with the word null in it as same as a true null value (in case someone throws that into the DB)

### Patch Changes

- @memberjunction/global@2.26.0

## 2.25.0

### Minor Changes

- 26c990d: - Add Conversations to Resource Types Entity* Update User View Grid to fix multi-edit bug* Transaction Management Changes - fixes bug in #803 - but not new feature in there* Clean bug in Notification Service to only show user-centric messages* Add Sharing dialog to Skip Chat component

### Patch Changes

- fd07dcd: Sparse Updates for Create/Update Mutations via CodeGen
- 86e6d3b: Finished debug for Variables support in transaction groups!
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/global@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
  - @memberjunction/global@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/global@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/global@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0

## 2.22.2

### Patch Changes

- 94ebf81: Add override for node typings
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/global@2.22.1

## 2.22.0

### Minor Changes

- a598f1a: Added a repeatable migration to maintain database metadata

### Patch Changes

- Updated dependencies [9660275]
  - @memberjunction/global@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:27 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

### Patches

- Bump @memberjunction/global to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.20.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/global to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/global to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/global to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/global to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/global to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/global to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/global to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/global to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/global to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/global to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:28 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump patch version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/global to v2.14.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/global to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:44 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/global to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/global to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/global to v2.13.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.12.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/global to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/global to v2.9.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/global to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Bump @memberjunction/global to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/global to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:03 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/global to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/global to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:06 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.5.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/global to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.3.1

## 2.2.2

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

### Patches

- Bump @memberjunction/global to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/global to v2.2.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/global to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/global to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/global to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/global to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:27 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/global to v1.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.7.1

Wed, 12 Jun 2024 20:13:28 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:38 GMT

### Minor changes

- Bump @memberjunction/global to v1.7.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/global to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/global to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/global to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/global to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:53 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:17 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.4.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/global to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/global to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/global to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/global to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/global to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/global to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/global to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:41 GMT

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- - Completed removed Kendo SVG Icons and standardized on Font Awesome. Done for consistency, simplicity and also because Kendo SVG Icons seem to be having a major impact on rendering performance/resizing/etc * In several areas while removing KendoSVG and replacing with Font Awesome, implemented the new Angular 17 style control flow (@if instead of *ngIf as an example) (97354817+AN-BC@users.noreply.github.com)
- - Added support for BaseFieldComponent to show or not show its label \* Added more JSDoc documentation to classes within MJCore and MJGlobal (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/global to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.0.8

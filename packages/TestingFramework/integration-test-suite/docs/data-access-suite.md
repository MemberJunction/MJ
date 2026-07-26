# Data-Access Sub-Suites — RunView, RunQuery, Views, Lists

This document describes the **shipped, running** data-access family of MemberJunction's integration suite: **7 bundles, 62 checks** covering the two dynamic data primitives (`RunView`/`RunViews` and `RunQuery`), the viewing system, and the Lists keyset substrate. All 62 checks are **deterministic tier** — credential-free, read-only or self-cleaning, part of the blocking gate — and all 7 bundles are joined to the **"Integration Tests — Deterministic"** suite. Run the whole tier from the repo root with `npm run test:integration` (which expands to `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"`), or dispatch a single bundle by running its IT record through `mj test` (e.g. the test named `IT31 - RunView Feature Matrix`). Client-transport bundles require a **live MJAPI**; when it is unreachable the driver reports a loud `SKIPPED (environment gap)` rather than a false pass (`testing-integration/src/IntegrationTestDriver.ts:186-188`). Design ancestry: the Domain 0 (0a–0e) and Domain 11 sections of [test-catalog.md](./test-catalog.md). Defect cross-references: the [bug register](../../../../plans/integration-test-expansion/bug-register.md).

| Bundle | IT record | Suite seq | Transport | Checks | Fixtures |
|---|---|---|---|---|---|
| `runview-matrix` | IT31 - RunView Feature Matrix | 37 | client (GraphQL wire) | 18 (RVM1–RVM18) | none — discovered universe, read-only |
| `runview-features` | IT32 - RunView Cross-Feature Edges | 38 | client | 6 (RVF1–RVF6) | none — discovered universe, read-only |
| `runquery-catalog` | IT33 - RunQuery Catalog Sweep | 39 | client | 6 (QC1–QC6) | none — executes the shipped catalog |
| `runquery-params` | IT34 - RunQuery Parameter Permutation | 40 | client | 10 (QP1–QP10) | none — executes the shipped catalog |
| `runquery-features` | IT35 - RunQuery Feature Surface | 20 | server (in-process) | 10 (QF1–QF10) | self-cleaning Query Category + paging Query |
| `view-execution` | IT25 - View Execution (client-first) | 33 | client | 9 (V1–V4, V9–V13) | none — discovered universe, read-only |
| `lists` | IT20 - Lists Keyset Pagination | 14 | server (in-process) | 3 (LS1–LS3) | self-cleaning List + 25 List Details |

Server-transport members (IT20, IT35) are sequenced before the client-transport members (IT25, IT31–IT34), which sit at the end of the deterministic suite — the suite's client-members-last ordering convention.

**How checks obtain their context.** Every check receives an `IntegrationCheckContext` (`ctx`) built by `IntegrationTestDriver.buildCheckContext` according to the IT record's `Configuration.transport`. For `"client"`, the driver calls `bootstrapIntegrationClient()` — a real `GraphQLDataProvider` connected over the GraphQL wire to a live MJAPI with the system API key, exactly like a browser — and `ctx.Provider`/`ctx.User` are that client stack. For `"server"`, `bootstrapIntegrationServer()` supplies the in-process `SQLServerDataProvider` stack. Checks then use the plain framework surface (`new RunView()`, `new RunQuery()`, `ctx.Provider.Entities`, `ctx.User`), so a client-transport check exercises serialization, resolver auth, field mapping and transport framing — the layer where a large class of bugs lives that in-process calls never touch.

---

## 1. Bundle `runview-matrix` (RVM1–RVM18) — every RunViewParams feature, swept across all entities

**File:** `src/checks/runview-matrix.checks.ts` · **Catalog ancestor:** [test-catalog.md](./test-catalog.md) Domain 0a

### Machinery under test and why it matters

`RunView` is MJ's universal dynamic-set read: every dashboard grid, every engine cache load, every agent data pull goes through `RunViewParams` → provider → `vw<Entity>` view SQL. This bundle sweeps the *core parameter surface* — `ResultType` (`count_only` / `simple` / `entity_object`), `Fields` projection (including the documented "`Fields` is IGNORED for `entity_object`" contract enforced by `ProviderBase.PreRunView`, `packages/MJCore/src/generic/providerBase.ts:470-477`), `OrderBy` (single and multi-column), `ExtraFilter` (semantics + the injection guard), `UserSearchString`, `MaxRows`/`IgnoreMaxRows`, `StartRow` OFFSET pagination, `AfterKey` keyset pagination and its three guard refusals, `Aggregates`, `RunViews` batching, and `PlatformSQL` per-platform variants — **across every entity in the provider's metadata**, not a hand-picked few. A regression in any of these breaks essentially every consumer of MJ data at once.

The check logic for the core sweeps (RVM1–RVM4) is copied from the standalone rig `rigs/runview-matrix-tests.ts` (which remains in place as a bug-finding sweep with a categorized report and exit codes), adapted to the registry contract: each sweep collects per-entity failures and throws at the end when any were found. Note the rig's own `USAGE` comment still points at the retired `packages/MJServer/integration-test-scripts/` path — the rig actually lives at `packages/TestingFramework/integration-test-suite/rigs/runview-matrix-tests.ts`.

### Transport

**Client-first.** Every leg runs `RunView`/`RunViews` on the configured provider, which under the client bootstrap is the `GraphQLDataProvider` over the real wire to a live MJAPI.

### Fixtures / lifecycle

**None — read-only by construction.** There is no `RegisterLifecycle`. The sweeps operate on the entity list from `ctx.Provider.Entities` (name-sorted); the targeted checks operate on a **discovered universe**: the `MJ: Entity Fields` rows belonging to the first three `MJ: Entities` by ID, memoized per process, with a proper non-empty subset predicate (`EntityID='<first>'`). Nothing is created, so nothing can be orphaned.

Sweep mechanics worth knowing:

- **Skip/deny accounting is explicit.** Entities with `IncludeInAPI === false` or `AllowAllRowsAPI === false` are counted `Skipped`; permission-blocked results (`isPermissionError` on the `ErrorMessage`) are counted `Denied`. `finishSweep` logs the tally, **refuses a vacuous sweep** (`Probed === 0` throws), and throws with a bounded offender sample when any hard failures accumulated.
- **Sweep economics** (documented deviation from the catalog's "no MaxRows shortcut"): the full-width sweep pulls `maxRows` rows per entity (config key `maxRows`, default 5) for the column-shape leg and uses `TotalRowCount` for full-set parity — pulling every row of every entity full-width is unbounded in a shared dev DB and adds no assertion power. Config key `entityLimit` caps the sweep for smoke runs (mirrors the rig's `RUNVIEW_MATRIX_LIMIT`).
- **A count memo** populated by RVM1's `count_only` sweep is reused by RVM9/RVM11/RVM12/RVM13/RVM15 (via `totalCount`) so the bundle does not run a second full-entity count sweep.
- **Cross-platform ID normalization**: all PK comparisons go through `normId` (trim + lowercase) because SQL Server returns UUIDs uppercase and PostgreSQL lowercase.

### Tier

All 18 checks are deterministic (no `RequiresMutation`, no `RequiresLiveModel`).

### Per-check inventory

| ID | Short name | Asserted observable | Failure it catches |
|---|---|---|---|
| `runview-matrix.RVM1` | count_only sweep | Every non-skipped entity: `Success`, `TotalRowCount` populated, **zero** rows returned | count_only silently returning rows, or a null count on any entity |
| `runview-matrix.RVM2` | Full-width read sweep | Sample row contains **every non-virtual column**; `TotalRowCount` equals RVM1's count_only value | dropped columns in view generation / marshalling; count divergence between ResultTypes |
| `runview-matrix.RVM3` | Fields projection sweep | Row shape is exactly {requested field + forced PK(s)} — PK never missing, nothing extra | projection leaking unrequested columns, or dropping the forced PK the client relies on |
| `runview-matrix.RVM4` | entity_object sweep | Rows are real BaseEntity objects (`.Save`/`.GetAll` present); `GetAll()` carries every non-virtual field **despite a Fields param being passed** | `PreRunView`'s Fields-override contract breaking — entity objects materialized with partial field sets are silently invalid for mutation |
| `runview-matrix.RVM5` | OrderBy ASC vs DESC | On a **discovered** numeric non-PK field (3–3000 non-null rows): ASC monotonic, DESC (with PK tie-break) is the exact reversal | ORDER BY direction ignored or applied client-side inconsistently |
| `runview-matrix.RVM6` | Multi-column OrderBy | `Sequence ASC, __mj_CreatedAt DESC` over the universe: primary sort monotonic, secondary DESC honored within every tie group; **≥1 tie group must exist** (anti-vacuity) | tie-break column silently dropped from the ORDER BY |
| `runview-matrix.RVM7` | ExtraFilter trio | Tautology (`ID IS NOT NULL`) = full universe count; impossible (`ID IS NULL`) = 0; field-eq = exactly the subset ID set | WHERE-clause composition bugs (filter dropped, wrong AND/OR grouping, off-by-subset) |
| `runview-matrix.RVM8` | ExtraFilter injection guard | On `MJ: Users`: `;`+DROP, `UNION`, `--` comment all **refused**; benign clause accepted | injection-guard regression (sibling of view-execution.V3, on a different entity) |
| `runview-matrix.RVM9` | UserSearchString | Seed leg: a live-sampled value on a LIKE-path searchable entity finds its own row. No-op leg: a **non-empty** entity with zero search fields returns its unfiltered count for a nonsense term (pinned no-op) | configured-search-fields matching broken; or `UserSearchString` suddenly filtering entities that declare no search surface |
| `runview-matrix.RVM10` | MaxRows exact | `MaxRows: 5` on `MJ: Entity Fields` (≥6 rows) returns exactly 5 rows | TOP/LIMIT off-by-one or ignored |
| `runview-matrix.RVM11` | IgnoreMaxRows vs UserViewMaxRows | On an entity with a **binding** `UserViewMaxRows` cap: default read stops at the cap, `IgnoreMaxRows` returns the full set | the entity-level cap or its override regressing |
| `runview-matrix.RVM12` | StartRow OFFSET walk | On a discovered 12–2000-row single-PK entity (deliberately **not** `MJ: Entity Fields`): union of pages == full set, no duplicates, no gaps, ≥2 pages, terminates | OFFSET arithmetic bugs; proves pagination is not an Entity Fields special case |
| `runview-matrix.RVM13` | AfterKey keyset walk | Same discovered entity: every row exactly once via seek pagination; walk ends on a **short** page | seek-predicate bugs (skipped/duplicated rows at page boundaries) |
| `runview-matrix.RVM14` | AfterKey guard refusals | `AfterKey`+`StartRow` refused; `AfterKey`+non-PK `OrderBy` refused with a cause-naming message; wrong-key-shape `AfterKey` refused with a cause-naming message | any guard silently degrading keyset to a wrong result instead of refusing |
| `runview-matrix.RVM15` | COUNT(*) aggregate parity | On 5 representative entities: `COUNT(*)` aggregate equals count_only `TotalRowCount` despite `MaxRows: 2` | aggregates computed over the capped page instead of the full set |
| `runview-matrix.RVM16` | Numeric aggregates | `SUM`/`MIN`/`MAX`/`COUNT` over `Sequence` match an independent client-side computation; all four alias-addressable (`AVG` deliberately omitted — integer AVG semantics differ between SQL Server and PG) | aggregate expression/aliasing regression |
| `runview-matrix.RVM17` | RunViews batch | 3 heterogeneous params → 3 positional results, each matching its individually-run equivalent (row counts, shapes, count parity) | batch results cross-wired or reordered |
| `runview-matrix.RVM18` | PlatformSQL variants | `ExtraFilter`/`OrderBy` given as `{default, sqlserver, postgresql}` with a **poison-pill default** (0 rows / ASC): the platform variant must win on whichever platform runs | platform-variant resolution falling through to `default` (or not happening) |

### Known pinned gaps, loud-warn pins, and skips

- **B52 / B31 — AfterKey refusal message fidelity (loud warn, not a failure).** RVM14's `AfterKey`+`StartRow` leg: the server throws `AfterKeyNotSupportedError` naming StartRow (`GenericDatabaseProvider` ~line 1250), but over the client transport the message arrives empty. The **refusal invariant is asserted strictly**; the message-wording check downgrades to `console.warn` referencing the bug register. (The other two RVM14 legs' messages do survive the wire and are asserted strictly.) See bug register **B52** (message fidelity) and **B31** (the same wire-propagation gap as observed by `entity-writes` EW4).
- **B54 — RV23/RV24/RV25 deliberately not implemented.** Exclude-prior-run / `SaveViewResults` / `ForceAuditLog` checks are deferred because the `SaveViewResults` path (`SQLServerDataProvider.executeSQLForUserViewRunLogging`) appears broken for GUID view IDs (`Number(viewEntity.ID)` → NaN, unquoted GUID literals, invalid EXEC syntax) — a check would pin a broken path, and audit-log rows are not self-cleanable. Register disposition: **OPEN — decide: fix or retire**.
- **RVM11 is an effectively-permanent skip on standard deployments** (documented in-code as a KNOWN COVERAGE GAP): no stock entity carries a *binding* `UserViewMaxRows` (cap set AND total > cap), so the `IgnoreMaxRows`-override leg is not exercised read-only. The designed follow-up is a mutation-gated variant that temporarily sets and restores `UserViewMaxRows` on a fixture-safe entity.
- **Conditional loud skips** (each announces via `console.warn`, never silent): RVM5 (no suitable numeric-field entity), RVM9 seed leg (no LIKE-path searchable entity with a plain-text seed) and no-op leg (no non-empty zero-search-field entity), RVM12/RVM13 (no 12–2000-row single-PK walk target besides `MJ: Entity Fields`).
- **Deliberate coverage delegations** (stated in the file header): the RV14 composite-PK leg lives in `view-execution.V11`; RV17 (Aggregates + RLS) needs a second, RLS-scoped identity and lives with the `rls-isolation` bundles (the WHERE-clause leg is pinned by `view-execution.V13`); RV18–RV20 (`CacheLocal`/`BypassCache`/`CacheLocalTTL`) belong to the `client-cache` (C3–C5) and `server-cache` bundles.

---

## 2. Bundle `runview-features` (RVF1–RVF6) — cross-feature interactions and edges

**File:** `src/checks/runview-features.checks.ts` · **Catalog ancestor:** [test-catalog.md](./test-catalog.md) Domain 0b

### Machinery under test and why it matters

The seams the swept bundle cannot see: **two features combined** (projection × ordering, count_only × aggregates, MaxRows × aggregates), **boundaries past the end of the data** (StartRow overshoot, genuinely empty entities), and **hostile-looking but benign literal values** through `ExtraFilter`. These interactions are where independently-correct features produce jointly-wrong SQL.

### Transport

**Client-first** — same `GraphQLDataProvider`-over-the-wire posture as `runview-matrix`.

### Fixtures / lifecycle

**None — read-only by construction.** Discovered universe: `MJ: Entity Fields` rows of the first two `MJ: Entities` with `Sequence IS NOT NULL` (≥5 rows, ≥2 distinct Sequence values enforced at discovery), memoized. RVF5 additionally *discovers* an empty entity rather than creating one.

### Tier

All 6 deterministic.

### Per-check inventory

| ID | Short name | Asserted observable | Failure it catches |
|---|---|---|---|
| `runview-features.RVF1` | OrderBy on unprojected column | Projecting only `Name` while ordering by `Sequence DESC, ID ASC`: row count and **ID order identical** to a reference read that includes the sort column; sort column not leaked into the row shape | projection rewriting the SELECT in a way that changes or leaks the ORDER BY |
| `runview-features.RVF2` | count_only + Aggregates | Zero rows returned, but **both** `TotalRowCount` and the `COUNT(*)` aggregate populated and equal (ground truth: `GenericDatabaseProvider.InternalRunView` runs the aggregate query in parallel regardless of ResultType) | aggregates silently skipped on the count_only path |
| `runview-features.RVF3` | MaxRows + Aggregates | `MaxRows: 2` caps rows, but `SUM(Sequence)` and `COUNT(*)` equal an independent computation over the **full** matching set | aggregates computed over the capped page |
| `runview-features.RVF4` | StartRow past the end | Offset universe+100: empty page, no error, `TotalRowCount` still the full matching count | overshoot turning into an error or a corrupted count |
| `runview-features.RVF5` | Empty entity across ResultTypes | A discovered 0-row entity: clean empties for `simple` / `entity_object` / `count_only`, and `COUNT(*)` aggregate = 0 | empty-set branches erroring or fabricating rows |
| `runview-features.RVF6` | Literal binding safety | Escaped apostrophes (`O''Brien…`), unicode + emoji, and a 600-char literal are **accepted** (not injection-refused) and match 0 rows literally; a control literal matches exactly 1 | the injection guard over-blocking benign literals — or literals broadening the match |

### Known pinned gaps and skips

- **RVF5 loud skip** when every readable entity has at least one row (announced via `console.warn`).
- **Deliberate omission** (header-documented): "Fields projection matches the `|f:` client fingerprint slot" is pinned verbatim by `client-cache` C4/C5/C7 — duplicating it here would add no assertion power.
- No bug-register entries attach to this bundle directly; RVF6 is the deliberate complement of the RVM8/V3 injection probes (hostile SQL vs. hostile-looking *values*).

---

## 3. Bundle `runquery-catalog` (QC1–QC6) — run every shipped catalog query

**File:** `src/checks/runquery-catalog.checks.ts` · **Catalog ancestor:** [test-catalog.md](./test-catalog.md) Domain 0c

### Machinery under test and why it matters

`RunQuery` executes stored, approved catalog queries — the third data primitive after entity CRUD and RunView, and the one agents and dashboards lean on for pre-authored SQL. This bundle executes **every Approved query in the shipped catalog** through `new RunQuery().RunQuery(...)`, with the query list resolved **dynamically** from `QueryEngine.Instance.Queries` (never hardcoded names) so newly-seeded queries are auto-covered and queries absent in a deployment skip-as-pass loudly.

The classification is runtime-derived, comment-stripped (`StripSqlComments` mirrors the server RenderPipeline's Step 1.5), and splits the approved catalog (integration-test fixture queries excluded via `isIntegrationFixtureQuery`) into four disjoint sets:

- **bare** — zero params, `UsesTemplate=false` → QC1 (must succeed);
- **required** — ≥1 `IsRequired=true` param → QC2 (bare call must fail *clearly*);
- **strict** — ≥1 param, no raw-splice tokens → QC3 (metadata-derived params must succeed);
- **raw-splice** — ≥1 string/array/date param interpolated raw (identifier splicing like `[{{ SchemaName }}].[{{ BaseView }}]`, no filter pipe) → QC4 (fed **real** identifiers from a live `EntityInfo`; success OR clean SQL error, never an unhandled throw).

Raw NUMBER/BOOLEAN tokens are deliberately **not** splice-risky (the `QueryParameterProcessor` type-converts them before rendering), so those queries stay in the strict set. Parameter values derive from each query's own `MJ: Query Parameters` metadata (`Type` + `SampleValue`) via `DeriveSafeValue`, with identifier-role names (`SchemaName`/`BaseView`/`EntityID`/`CreatedAtField`/…) resolved against a deterministically-picked reference entity (`PickReferenceEntity`: non-virtual, API-visible, single-PK, physical base view, carrying the `__mj` timestamp pair, name-sorted → same entity every run). Zero-row results are a PASS — the contract under test is execution + shape, not data volume. The shared helpers (`LoadCatalog`, `DeriveAllParams`, `RunCatalogQuery`, `AssertSaneResultShape`, `SkipAsPass`, …) are exported and reused by `runquery-params`.

### Transport

**Client** — over the GraphQL wire (per IT33), exercising the query resolver's auth/validation path.

### Fixtures / lifecycle

**None — read-only, zero DB writes, deliberately no `RegisterLifecycle`.** Every check is a catalog-query execution (SELECT) plus result assertions. Fixture queries created by *other* bundles (`runquery-cache`'s `CacheTest` queries, anything under an "integration test" category path) are excluded from classification.

### Tier

All 6 deterministic.

### Per-check inventory

| ID | Short name | Asserted observable | Failure it catches |
|---|---|---|---|
| `runquery-catalog.QC1` | Bare-query sweep | Every no-param, non-templated query: `Success`, `RowCount === Results.length`, `TotalRowCount >= RowCount`, consistent per-row key shape (bounded scan, 500 rows) | a seeded query rotting (schema drift breaking its SQL) without anyone noticing |
| `runquery-catalog.QC2` | Required-param enforcement | Every required-param query invoked with **no** params: must fail with a non-empty, parameter-identifying message; never silently succeed, never carry rows on failure | the required-param gate developing a hole (silent execution with unset tokens) |
| `runquery-catalog.QC3` | Derived-param sweep | Every strict parameterized query with metadata-derived params: `Success` + sane shape (zero rows pass) | parameter processing/rendering breaking for any declared param shape in the shipped catalog |
| `runquery-catalog.QC4` | Raw-identifier queries | Every raw-splice query fed **real** schema objects: success (with sane shape) OR a clean, described SQL error — **never an unhandled throw**; clean failures are announced via `console.warn` | identifier-splicing queries crashing the pipeline instead of failing as data |
| `runquery-catalog.QC5` | AppliedParameters echo | On the first successful parameterized run: `AppliedParameters` present and echoing **every** supplied key | the applied-parameters audit surface silently dropping keys |
| `runquery-catalog.QC6` | Templated no-param queries | Composition-only templates (only `{{query:"…"}}` tokens) must fully succeed; templates with **residual** variable tokens but zero declared params → loud skip naming the RQ-C6 gap | template composition breaking; or the param-metadata gap silently widening |

### Known pinned gaps, loud-warn pins, and skips

- **B9 / RQ-C6 — query-parameter metadata round-trip gap (loud skip in QC6).** `metadata/queries/.mj-sync.json` declares `MJ: Query Parameters` as a pulled related entity but no param blocks are written to the query dotfiles; a query that references template variables while declaring no parameters is deployment data, not an engine defect, so QC6 `SkipAsPass`es loudly with the RQ-C6 label rather than failing. Register disposition: **DECIDE**.
- **B13 / B56 — broken seeded SampleValues (worked around, not pinned).** Some baseline `QueryParameter` seeds are non-executable (`agentIds` truncated to `'['`; `EntityID` samples carrying entity *names* where columns are UUIDs; ExternalChangeDetection samples referencing non-existent `vwCustomers`/`dbo` objects). `DeriveSafeValue` deliberately falls back past bad samples (unparseable array sample → a benign fixed UUID array; identifier-role params → values from a real `EntityInfo` per catalog RQ-C4), so the sweep tests the engine, not the seed hygiene. Both remain **OPEN** seed-cleanup items in the register.
- **B12 — `CategoryPath` misnomer (not pinned here).** This bundle uses `CategoryPath` only for labels and fixture exclusion. The register assigns the current flat-name-matching behavior pin to catalog check RQ-F1, which is **not yet shipped** in any bundle; the name-vs-path question remains a **DECIDE**. (The related cache-side category defects B45/B46 were fixed in the `runquery-cache` bundle's territory — Q11/Q12.)
- **Loud environment skips**: each QC check `SkipAsPass`es (with `console.warn`) when its classification set is empty in the deployment — e.g. no Approved queries seeded at all, or no raw-identifier queries.

---

## 4. Bundle `runquery-params` (QP1–QP10) — parameter permutation coverage

**File:** `src/checks/runquery-params.checks.ts` · **Catalog ancestor:** [test-catalog.md](./test-catalog.md) Domain 0d

### Machinery under test and why it matters

The parameter contract of `packages/QueryProcessor/src/queryParameterProcessor.ts` plus the Nunjucks render pipeline, read from source and pinned over the wire: `DefaultValue` is informational-only (template `{% if %}` / `| default()` blocks own default behavior, so `{}` and omitted `Parameters` are equivalent); type coercion for number/date/array with the **exact** clean error strings; the split unknown-parameter contract (templated queries reject, non-templated silently ignore); the `ValidationFilters` chain (first violation short-circuits with `failed validation filter '<name>'`; an unrecognized filter name is itself a violation); the Nunjucks 0-falsy truthiness trap; and the canonical injection payload `' OR 1=1 --` through a filter-piped string param. This is the layer that decides whether caller input can ever reach SQL un-neutralized.

Candidates are resolved dynamically from the shared `runquery-catalog` classification (cross-bundle helper import — the same pattern as the RLS bundles' `NOGRANT_EMAIL`): the **all-optional** set (every param `IsRequired=false`, no raw splice, templated — where `{}` is a legal complete call) plus per-type `(query, param)` candidates for number/date/array/string wherever they live in the catalog, all-optional queries sorted first.

### Transport

**Client** — over the GraphQL wire (per IT34).

### Fixtures / lifecycle

**None — read-only, zero DB writes, no `RegisterLifecycle`.**

### Tier

All 10 deterministic.

### Per-check inventory

| ID | Short name | Asserted observable | Failure it catches |
|---|---|---|---|
| `runquery-params.QP1` | `{}` == omitted | Every all-optional query succeeds with `Parameters: {}` AND with `Parameters` omitted, with identical `RowCount` | `DefaultValue` starting to inject server-side (contract: defaults live in the template) |
| `runquery-params.QP2` | Each param independently | Every optional param varied alone with a derived value: success, and filtered `RowCount <= ` the `{}` baseline (anti-vacuity: ≥1 case must run) | an optional *filter* widening the result set, or one param shape breaking the render |
| `runquery-params.QP3` | Full combo | All params supplied at once: success, sane shape, count ≤ baseline | clause-interaction breakage (AND-composition of all optional filters) |
| `runquery-params.QP4` | Number coercion | Numeric **string** accepted (coerced); `'abc'` rejected with a clean message matching `must be a number` | type-coercion loosening or the error surface degrading |
| `runquery-params.QP5` | Date coercion | Valid ISO accepted; `'zzz-not-a-date'` rejected with `must be a valid date` | date validation regression (see B57 caveat below) |
| `runquery-params.QP6` | Array coercion | JSON-**string** array accepted (parsed); scalar `42` rejected with `must be an array`; unparseable string rejected with `must be a valid JSON array` — two distinct clean errors | array-param parsing accepting garbage or collapsing the two error modes |
| `runquery-params.QP7` | 0-truthiness pin | Optional number param passed `0`: succeeds, and `RowCount` equals the `{}` baseline — the clause is skipped because Nunjucks treats 0 as falsy (**pinned documented trap**, B58) | either direction of drift: 0 starting to filter (behavior change) or 0 failing validation |
| `runquery-params.QP8` | Unknown-param contract, both legs | Leg A (templated, dependency-free): bogus param rejected with `Unknown parameter` naming the key. Leg B (non-templated): bogus param **silently ignored** — success, identical count, empty `AppliedParameters` | the reject leg developing a hole; or the ignore leg starting to reject (breaking existing callers) |
| `runquery-params.QP9` | Injection probe | `' OR 1=1 --` through every filter-piped string param: either cleanly rejected by validation, or executed as an **inert literal** matching exactly what an equally-nonsensical benign literal matches — never an unhandled throw, never a broadened set | the single highest-severity RunQuery failure: parameter values reaching SQL as syntax |
| `runquery-params.QP10` | ValidationFilters violation | For any catalog param declaring `ValidationFilters`: a chain-aware crafted violating value is rejected with `failed validation filter '<name>'` naming the first violatable filter | the enforcement chain (implemented alongside this family — see B10) regressing to a no-op on the catalog surface |

### Known pinned gaps, loud-warn pins, and skips

- **B55 — unknown-param check skipped for composition-dependent templated queries (deliberately excluded in QP8 leg A).** The render pipeline sets `skipUnknownParameterCheck` when a composition dependency uses templates, so caller typos are silently ignored on exactly those queries. QP8 excludes `HasDependencies` queries so the pin reflects the *intended* legs; the dependency-carve-out itself is **OPEN** in the register.
- **B57 — string-typed date params bypass date validation.** QP5 can only exercise params **declared** `Type='date'`; catalog params like `StartDate`/`EndDate` typed `string` flow junk through `sqlString` and silently match nothing. **OPEN — retype the params.**
- **B58 — the `{% if param %}` 0-truthiness trap is pinned, not fixed, by QP7.** An optional numeric 0 can never express a filter with the current template pattern. **OPEN — template pattern change (`is defined`).**
- **B10 — ValidationFilters enforcement.** Originally "parsed but never enforced"; the chain is now implemented (see QF9/QF10, which drive `QueryParameterProcessor.validateParameters` directly). QP10 is the catalog-surface leg and **loud-skips today** because no shipped catalog parameter declares `ValidationFilters` — it arms automatically the moment one does.
- **B56** — QP candidates inherit `DeriveSafeValue`'s resilience to the truncated `'['` array sample (see the `runquery-catalog` notes).
- **Loud environment skips** throughout: every check `SkipAsPass`es with a named reason when its candidate set is empty (no all-optional queries, no number/date/array-typed params, no filter-piped string params, no declared ValidationFilters).

---

## 5. Bundle `runquery-features` (QF1–QF10) — the RunQuery feature surface + injection gates

**File:** `src/checks/runquery-features.checks.ts` · **Catalog ancestor:** [test-catalog.md](./test-catalog.md) Domain 0e

### Machinery under test and why it matters

The RunQuery surface the sibling `runquery-cache` bundle does **not** exercise: the **ad-hoc SQL contract** (arbitrary SELECT with `QueryName` stamped `"Ad-Hoc Query"`, read-only enforcement via `SQLExpressionValidator`), **MaxRows/StartRow SQL paging** with the `TotalRowCount`/`PageNumber`/`PageSize` contract, and the **CacheKey/CacheHit** result fields — plus two guard checks that pin the two product defects fixed alongside this bundle: the `since | sqlDate` injection hole in `GetConversationsForMemoryManager` (B2) and the `ValidationFilters` enforcement chain (B10). Values verified against `ProviderBase.RunQuery` + `GenericDatabaseProvider` (`InternalRunQuery`/`ExecuteAdhocQuery`/`resolveQuery`/`ValidateQueryForExecution`).

### Transport

**Server, in-process — with a stated reason.** This bundle reads the FULL `RunQueryResult` (`CacheHit`/`CacheKey`/`PageNumber`/`PageSize`/`RenderedSQL`), which the GraphQL client's `TransformQueryPayload` deliberately does **not** carry over the wire. So, exactly like `runquery-cache`, the checks run against the bootstrapped server provider via plain `new RunQuery()` + `ctx.User`.

### Fixtures / lifecycle

**Self-cleaning `RegisterLifecycle('runquery-features', …)`.** Setup creates one throwaway `MJ: Query Categories` row and one Approved `MJ: Queries` row (`SELECT ID FROM <schema>.vwEntities ORDER BY ID` — hundreds of rows, single uniqueidentifier column, deterministic order) then refreshes `QueryEngine` so the fixture resolves; the module-scoped handle is published **before** the query save so a mid-Setup crash still leaves Teardown a reference (partial-safe). Teardown deletes query then category (FK-safe, best-effort). The bundle mutates the DB by design (creates + deletes its own fixtures), so the checks are **not** `RequiresMutation`-gated — they always run when the bundle is selected, matching the `runquery-cache` precedent. QF9/QF10 build transient, never-saved `MJ: Query Parameters` entities purely as typed argument objects.

### Tier

All 10 deterministic.

### Per-check inventory

| ID | Short name | Asserted observable | Failure it catches |
|---|---|---|---|
| `runquery-features.QF1` | Ad-hoc contract | 6-row literal-UNION SELECT: `Success`, `QueryName === 'Ad-Hoc Query'`, empty `QueryID`, `RowCount === TotalRowCount === 6` | ad-hoc execution or its result stamping breaking |
| `runquery-features.QF2` | Ad-hoc MaxRows | `MaxRows: 2` → `RowCount 2`, `TotalRowCount 6` (strictly larger — anti-vacuity) | the paged count contract collapsing to the capped count |
| `runquery-features.QF3` | Ad-hoc StartRow | Pages at offsets 0 and 2 are disjoint; `TotalRowCount` stays 6 | offset ignored (page 2 repeating page 1) |
| `runquery-features.QF4` | Ad-hoc is read-only | An ad-hoc `UPDATE` is rejected by SQL validation (`SQLExpressionValidator`, full_query context): `Success false`, 0 rows, non-empty error | the read-only gate opening — ad-hoc SQL reaching the write path |
| `runquery-features.QF5` | Saved-query paging | Fixture query with `MaxRows: 5, StartRow: 0`: `RowCount <= 5`, `TotalRowCount` strictly larger, `PageNumber 1`, `PageSize 5` | SQL-paging metadata (page number/size) regressing on the saved-query path |
| `runquery-features.QF6` | Page 2 disjoint | `StartRow: 5` → `PageNumber 2`, rows disjoint from page 1 (both pages non-empty) | StartRow ignored on saved queries |
| `runquery-features.QF7` | CacheLocal contract | First `CacheLocal` run is a miss; the second identical run: `CacheHit true`, `ExecutionTime 0`, non-empty `CacheKey`, same `RowCount` | the RunQuery TTL cache slot mechanics breaking (miss/hit stamping, zero-cost serve) |
| `runquery-features.QF8` | since/sqlDate injection guard | Mechanism leg: the registered `sqlDate` SQL filter **throws** on `"2020-01-01' OR '1'='1"` and emits a single quoted ISO literal for a valid date. E2e leg: running the real `GetConversationsForMemoryManager` with the malicious `since` yields `Success false` | regression of the B2 fix — the injection payload reaching rendered SQL |
| `runquery-features.QF9` | ValidationFilters enforce + pass | `QueryParameterProcessor.validateParameters` with a declared `min:3` on a string: `'ab'` rejected with an error naming `'min'` and explaining the violation; `'abcd'` passes (anti-vacuity) | the enforcement chain regressing to a no-op, or over-rejecting valid values |
| `runquery-features.QF10` | False-promise guard | An **unknown** declared filter name rejects any value with `unknown validation filter`; a known filter (`trim`) over the same value passes and actually transforms | the original B10 defect returning: a declared safety filter silently providing zero protection |

### Known pinned gaps, loud-warn pins, and skips

- **B2 — `GetConversationsForMemoryManager.since` injection hole: FIXED, QF8 is the regression guard.** The fix is `{{ since | sqlDate }}`; QF8 pins both the filter mechanism (so the e2e leg cannot pass for an unrelated reason) and the end-to-end containment. The e2e leg **loud-skips** (`console.warn`) if the query is not seeded in the environment.
- **B10 — ValidationFilters: implemented + pinned here.** QF9/QF10 drive the processor directly (unit-style checks running in the integration process against real entity metadata objects); the catalog-surface leg is `runquery-params.QP10` (loud-skip today). The unknown-filter false-promise guard (QF10) is the register's originally-demanded behavior.
- Fixture note: the paging fixture references a core `__mj` view by unquoted `schema.view` (the `runquery-cache` precedent) — platform-portable on SQL Server and PG.

---

## 6. Bundle `view-execution` (V1–V13, 9 checks) — the viewing system, deterministic tier

**File:** `src/checks/view-execution.checks.ts` · **Catalog ancestor:** [test-catalog.md](./test-catalog.md) Domain 11

### Machinery under test and why it matters

The viewing system is how MJ Explorer users actually read data: dynamic views (`{EntityName, ExtraFilter}`), saved-view FilterState compilation to WHERE clauses, projection, both pagination families, and aggregates. This bundle is the **deterministic tier** of Domain 11: filter marshalling, projection, pagination framing, and the server-side injection guard, driven from where they actually live — plus one deliberately client-side check (V2) exercising the pure-client FilterState→WhereClause compile in `MJUserViewEntityExtended.UpdateWhereClause()`.

### Transport

**Client-first.** Every data leg runs `RunView` through the `GraphQLDataProvider` over the real wire. The one exception is V2, which asserts a **pure client-side compile** (a never-saved `MJ: User Views` object) — it never touches the wire because there is nothing on the wire to touch.

### Fixtures / lifecycle

**None — read-only by construction; no `RegisterLifecycle`.** The universe is discovered from existing metadata: all `MJ: Entity Fields` rows belonging to the first **three** `MJ: Entities` by ID (≥10 rows enforced; must span exactly 3 parents), with a proper non-empty subset. V2's compile object is created via `NewRecord()` and never saved, so nothing can be orphaned. Set-equality proofs use a symmetric-difference report (`Missing`/`Extra` with bounded samples), and page size is computed so walks span roughly 4–5 pages.

### Tier

All 9 deterministic.

### Per-check inventory

| ID | Short name | Asserted observable | Failure it catches |
|---|---|---|---|
| `view-execution.V1` | Dynamic filter exactness | `{EntityName, ExtraFilter}` returns **exactly** the expected PK set (set equality, non-vacuous) | filter marshalling or WHERE composition returning a superset/subset |
| `view-execution.V2` | FilterState compile | Three FilterState shapes compile to the **exact** expected WHERE text: nested AND/OR groups parenthesized; numeric fields unquoted vs string fields quoted; `isnull`/`isnotnull` emit no operand | the saved-view filter compiler drifting — every saved view's WHERE silently changing |
| `view-execution.V3` | Injection guard, both halves | `;`+DROP, `UNION`, `--`, `/* */` all rejected; a benign clause AND forbidden words **inside a string literal** both accepted (the literal-stripping half of the validator) — exactly 4 rejections + 2 acceptances | guard regressions in either direction: injection passing, or the guard over-blocking legitimate literals |
| `view-execution.V4` | Projection + PK | `Fields: ['Sequence']` returns exactly {Sequence, PK} on every row — PK never dropped, nothing extra | projection contract breakage on the wire |
| `view-execution.V9` | OFFSET pagination walk | Union of `StartRow` pages over a stable `ORDER BY ID` == the full universe set; no duplicates, no gaps, ≥2 pages, bounded termination | OFFSET arithmetic bugs on the primary Explorer pagination path |
| `view-execution.V10` | Keyset walk | `AfterKey` seek walk returns every row exactly once; ends on a **short** page | seek-predicate bugs (boundary rows skipped/repeated) |
| `view-execution.V11` | Composite-PK keyset refusal | On a **discovered** readable composite-PK entity: `AfterKey` is refused (never silently degrades to OFFSET) with a cause-identifying message | silent degradation producing wrong pages on composite-PK entities |
| `view-execution.V12` | MaxRows / IgnoreMaxRows / UserViewMaxRows | `MaxRows: 3` honored; `IgnoreMaxRows` returns the exact full set; third leg: an entity carrying `UserViewMaxRows` caps an unbounded read at `min(cap, total)` | row-cap plumbing regressions at all three levels |
| `view-execution.V13` | Aggregates × pagination × WHERE | `COUNT(*)` under `MaxRows: 2` equals the full universe count (pagination-independent); narrowing the WHERE narrows the aggregate to the exact subset count (strictly smaller — anti-vacuity) | aggregates computed over the page, or ignoring the WHERE clause |

### Known pinned gaps, loud-warn pins, and skips

- **V11 always skips on a stock install** (bug-register coverage caveat, explicit): every core entity uses a single `ID` PK, so there is no readable composite-PK entity to probe and the `AfterKeyNotSupportedError(CompositePK)` branch is unreachable. The check logs an explicit SKIP rather than passing silently, but currently contributes **zero** real coverage — the register's stated options are promoting it to a mutation-tier check with a composite-PK fixture, or retiring it. (Note also that if it ever does fire, its message assertion intersects **B31/B52** — refusal messages arriving empty over the client transport.)
- **V14/V15 omitted, not stubbed** (header + bug-register caveat): RLS AND-combination and per-user view isolation are **two-identity** invariants; a `GraphQLDataProvider` is bound to exactly one authenticated identity (the system API key), so any single-identity version would be a check that cannot fail. The multi-user legs live with the server-side `rls-isolation` bundle (RLS8/RLS9/RLS10) and its `rls-isolation-client` companion.
- **V5–V8, V16, V17 are MUT-tier** (need saved-view mutation) and **V18 is LIVE-tier** (smart-filter regeneration needs a model) — deferred waves, stated in the file header.
- **B17 (PIN)** — a saved view's own compiled `WhereClause` bypasses `ValidateUserProvidedSQLClause` (only `ExtraFilter` is screened), by design for `CustomWhereClause=1` sysadmin views; noted in V3's rationale in the register.
- **B39 (FIXED)** — `ViewID`-only RunView failing to resolve its entity (contextUser not threaded; opaque `"Entity undefined not found"` error) was found in this domain's territory and fixed at the framework level (`runView.ts` `GetEntityNameFromRunViewParams`); verified live rather than pinned by a bundle check.
- **B19 (regression-guarded elsewhere)** — the `UserCanView` resource-type resolution fix is assigned to catalog V15/V16, which are in the deferred MUT wave.

---

## 7. Bundle `lists` (LS1–LS3) — Lists keyset pagination substrate

**File:** `src/checks/lists.checks.ts`

### Machinery under test and why it matters

`ListSource` (`@memberjunction/record-set-processor-base`) is the Lists-backed Source seam of the Record Set Processing substrate — the thing every "run this process over a saved List" flow iterates through. The v5.48 change moved it from `StartRow`/OFFSET paging to an **AfterKey keyset seek over `ListDetail.ID`**; these checks prove the new iteration and, critically, the **resume contract** (a persisted cursor surviving a process restart) plus **legacy-cursor conversion** (an old `{Offset}` cursor honored once, then converted to keyset). This bundle graduated verbatim from the retired `integration-test-scripts/lists-tests.ts` dispatcher (check bodies unchanged; fixture create/cleanup became a shared `BundleLifecycle`).

### Transport

**Server, in-process** (per IT20) — `ListSource` is a server-side substrate class with no client surface; checks drive it directly with `ctx.User`.

### Fixtures / lifecycle

**Self-cleaning `RegisterLifecycle('lists', …)`.** Setup references (never mutates) an existing `MJ: Entities` row to satisfy `MJ: Lists.EntityID`, creates one throwaway `MJ: Lists` row named with the `(mj-integration-test — safe to delete)` tag, publishes the fixture handle (`ctx.ListsFixture`) **as soon as the list exists** so a mid-loop crash still cleans up, then creates 25 `MJ: List Details` members (`lists-int-00` … `lists-int-24`). Teardown sweeps details by `ListID` (with `BypassCache: true` so it sees true DB state) and deletes the list. Constants: `MEMBER_COUNT = 25`, `BATCH_SIZE = 10`.

### Tier

All 3 deterministic (no model calls, self-cleaning writes; not `RequiresMutation`-gated — the bundle's writes are its own fixtures).

### Per-check inventory

| ID | Short name | Asserted observable | Failure it catches |
|---|---|---|---|
| `lists.LS1` | Full keyset iteration | Draining from scratch yields all 25 members exactly once, in exactly 3 pages (10/10/5); a runaway guard caps at 10 batches | seek predicate skipping/repeating members; cursor not advancing |
| `lists.LS2` | Resume from persisted cursor | First batch of 10, then a **fresh `ListSource` instance** resumed from the persisted keyset cursor: combined set is all 25 with no overlap or gaps | resume-after-restart breaking — the exact contract long-running Record Processes rely on |
| `lists.LS3` | Legacy Offset cursor | `{Offset: 20}` resumes correctly (5-row tail), the returned cursor **is keyset** (`NextCursor.Key` set), and the source reports exhausted | pre-v5.48 persisted cursors being dropped or mis-positioned after the upgrade |

### Known pinned gaps and skips

None — no bug-register entries attach to this bundle, no conditional skips. The header's reference to `integration-test-scripts/lists-tests.ts` is historical: the tsx dispatchers were removed in the July-2026 restructure (`mj test` is the single entry path; see `src/__tests__/sibling-parity.test.ts`).

---

## Bug-register cross-reference (this family)

| Bug | Status | Where it touches this family |
|---|---|---|
| [B2](../../../../plans/integration-test-expansion/bug-register.md) | FIXED | `since` injection hole — QF8 pins the `sqlDate` mechanism + e2e containment |
| B9 / RQ-C6 | DECIDE (open) | Query-param metadata round-trip gap — QC6 loud-skips residual-token templates |
| B10 | Implemented + pinned | ValidationFilters enforcement — QF9/QF10 pin it; QP10 is the catalog-surface leg (loud-skip until a catalog param declares filters) |
| B12 | DECIDE (open) | `CategoryPath` name-vs-path misnomer — assigned to catalog RQ-F1, **not yet shipped**; this family uses CategoryPath only for labels/fixture detection |
| B13 / B56 | OPEN (seed cleanup) | Non-executable seeded SampleValues — QC3/QC4 derive their own values (real-EntityInfo identifier roles, fallback past the truncated `'['` array sample) |
| B17 | PIN | Compiled `WhereClause` bypasses clause validation by design — noted in V3's rationale |
| B31 / B52 | OPEN | AfterKey refusal messages lost over the client wire — RVM14 asserts refusal strictly, warns on the lost StartRowConflict message; V11's message assertion is in the same exposure (currently moot — V11 always skips) |
| B39 | FIXED | ViewID-only RunView resolution (contextUser threading + descriptive error) — framework fix, verified live |
| B54 | OPEN (fix or retire) | `SaveViewResults` broken since GUID PKs — RVM's RV23/RV24/RV25 deliberately deferred rather than pinning a dead path |
| B55 | OPEN | Unknown-param check skipped for composition-dependent templated queries — QP8 leg A deliberately excludes `HasDependencies` |
| B57 | OPEN | String-typed date params bypass date validation — QP5 covers `Type='date'` params only |
| B58 | OPEN (pinned) | `{% if param %}` 0-truthiness trap — QP7 pins the current documented behavior |
| Coverage caveats | — | V11 always-skips on stock installs; V14/V15 omitted (two-identity, live with `rls-isolation`); RVM11 effectively-permanent skip (no binding `UserViewMaxRows` in standard deployments) |

## Shared engineering conventions in this family

- **Loud everything.** No silent skips anywhere: environment gaps use `SkipAsPass`/`console.warn` with a named reason; sweeps refuse vacuity (`Probed === 0` throws); anti-vacuity assertions guard every "expected zero" claim with a non-trivial precondition (non-empty entity, strictly-narrower subset, ≥1 tie group, page counts ≥2).
- **Discover, never create** (except the two lifecycle bundles). Universes are read from live metadata with memoization, so read-only bundles cannot orphan state and need no teardown.
- **Failure aggregation.** Sweep-style checks collect offenders and throw once with a count + bounded sample (8–10 shown), so one broken entity/query does not mask the other three hundred.
- **Cross-platform by construction.** `normId` for UUID casing, `PlatformSQL` poison-pill probes (RVM18), platform-portable fixture SQL (literal UNION ALL, unquoted `schema.view`), and deliberate omission of platform-divergent assertions (integer `AVG`).
- **Sibling parity.** Each bundle keeps exactly one metadata sibling — its `.IT##-*.json` record joined to the deterministic suite — enforced by `src/__tests__/sibling-parity.test.ts` (bundle ↔ IT record ↔ suite membership ↔ the `mj.config.cjs` `testing.checkModules` seam).

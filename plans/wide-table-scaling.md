# Wide-Table (Field-Density) Scaling — SQL Server

## Context

MemberJunction's "Large Schema Series" (PRs #3188–#3192) scaled the **table-count** axis (thousands of
entities). This roadmap covers the orthogonal **field-density** axis — few entities × many columns — which
stresses entirely different machinery and is largely unaddressed on SQL Server. Motivation is both **speed**
and **memory** (serving-MJAPI heap is a known chokehold, and generated Zod/TypeGraphQL/entity artifacts scale
with total field count).

Two facts frame the work:

- **PostgreSQL already mitigates wide CRUD sprocs** via a single-JSON-argument shape (`useJsonArgShape`,
  threshold 90 params). **SQL Server opts out** — `GenericDatabaseProvider.ProcedureParamLimit` returns
  `Infinity` — so a wide entity silently emits a CRUD procedure past SQL Server's hard **2,100-parameter**
  limit that fails to create. Each nullable column contributes a `_Clear` companion (~2 params/column), so
  the ceiling is reached around ~1,050 nullable columns (sooner for sparse-column tables, which can have up
  to 30,000 columns).
- The generated `entity_subclasses.ts` (one file, 118k+ lines) and `generated.ts` (GraphQL, 97k lines) plus
  per-entity Zod schemas are **boot-time heap** in MJAPI that scales with total field count.

## W1 — Correctness floor (this PR)

Ship first; small and safe.

- **W1a — model the limit.** `SQLDialect.MaxProcedureParams` (base `null`), SQL Server `2100`, PostgreSQL
  `100` (`FUNC_MAX_ARGS`). `packages/SQLDialect/src/*Dialect.ts`.
- **W1b — emit-time guard.** In `codeGenDatabaseProvider.generateCRUDParamString` (base + the PostgreSQL
  override), after building the parameter list, `assertProcedureParamLimit(paramCount, …)` **throws** when
  the count exceeds `Dialect.MaxProcedureParams` and **warns** above 85%. Only reached on the typed-parameter
  path (JSON-arg providers decide before building the list), so it never false-fires on auto-mitigated PG
  entities. Turns a late, cryptic "missing routine" failure into an immediate, diagnosed error *before any
  SQL is written*.
- **W1c — execution-time diagnosis (safe half).** In `SQLServerCodeGenProvider.executeSQLFileViaShell`, a
  failed `CREATE`/`CREATE OR ALTER` of a procedure/view/function/trigger now logs at **error** severity with
  the object name (benign batch failures — e.g. a `DROP` of a not-yet-existing object — stay warnings).
  **Control flow is unchanged** (batches run to the end; method still returns `true`) — flipping the return
  to `false` would abort `executeSQLFiles`' file loop and bypass the CRUD-validator self-heal the pipeline
  depends on. The return-value flip is deferred as its own change; W1b is the primary floor.

Deferred to a follow-up (W1d): width warnings during entity-field sync in `manage-metadata.ts` (row-size vs
8,060 bytes via `Dialect.EstimateInRowBytes`; column count near 1,024; baseview projected width near 4,096).

## W0 — Measurement (parallel with W1; gates all of W3)

Extend the existing scale-benchmark (`mj-bench` worktree, `scale-benchmark/`) to the field-density axis:

- `gen-schema.mjs`: add `--exact-width` (disable the ±40% jitter so exact widths don't randomly bust the
  1,024-column cap) and `--nullable-ratio` (drives the `_Clear` count / param projection).
- New `mjapi-boot-heap.sh`: boot MJAPI with `--heapsnapshot-signal=SIGUSR2` (zero code change), capture
  post-metadata-load and post-`buildSchemaSync` snapshots, and rank **retained** size by: TypeGraphQL
  `MetadataStorage`, the built `GraphQLSchema`, Zod schema objects + `.describe()` strings, the
  `EntityFieldInfo` graph, and the two generated monoliths.
- Matrix (constant total-field diagonals to separate the axes): `{500×50, 2000×50, 200×500, 50×1000}` plus a
  `50×1000 @ nullable 0.95` (param-projection worst case) and the `1379×25` baseline for continuity. **≥3
  replications per cell**, memory-capped SQL Server, confound log (per the benchmark-rigor standard).
- Also capture `buildSchemaSync` time vs width and save-path p50/p95 vs width (feeds W2 Stage 2).

Deliverable: a findings doc ranking W3 items by measured retained bytes. **No W3 item ships without it.**

## W2 — SQL Server JSON-arg shape (auto-mitigation + width lever)

Revisits the issue #2552 consensus ("SQL Server unchanged"). New evidence: the ~57-param margin on ordinary
1,024-column tables + the sparse-table cliff (W1) and the per-save O(width) EXEC-string cost.

- **Stage 1 (correctness):** flip SQL Server `ProcedureParamLimit` from `Infinity` to **~900–1000**. Nothing
  in MJ's current schema flips shape (widest core entities ~180 params); only pathological/sparse tables do.
  Makes W1b's throw unreachable — codegen auto-mitigates instead of failing.
- **Stage 2 (perf, HARD-gated on a benchmark):** consider lowering to **200–500** for merely-wide tables.
  Benefits (smaller sproc text/plan-cache, cheaper per-save build) are DB-side memory + save-latency wins, not
  MJAPI-heap wins, and are **unproven**. Gate on save p50/p95 + `sys.dm_exec_cached_plans` bytes at widths
  {50,200,500,1000} × {typed, JSON-arg} × {1-field, all-field} updates, replicated. Also a
  **breaking-change/consensus decision** (direct sproc callers).

Delta: define `SQLSERVER_PROCEDURE_PARAM_LIMIT`; override `SQLServerDataProvider.ProcedureParamLimit`; add the
`shouldUseJsonArgShape` branch + `generateCRUDCreate/UpdateJsonArg` (T-SQL `OPENJSON … WITH` typed shred +
key-presence `CASE`), mirroring the PG ~600-line implementation; new binding branch in
`SQLServerDataProvider.RenderSaveCallBinding`. **Version guard:** OPENJSON needs DB `COMPATIBILITY_LEVEL ≥ 130`
— add a codegen preflight that refuses JSON-arg emission (falls back to the W1b hard-fail) below 130.

## W3 — MJAPI heap chokehold (ranked by W0)

- **W3b — lazy Zod + describe-string extraction** (likely best memory-per-effort; near-zero runtime consumers
  of the generated Zod schemas). Emit a memoized factory instead of an eager `z.object`; move/drop the
  per-field `.describe()` mega-strings. Public-API rename → deprecation cycle.
- **W3e — width-aware cache policy.** `localCache.maxCachedRowFields` / `maxEstimatedRowBytes` /
  `excludeMaxTypeColumns` make wide entities cache-**ineligible** (safe degrade to DB reads) rather than
  partially cached. Also gates `PreRunView`'s widen-to-all-fields. Ship default-off; own latency benchmark.
- **W3a — split the monoliths** (per-schema/per-entity + barrel). DX/compile/incremental win; **does not
  reduce runtime heap alone** (everything still imports at boot) — but it's the prerequisite for W3c.
- **W3d — TypeGraphQL slimming.** Schema-on-demand is infeasible (`buildSchemaSync` needs every type).
  Viable: clear `MetadataStorage` after build (if nothing re-reads it — verify), drop duplicated per-field
  `description` strings, skip Create/Update inputs for read-only entities. Boot-**speed** lever may exceed the
  heap lever here.
- **W3c — lazy per-entity/per-schema class chunks** (biggest potential, most risk). Needs subpath-export
  chunks (W3a), a server-side lazy manifest (the Explorer `--lazy-config` machinery is the template), and
  switching `providerBase` entity instantiation to `CreateInstanceAsync`. Only if W0 shows residual heap after
  W3b/W3d.
- **W3f — dirty-only save binding** (exploratory, speed). Tolerant-SP semantics already permit omitting clean
  fields on UPDATE; cuts wide-entity save cost independent of W2. Own benchmark; concurrent-writer semantics
  change needs design review.

## W4 — Baseview / SELECT-list guard

Model `MaxSelectListItems = 4096` (SQL Server); warn at 3,500 / fail at 4,096 in `generateBaseView` with a
pruned-view suggestion. Cheap insurance; column-pruned baseviews deferred unless a real sparse-table user or
W0's 50×1000 runs force it.

## Sequencing & evidence gates

| Item | Ships | Own benchmark required? |
|---|---|---|
| W0 measurement | now (∥ W1) | *is* the evidence (≥3 reps/cell) |
| W1a/b/c | now (this PR) | no — correctness |
| W2 Stage 1 (~1000) | after W1; #2552 revisit documented | round-trip type matrix (correctness) |
| W3b lazy Zod | after W0 confirms Zod's heap share | yes — before/after heapsnapshot |
| W3e cache policy (default-off) | after W0 | yes — latency trade-off |
| W3a split | anytime (DX) | no (no heap claim) |
| W3d MetadataStorage / slimming | after W0 ranking | yes |
| W2 Stage 2 (200–500) | numbers + consensus | **hard gate** |
| W3c lazy chunks | only if residual heap after W3b/d | yes |
| W4 guard; W3f | opportunistic / exploratory | W3f: yes |

**Honest unknowns:** relative heap shares of TypeGraphQL vs Zod vs `EntityFieldInfo` (W0's purpose); whether
type-graphql tolerates `MetadataStorage` clearing; whether `generated.ts` entity imports are truly zero-use;
OPENJSON shred cost vs typed-arg parse cost by width; `buildSchemaSync` width-scaling exponent.

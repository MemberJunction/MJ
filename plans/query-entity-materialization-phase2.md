# Query Materialization — Phase 2: Parameterized RowFilterBroad Read-Time Injection

> **Status:** In progress on `claude/query-entity-materialization-phase2` (stacked on
> `claude/query-entity-materialization` / PR #3311). **#3311 merges first.** This branch raises a
> second PR that only makes sense on top of #3311's mechanism.
>
> **Hard gate:** this ships *only* if the differential safety proof (§6) passes. If faithful,
> injection-safe read-time reconstruction cannot be established, we revert the enablement flag and
> ship nothing — parameterized row-filter queries stay live-only (correct, just un-optimized), exactly
> as they are on `next` today.

## 1. What Phase 2 finishes

Phase 1 (shipped in #3311) built everything for parameterized **RowFilterBroad** materialization
*except the read-time predicate injection*, and gated it off (`allowRowFilterBroad=false`):

- The **classifier + verifier** (`materializationParamVerifier.ts`) already *prove*, by render-and-diff
  over the AST, that a parameter varies **only a literal at a clean top-level conjunctive `WHERE`
  `column <op> value` predicate on a single output column** (§10 asymmetric-risk). This is the exact
  precondition read-time injection needs — the verifier was purpose-built for it (see its own
  docstring, lines 30–35).
- **Broad-render** strips those predicates to produce `BroadSQL`; the refresher materializes the broad
  superset. `RowFilterColumns` + `BroadSQL` are persisted on `MJ: Materialized Results`.

The gap: **the persisted metadata is not sufficient to reconstruct the predicate at read time, and no
read path injects it.** Two concrete deficiencies:

1. **Operator is discarded.** `COMPARISON_OPS` accepts `=, !=, <>, <, >, <=, >=, IN, NOT IN, LIKE,
   IS, BETWEEN, …`, and the verifier classifies *all* of them as `RowFilter` — but only records
   `filterColumn`. `Score >= {{x}}` and `Score = {{x}}` are indistinguishable in what's persisted, so
   reconstructing from the column name alone would silently over/under-scope. **Operator capture is
   mandatory.**
2. **No transport / no read redirect.** Query params live on the `RunQuery` path; `RunQueryParams` has
   no materialization awareness and `RunViewParams` has no param channel. There is no code path where a
   param value reaches a materialized read.

## 2. The safety model (why this can be done without risk)

The entire design rests on one structural property:

> **Serving the live query is *always* correct.** Materialization is an optimization the caller opts
> into. Therefore any read-time uncertainty resolves to *serve live*, never *serve wrong*.

So the only way to return wrong rows is to build a read-time predicate that is **not faithful** to the
original. We eliminate that in three layers:

1. **Prove faithfulness at classify time** — we only mint a RowFilterBroad materialization when the
   verifier has *proven* the param is a clean top-level conjunctive `column <op> value` on a projected
   output column, AND the operator is in the safe whitelist (§3). Anything else → refuse → live-only.
2. **Bind, never interpolate** — read-time values are passed as real SQL bind parameters
   (`@p0…`/`$1…` via `ISQLExecutor.ExecuteSQL(sql, params)`), so no value is ever string-concatenated
   into SQL. SQL injection is structurally impossible; type/collation correctness comes from the
   materialized column being a physical copy of the source column (same type + collation, since the
   broad table is a `SELECT … INTO` / `CREATE TABLE AS` of the source projection).
3. **Fall back to live on any doubt** — stale / `DriftHold` / a param not in the spec / an operator not
   whitelisted / any resolution failure → serve the live query. Correct by construction.

Then **prove it empirically** (§6): a differential test asserts the materialized read equals the live
read row-for-row across a battery of operators and edge values. Only if that passes do we enable it.

## 3. Safe-operator whitelist (v1)

Read-time injection is enabled ONLY for operators whose `column <op> value` form is provably
reproducible against the broad table with a bound param:

| Operator | Kind | v1 |
|---|---|---|
| `=`, `!=`, `<>`, `<`, `>`, `<=`, `>=` | scalar | ✅ enabled |
| `IN`, `NOT IN` | list (all-literal bag → array param) | ✅ enabled |
| `LIKE`, `NOT LIKE` | scalar pattern | ⏸️ refuse → live (ESCAPE/pattern subtleties; revisit with proof) |
| `IS`, `IS NOT` | null test | ⏸️ refuse → live (value operand rarely a param; low value) |
| `BETWEEN`, `NOT BETWEEN` | two-operand | ⏸️ refuse → live (two literals; not modeled in v1) |

Refusing the deferred operators is harmless: those queries stay live-only, exactly as today. The
whitelist can widen later, each addition gated behind the same differential proof.

## 4. Metadata: the read-filter spec

At classify time we persist a structured, self-sufficient **read-filter spec** — the contract between
CodeGenLib (classify-time) and the runtime provider (read-time), which cannot share code
(`materializationSqlAst` is dev-time only). Per row-filter param:

```jsonc
// MJ: Materialized Results . ReadFilterSpec  (NVARCHAR(MAX), JSON; null unless ParamMode='RowFilterBroad')
[
  { "column": "ChapterID", "operator": "=",  "paramName": "chapterId", "kind": "scalar" },
  { "column": "Status",    "operator": "IN", "paramName": "statuses",  "kind": "list"   }
]
```

- `column` — the proven filter column (already in `RowFilterColumns`; repeated here for a self-contained
  spec). Injected as a quoted identifier, never from user input.
- `operator` — from the whitelist (§3). Emitted verbatim into the predicate; never user-derived.
- `paramName` — the `MJ: Query Parameter` name whose incoming value binds into this predicate.
- `kind` — `scalar` (single bind) vs `list` (expands to `IN (@p0,@p1,…)` bound element-wise).

`ReadFilterSpec` is a **new column** (migration + CodeGen) rather than overloading `RowFilterColumns`,
because the operator/kind/param-mapping are new information and a JSON column keeps the read path's
contract explicit and versionable.

## 5. Read path: opt-in `RunQuery` redirect

- **`RunQueryParams` gains `DataSource?: 'Live' | 'Materialized'`** (default `'Live'`), mirroring
  `RunViewParams`. Existing callers are unaffected — they keep getting live results.
- **`InternalRunQuery`**: when `DataSource === 'Materialized'` AND the resolved query has a fresh,
  `Active`, non-`DriftHold` `RowFilterBroad` materialization AND *every* incoming param is present in
  `ReadFilterSpec` with a whitelisted operator → execute:
  ```sql
  SELECT <output columns> FROM <schema>.<materialized table>
  WHERE <spec[0] predicate> AND <spec[1] predicate> AND …   -- bound params only
  ```
  Otherwise → fall back to the existing live execution path (log the reason).
- A small **dialect-aware predicate builder** turns one spec entry + its bound value(s) into
  `[Col] = @pN` (SQL Server) / `"Col" = $n` (PG), and `IN` into a bound list. Lives in the provider
  (runtime), consuming only the persisted spec.
- **Freshness/opt-in semantics**: the caller explicitly asked for the snapshot, so serving materialized
  is honoring the request; `DriftHold`/stale still fall back to live for safety.

GraphQL: `RunQuery` input type + `GraphQLDataProvider` client pass `DataSource` through (mechanical).

## 6. Differential safety proof (the hard gate — §Task 49)

Before flipping `allowRowFilterBroad` on for good, in the workbench DB:

For a battery of parameterized queries — scalar equality, `!=`, each range operator, `IN`/`NOT IN`,
a **string** filter (collation sensitivity), a **NULL** param value, a **multi-param** conjunction, and
a param whose value would be an injection attempt — assert:

```
rows( RunQuery(query, params, DataSource='Materialized') )  ==  rows( RunQuery(query, params, DataSource='Live') )
```

row-for-row (order-independent), for multiple param values each. Any mismatch = an unfaithful
reconstruction = **do not ship**: revert the gate flip, leave the classifier/verifier/spec plumbing in
place (harmless, gated off), and report the specific gap.

**Result — PASSED.** Two independent workbench runs, both green:
- **Reconstruction proof** (builder output vs. live, direct SQL): **13/13** faithful — collation-sensitive
  string equality, every range operator, the column-on-right operator flip (`100 < col` ⟺ `col > 100`),
  NULL/3-valued logic (`!=`, `NOT IN`), `IN`/`NOT IN`, multi-param conjunction, and a zero-row result;
  injection-attempt values only ever appear in the bound-parameter array, never the SQL string.
- **Provider-level E2E** (full `RunQuery` through a booted `SQLServerDataProvider`, real minted Query +
  `MaterializedResult`): **16/16** — `RunQuery(DataSource='Materialized') == direct-SQL oracle ==
  RunQuery(DataSource='Live')` for each param value; the materialized read verifiably fired (RenderedSQL
  targets the materialized view) while Live did not; and a caller omitting a spec parameter transparently
  fell back to the live query. This exercises the whole wiring: `MaterializedResult` load → `ReadFilterSpec`
  JSON parse → gating → bound-param injection → fallback. Re-run after the review fixes: **15/15** including a
  new dropped-view exec-error fallback case (materialized SQL throws → serves live, request still succeeds).
- **Write-path classify E2E** (real `classifyParameterizedQueryForMaterialization` through the live Nunjucks
  render → verifier → qualifier → broad-render → `ReadFilterSpec` build): **12/12** — a safe `=` query and a
  `>=` range query qualify with the correct spec (operator + kind + column captured through the real
  pipeline); a `LIKE` query and a mixed safe+`LIKE` query are refused (stay live-only). **This run caught a
  real latent bug**: the classify method ordered the `QueryParameter` load by a non-existent `Sequence`
  column (`QueryParameter` has no `Sequence`, unlike `QueryField`) — it would throw on *any* parameterized
  materialization. Fixed to `ORDER BY Name` (deterministic; the read-time predicate is order-independent).
- **PostgreSQL live differential** (builder `$n` output vs. live, real PostgreSQL): **10/10** faithful —
  case-sensitive string equality (PG semantics preserved on both sides), range ops, the column-on-right flip,
  `IN`/`NOT IN`, and multi-param `$n` numbering across the statement.

## 7. Scope / files

**CodeGenLib (classify + metadata):** `materializationSqlAst.ts` (safe-op set), `materializationParamVerifier.ts`
(capture op+kind), `materializationParamClassifier.ts` + `materializationAnalysis.ts` (thread through;
build spec; whitelist gate; flip enablement in `manage-metadata.ts`), a new migration + folded CodeGen for
`ReadFilterSpec`.

**Runtime (read path):** `RunQueryParams` (`@memberjunction/core`), `InternalRunQuery` +
predicate builder (`GenericDatabaseProvider`), GraphQL `RunQuery` input + `GraphQLDataProvider` client.

**Tests:** verifier op-capture units; qualify whitelist units; predicate-builder units (each op, IN,
injection, NULL); the §6 differential E2E.

## 8. Out of scope (unchanged from #3311's deferrals)

Bucket 2 per-value cache (§17.1) and AI-suggested promotion (§17.4) remain deferred — resolved team
decisions, not omissions. `LIKE`/`IS`/`BETWEEN` read-time injection is deferred within Phase 2 (§3).

## 9. Known limitations / residual risks (from the adversarial review)

These are **documented, bounded** limitations — none is a silent correctness risk in the common case, and
each errs toward the safe side (over-refuse or match live behavior). Recorded so authors and reviewers know
the exact edges.

- **Value-TRANSFORMING param filters (bounded correctness edge).** The read path binds the caller's *raw*
  parameter value; the live path renders it through the query template. For the standard value-preserving
  filters (`sqlString`, `sqlNumber`, direct binding — the overwhelmingly common case, proven faithful by
  §6's 13/13 + 16/16) the two are identical. But a **value-changing** filter on a row-filter parameter (e.g.
  `WHERE Status = {{ status | upper | sqlString }}`) makes the materialized read filter on the raw value
  while live filters on the transformed value → divergent rows. The classifier does not yet detect this.
  **Guidance:** do not mark such a query `IsMaterialized`. **Planned hardening:** a classify-time
  passthrough check (the rendered literal must equal the raw probe value; anything else → refuse → live-only,
  §10 bias). Deferred here to avoid a rushed change to the soundness-critical verifier.
- **Session-dependent query SQL (pre-existing Phase-1 property, not a Phase-2 regression).** A materialized
  broad table is a snapshot built once under the *refresh job's* identity. If a query's SQL embeds an implicit
  per-user/session predicate that is NOT a declared parameter (`SESSION_USER`, `CURRENT_USER`, a context
  function), the snapshot bakes the refresher's scope and every reader sees it — true for Phase 1's
  unparameterized materialization already. RunQuery deliberately does not apply per-entity RLS (trusted,
  admin-authored SQL), so the author must not materialize session-scoped queries. Phase 2 does not widen this.
- **Drift window on an operator/column edit.** The read-time coverage invariant catches a parameter-name
  change but not an operator/column change to a query whose materialization is still `Active` before the next
  CodeGen re-classify / `DriftHold`. Same staleness envelope as any materialized snapshot; bounded by drift
  detection (§11.4/§17.2 of the Phase-1 plan) and the forced-full-rebuild cadence.
- **PG output-column casing.** Output columns are quoted case-sensitively on PostgreSQL. A case mismatch
  between `QueryField.Name` and the materialized view column would error — which now **falls back to live**
  (§ read-path hardening: any materialized-read execution error → live), so it degrades to correct-but-slower
  rather than failing the request.

### Read-path hardening applied (from the review)
- **Execution-time fallback:** a materialized-read failure (view rebuilt/dropped mid-read, column/grant
  mismatch) is caught and **falls back to the live query** — a materialized failure never fails a request that
  would otherwise succeed. Connection errors still propagate.
- **Malformed-spec defense:** `buildMaterializedReadQuery` validates every spec element's shape and returns
  null (→ live) on anything malformed, never throwing mid-build.
- **Metadata parity:** the materialized branch reports `PageNumber`/`PageSize` consistently with the live path.
- **Plumbing completeness:** `DataSource` is threaded through every RunQuery path — singular + batch,
  cache-check, and SystemUser resolvers — so `'Materialized'` is never silently downgraded.

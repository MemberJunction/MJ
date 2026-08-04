# SQL AST Preprocessing — Implementation Plan

## Goal

Increase the share of MJ SQL that flows through `SQLParser`'s AST-injection path (vs. the OFFSET/FETCH fallback or outer-wrap path). The AST path is the most structurally precise — it has full visibility into outer vs. inner constructs, can replace existing caps cleanly, and round-trips through `sqlify` without surprise. The fallback paths are correct but produce uglier SQL and lose precision for some shapes.

The strategy is **pre-parse transformation + post-sqlify restoration**: rewrite the input SQL into a form `node-sql-parser` can handle, do AST work, then reverse the rewrites on the output. To consumers of `SQLParser.ParseWithPreprocessing`, the transformation is invisible.

Three preprocessing transforms, ranked by impact:

| Phase | Transform | Impact | Complexity |
|---|---|---|---|
| **1** | Bracket-quoted identifier aliasing | High — fixes every Skip CTE with spaces/hyphens in the name | Medium |
| **2** | Trailing `OPTION (...)` splitting | Medium — enables capping queries with query hints | Low |
| **3** | Inline table hint stripping (`WITH (NOLOCK)`, etc.) | Low — rarely emitted by agents | High |

Phases ship as separate PRs. Phase 1 lands the public API (`ParseWithPreprocessing`) and the helper pattern; phases 2 and 3 extend the same pipeline.

---

## API design

A new `SQLParser` public method:

```typescript
/**
 * Like ParseSQL but applies preprocessing to make a wider class of SQL
 * parseable: aliases bracket-quoted identifiers with characters that defeat
 * the parser, strips trailing OPTION clauses, etc. Returns the AST plus a
 * `restore` function that reverses the transformations on a sqlify result.
 *
 * Use when you intend to read/mutate the AST and emit modified SQL back.
 * For pure inspection (no sqlify), use ParseSQL directly to see original
 * identifier names.
 */
static ParseWithPreprocessing(
    sql: string,
    dialect: SQLParserDialect,
): {
    ast: NodeSqlParser.AST | NodeSqlParser.AST[];
    restore: (sqlOut: string) => string;
} | null
```

Returns `null` when even the preprocessed SQL is unparseable — caller then falls back to existing OFFSET/FETCH / outer-wrap paths.

**Caller pattern:**

```typescript
const result = SQLParser.ParseWithPreprocessing(sql, dialect);
if (!result) return null;
const { ast, restore } = result;

// any AST work using the typed primitives
if (SQLParser.GetOuterCap(ast)?.kind === 'top' /* ... */) { /* ... */ }
SQLParser.SetOuterCap(ast, cap, dialect);

return restore(SQLParser.SqlifyAST(ast, dialect));
```

`ParseSQL` and `SqlifyAST` keep their current contracts. `ParseWithPreprocessing` is additive — no consumer breaks.

**Composition:** each preprocessing transform contributes a `(sqlOut) => sqlOut'` function. `restore` is the right-to-left composition of those — transforms applied during preprocessing are reversed in reverse order:

```typescript
// preprocess: T1 then T2
// restore: undo T2, then undo T1
```

This matters when transforms interact (e.g. an aliased identifier inside an OPTION clause).

---

## Phase 1 — Bracket-quoted identifier aliasing

### What it solves

`node-sql-parser` parses `[ActivePeople]` but fails on `[Active People]`, `[my-cte]`, `[dbo.table]`, etc. — any bracket-quoted identifier containing a space, hyphen, or dot. Skip uses these constantly for human-readable CTE names. Today these queries fall into the OFFSET/FETCH fallback path.

### Approach

A two-pass scan:

1. **Scan pass** (`scanForProblematicBracketIdentifiers`) — walk the SQL character-by-character, skip content inside string literals and comments, collect bracket-quoted identifiers whose interior contains a problematic character. Build a `Map<originalName, alias>` where aliases are randomly suffixed safe identifiers (`_mjid_<8-char-hex>_<index>`).

2. **Rewrite pass** (`rewriteBracketIdentifiers`) — second token-aware walk that emits the SQL with each problematic `[name]` replaced by `[alias]`. Same scanning state machine as pass 1, so we know we're substituting only in identifier position.

3. **Restore** — given a sqlify result that contains the aliases, do a literal `String.replaceAll` on each `[alias]` → `[originalName]`. Aliases are designed so no collision is possible.

Both passes share the bracket/string/comment skipping logic with `StripComments` — same state machine, refactored into a single shared scanner if it makes the code clearer.

### Code changes

| File | Change | LOC estimate |
|---|---|---|
| `packages/SQLParser/src/sql-parser.ts` | Private helpers `scanForProblematicBracketIdentifiers`, `rewriteBracketIdentifiers`, `restoreBracketIdentifiers`; public `ParseWithPreprocessing` method | ~120 |
| `packages/SQLParser/src/index.ts` | No change (no new public types) | 0 |
| `packages/SQLParser/src/__tests__/sql-parser.preprocessing.test.ts` | New test file with ~25 tests | ~250 |
| `packages/GenericDatabaseProvider/src/queryPagingEngine.ts` | Replace `ParseSQL` + `SqlifyAST` with `ParseWithPreprocessing` + `restore(SqlifyAST(...))` in `applyMaxRowsViaAST` | ~10 |

### Implementation steps

1. Define what counts as "problematic": interior contains any of `' '`, `\t`, `-`, `.` (or matches `/[^A-Za-z0-9_]/`). Pick the predicate conservatively — better to alias too often than miss a parser-defeating shape.
2. Write `scanForProblematicBracketIdentifiers(sql)` — returns `Map<original, alias>`. Generate aliases as `_mjid_<random6hex>_<seq>` (collision probability is negligible).
3. Write `rewriteBracketIdentifiers(sql, aliasMap)` — token-aware walk emitting the rewritten SQL. Inside bracket scope, look up the interior in the map and emit the aliased form.
4. Write `restoreBracketIdentifiers(sql, aliasMap)` — straightforward iteration applying `split('[alias]').join('[original]')`.
5. Write `ParseWithPreprocessing(sql, dialect)`:
   - If no problematic identifiers, fast-path: behave as `ParseSQL` with `restore = identity`.
   - Otherwise: alias, parse, on success return `{ ast, restore }` closing over the alias map; on parse failure return `null`.
6. Refactor `queryPagingEngine.applyMaxRowsViaAST` to call `ParseWithPreprocessing`. Two-line change at the top, one-line change at each `SqlifyAST` call site.

### Tests (Phase 1)

**Identification correctness:**
- `[my-cte]` is identified as problematic.
- `[Active People]` is identified as problematic.
- `[ActivePeople]` is NOT problematic (no preprocessing needed — fast path).
- `[col_with_underscore]` is NOT problematic.
- `[]` (empty) is NOT problematic.

**Token-awareness:**
- A bracket inside a string literal (`'has [my-cte] in text'`) is NOT aliased.
- A bracket inside a line comment is NOT aliased (handled by the comment-aware scan).
- A bracket inside a block comment is NOT aliased.
- `]]`-escaped close brackets handled correctly (`[weird]]name]`).

**End-to-end (via `ParseWithPreprocessing` + `SqlifyAST` + `restore`):**
- `WITH [my-cte] AS (SELECT 1 AS a) SELECT * FROM [my-cte]` round-trips with original names.
- `WITH [Active People] AS (...) SELECT * FROM [Active People]` round-trips and gets AST-cap injection (asserts `TOP N` appears in result, not `FETCH NEXT`).
- Multiple problematic CTEs in one query — all aliased, all restored.
- Same identifier referenced multiple times — aliased once, restored everywhere.

**Negative:**
- SQL that's unparseable for reasons unrelated to brackets (e.g. `WITH TIES`) still returns `null` from `ParseWithPreprocessing`.
- Truly malformed SQL returns `null`.

**Integration:**
- `queryPagingEngine.WrapWithMaxRows` on a Skip-shaped CTE query (`WITH [Active People] AS ... SELECT * FROM ...` with MaxRows: 100) now emits `TOP 100` via AST inject, not `FETCH NEXT 100`.
- The bulletproofing test corpus in `renderPipeline.test.ts` continues to pass — invariant unchanged, but the FETCH-NEXT vs TOP balance shifts.

### Risks

- **Alias collisions with existing identifiers.** Mitigated by random suffix. Collision probability with a 6-hex-digit suffix is ~1 in 16M per identifier; with sequential index also baked in, effectively zero.
- **Replacement inside string literals.** Mitigated by token-aware scan in the rewrite pass (same state machine as `StripComments`).
- **AST consumers expecting original names.** Documented: `ParseSQL` is the read-only path; `ParseWithPreprocessing` is for mutate-and-emit. Tests assert this contract.
- **Performance on large SQL.** Both scans are O(n); 100KB of SQL is well under a millisecond.
- **`sqlify` quirks emitting unexpected quoting.** `node-sql-parser` emits bracket-quoted identifiers as backticks in some configurations; the `SqlifyAST` wrapper already handles bracket vs. backtick normalization. If `sqlify` emits `` `_mjid_0` `` instead of `[_mjid_0]`, the restore step must handle both forms.

---

## Phase 2 — Trailing `OPTION (...)` splitting

### What it solves

`SELECT … OPTION (RECOMPILE)` and friends are currently in the "leave alone" set (`SQLParser.HasUnwrappableTrailingClause`). The cap is never enforced on these queries — agent-emitted OPTION queries can return unbounded rows. Preprocessing makes them AST-injectable.

### Approach

`OPTION` is always at the outermost level (it's a query-level hint, not a clause modifier). So we can:

1. **Detect & split** (`splitTrailingOptionClause`) — token-aware scan that finds `OPTION` followed by a balanced parenthesis group at the end of the statement. Returns `{ sqlWithoutOption, optionClause }`.
2. **Parse the prefix** through normal `ParseSQL`.
3. **Restore** by appending the original `optionClause` (including any preceding whitespace) to the sqlify result.

### Code changes

| File | Change | LOC estimate |
|---|---|---|
| `packages/SQLParser/src/sql-parser.ts` | Private `splitTrailingOptionClause` helper; compose into `ParseWithPreprocessing`'s restore chain | ~60 |
| `packages/SQLParser/src/sql-parser.ts` | `HasUnwrappableTrailingClause` removes the `OPTION` check (since OPTION queries are now wrap-safe via preprocessing) | ~5 LOC removed |
| Preprocessing test file | New tests | ~10 tests |
| `packages/GenericDatabaseProvider/src/__tests__/renderPipeline.test.ts` | Update OPTION tests to assert cap is now enforced | ~3 tests modified |

### Implementation steps

1. Token-aware scan looking for word-boundary `OPTION` outside strings/identifiers/comments. Multiple occurrences: only the last is the real OPTION clause (others would be invalid SQL).
2. After `OPTION`, skip whitespace, expect `(`. Match balanced parens to find the close. Anything after `)` (other than whitespace/semicolon) means it's not a trailing OPTION — leave alone.
3. Compose into `ParseWithPreprocessing`: apply identifier aliasing FIRST, then OPTION splitting. Restore applies in reverse: re-append OPTION first, then restore identifier names. (Either order works for these two transforms since they don't interact, but explicit reverse-order makes the contract clear.)
4. Remove `OPTION` from the unwrappable-clause detector — OPTION queries now go through the AST inject path.
5. Update tests that asserted OPTION queries were left unchanged.

### Tests (Phase 2)

- `SELECT * FROM t OPTION (RECOMPILE)` parses and gets `TOP N` via AST inject. Final SQL contains both the cap and the original `OPTION (RECOMPILE)`.
- `OPTION (MAXDOP 1)`, `OPTION (HASH JOIN)`, `OPTION (HASH JOIN, MAXDOP 1)` — all handled.
- `OPTION` inside a string literal (`WHERE x = 'add OPTION (...)'`) is NOT split.
- `OPTION` as an identifier name (`SELECT [OPTION] FROM t`) is NOT split.
- Existing renderPipeline tests for OPTION updated to assert cap enforcement instead of pass-through.

### Risks

- **OPTION combined with `TOP PERCENT` / non-numeric `TOP`.** Falls through to the existing `wrap` outcome, where outer-wrap previously would have corrupted the OPTION. Need to verify: does the wrap path also benefit from preprocessing? Yes — outer-wrap of the OPTION-stripped SQL is valid, then restore re-appends OPTION at the outermost level. This actually works cleanly.
- **OPTION with table hints (Phase 3 territory).** Don't worry until Phase 3 lands.

---

## Phase 3 — Inline table hint stripping

### What it solves

`FROM t WITH (NOLOCK)`, `INNER JOIN t WITH (HOLDLOCK) ON ...` — SQL Server inline table hints that some versions of `node-sql-parser` don't recognize. Skip rarely emits these, but humans editing saved queries might.

### Approach

Harder than phases 1 and 2 because hints attach to specific table references, not the statement as a whole. Two options:

**Option A — strip and re-attach by position:**
1. Scan for `WITH (...)` immediately following a table reference (token-aware).
2. Record each hint as `{ tableIdentifier, hintText }`.
3. Strip all hints, parse, mutate, sqlify.
4. On restore, find each `tableIdentifier` in the output and re-attach its hint.

This is fragile if `sqlify` aliases or reorders tables.

**Option B — strip and re-attach by marker:**
1. Replace each `WITH (...)` with a comment marker: `/*MJ_HINT_0*/`.
2. The comment survives the parse/sqlify round-trip (if the parser preserves comments, which `node-sql-parser` doesn't reliably do).

Option B is cleaner if it works. Needs prototype validation against `node-sql-parser`'s comment-preservation behavior.

**Option C — accept the limitation:**
3. Skip Phase 3 entirely. Most agents don't emit table hints, and humans editing saved queries can be told to use the `WITH (...)` syntax sparingly or wrap the query in a CTE.

### Code changes

Skipped pending decision between A / B / C above. Estimated 100–150 LOC if Option A is chosen; 50–80 LOC if Option B works.

### Implementation steps (Option A sketch)

1. Token-aware scan finds `<identifier> WITH (` patterns.
2. For each, extract the bracketed hint content.
3. Strip from the SQL; record `{ position, identifier, hintText }`.
4. Parse the stripped SQL.
5. Mutate, sqlify.
6. On restore: for each recorded hint, find the identifier in the output and append the `WITH (...)` clause. Disambiguate when the same identifier appears multiple times by aliasing it to a unique name first (reusing Phase 1's machinery).

### Tests (Phase 3)

- `SELECT * FROM t WITH (NOLOCK)` parses, caps, restores hint.
- Multiple tables with different hints.
- `INNER JOIN t WITH (HOLDLOCK) ON ...`.
- Hint on a CTE reference (not allowed, but the preprocessor shouldn't crash).

### Risks

- **Position tracking after AST round-trip is unreliable.** Tables can be aliased, reordered, or reformatted. Mitigation: aliasing approach from Phase 1.
- **Hints in unusual positions** (immediately after subquery aliases, table-valued function calls). Probably rare enough to not handle.
- **`node-sql-parser` comment preservation** is inconsistent — Option B may not work as a marker scheme.

---

## Sequencing & deliverables

### Phase 1 PR
- **Title:** `refactor(sql-parser): alias problematic bracket identifiers to widen AST coverage`
- **Scope:** identifier aliasing only, new `ParseWithPreprocessing` API, queryPagingEngine integration, ~25 tests
- **Acceptance:** all existing tests pass; new tests pass; Skip-shaped CTE queries now show `TOP N` via AST inject in their final SQL
- **Risk:** Low — preprocessing is opt-in (`ParseWithPreprocessing` is a new method), no behavioral change for `ParseSQL` consumers

### Phase 2 PR
- **Title:** `feat(sql-parser): split trailing OPTION clauses into the AST pipeline`
- **Scope:** OPTION splitting composed into `ParseWithPreprocessing`, `HasUnwrappableTrailingClause` no longer reports OPTION, renderPipeline tests updated
- **Acceptance:** OPTION queries now get capped (asserts changed from "leave alone" to "TOP N injected and OPTION preserved")
- **Risk:** Low–Medium — behavioral change for OPTION queries, but a strict safety improvement

### Phase 3 PR (optional)
- **Title:** `feat(sql-parser): strip and restore inline table hints`
- **Scope:** Table hint preprocessing, decided after Option A/B/C analysis
- **Acceptance:** common `WITH (NOLOCK)` patterns parse and round-trip
- **Risk:** High — depends on `node-sql-parser` quirks; may discover further limitations during prototyping

---

## Test strategy

### Unit (per phase, in `sql-parser.preprocessing.test.ts`)

- Token-aware scanner identifies the right targets.
- Aliasing and restoration form a round-trip identity for any input.
- String literals, comments, and quoted identifiers are not touched.
- Edge cases per phase (empty input, `]]` escapes, nested parens in OPTION, etc.).

### Integration (in `queryPagingEngine.test.ts` / `renderPipeline.test.ts`)

- Skip-shaped CTE queries that previously hit OFFSET/FETCH now hit AST inject and emit `TOP N`.
- OPTION queries now show cap enforcement.
- The bulletproof invariant suite (`assertCapEnforcedOrSafelyUntouched`) continues to pass — same safety property, more shapes reach the AST path.

### Adversarial (across both test files)

- `[SELECT]`, `[FROM]`, `[OPTION]`, `[FOR JSON]` as column names — never aliased, never split.
- String literals containing every keyword and every bracket form — never affected by preprocessing.
- Multiple transforms applied to the same SQL (a CTE with hyphenated name plus a trailing OPTION) — both transforms apply, restoration reverses both correctly.

---

## Open questions

1. **Should `ParseSQL` opt into preprocessing by default?**
   *Recommendation:* No. Keeps the contract clear. `ParseSQL` returns the AST as parsed; `ParseWithPreprocessing` returns the AST plus a restore hook. Consumers walking the AST for inspection-only purposes (composition engine, structural parser, MJ extension analysis) keep their current behavior. Mutation-and-emit consumers (the row-cap path) opt in.

2. **Does the count-SQL generator (`buildCountSQLViaAST`) benefit from preprocessing?**
   *Recommendation:* Yes. Same shape — Skip-style CTEs currently fall to the regex fallback. Migrate `buildCountSQLViaAST` to use `ParseWithPreprocessing` in the same PR as Phase 1.

3. **Should we extend the unwrappable-clause detector to be preprocessing-aware?**
   *Recommendation:* No. The detector is for shapes that can't be wrapped *at all*. Once preprocessing handles a shape, it's no longer unwrappable. Phase 2 already removes OPTION from the detector for this reason.

4. **Backward compatibility for `node-sql-parser` consumers outside MJ?**
   *Not applicable.* `sql-parser` is internal to MJ; no external consumers depend on the AST returned by `ParseSQL`.

---

## Acceptance criteria for the full plan

- All MJ test suites pass (~1300+ tests across sql-parser, generic-database-provider, server, core-actions).
- Skip's representative query corpus (the bulletproofing suite in `renderPipeline.test.ts`) shows AST-inject SQL for Phase 1 targets (bracket-quoted CTE names) and Phase 2 targets (OPTION queries).
- No regression in existing AST-inject cases.
- No new `as unknown as Record<string, unknown>` casts in any consumer — all AST manipulation continues to flow through the typed primitives.

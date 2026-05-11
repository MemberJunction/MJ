# Plan: Bubble SP-Call SQL Builder Up to the Generic Database Provider

## Status

Draft (rev 2) — proposed follow-up to the `IsSPParameter` consolidation
that fixed the "Procedure or function spCreateArtifactVersion has too many
arguments specified" regression. The runtime/CodeGen filter symmetry that
bug exposed is now correct, but the **broader duplication** between
`SQLServerDataProvider` and `PostgreSQLDataProvider` that allowed the
asymmetry to exist in the first place is still on the table.

**Changes in rev 2** (for reviewers comparing against the original):
- `SKIP_FIELD` sentinel replaced with a tagged-union `CoerceResult` —
  same semantic, no global magic value to leak through `===` checks.
- `RenderedSPParams` is now a real generic parameter `TRendered`, not
  "opaque" — preserves the round-trip type-safety the original draft
  gave up.
- New **Scar tissue** section enumerating recent fixes (PG 100-arg
  limit, JSON-arg shape, savepoint wraps, `IsComputed`, bool→int) that
  the new code must explicitly preserve.
- JSON-arg shape for wide PG entities (commit `5ff75b96ae`) called out
  as Risks §8 — this is a second `RenderSPParams` mode on PG, not a
  minor variant.
- Sequencing rewritten: ship as **one PR**, gated by a
  **save-SQL snapshot harness** that lands first. Drops the 5-phase
  split (phasing didn't reduce blast radius; the harness does).
  Cross-dialect SP-signature parity is **not** in the harness — that
  layer is already covered by the existing `pg-migrate` CI workflow
  (`generateParityReport` + `pg-migrations.yml`). This harness is
  per-dialect before/after equivalence for the rewrite only.
- Acceptance criteria expanded from 5 bullets to a breadth-explicit
  integration-test checklist + a microbenchmark gate.

## Background — how we got here

For each entity, the `spCreate` / `spUpdate` parameter list is decided in two
independent places:

| Where | What it produces |
|---|---|
| **CodeGen** (`codeGenDatabaseProvider.shouldIncludeFieldInParams`) | The SP body — `CREATE PROCEDURE` declared parameters + the columns referenced in `INSERT` / `UPDATE` |
| **Runtime** (`SQLServerDataProvider.generateSPParams`, `PostgreSQLDataProvider.getWritableFields`) | The argument list passed to `EXEC` / `SELECT FROM function()` at save time |

These two need to agree. If they don't, SQL Server raises **"Procedure or
function has too many arguments specified"** (or its PG equivalent) when a
client tries to save.

Originally the two paths used different filter rules:

- **CodeGen** filtered on `IsVirtual` (always excluded), `IsSpecialDateField`,
  `IsPrimaryKey + AutoIncrement`, and `AllowUpdateAPI`.
- **SQL Server runtime** filtered on `AllowUpdateAPI` and `SkipValidation`.
  `SkipValidation` happens to include `IsVirtual` in its checks, so virtual
  fields were excluded **indirectly**. The contract was not stated locally.
- **Postgres runtime** had its own filter list (`getWritableFields`).

This worked **only as long as metadata flags stayed self-consistent**. The
moment any agent (CodeGen sync SP, metadata import, a manual fix-up script,
a stale local cache) produced an `EntityField` row where `IsVirtual=1` but
`AllowUpdateAPI=1`, the SQL Server runtime included the field while the SP
body didn't declare it → too many arguments.

### The consolidation that just landed

A new predicate `EntityFieldInfo.IsSPParameter(isUpdate: boolean)` is now the
single source of truth. CodeGen, SQL Server runtime, and PostgreSQL runtime
all delegate to it. Symmetry is now enforced at the predicate level.

```ts
public IsSPParameter(isUpdate: boolean): boolean {
    if (this.IsVirtual) return false;
    if (this.IsComputed) return false;
    if (this.IsSpecialDateField) return false;
    if (this.IsPrimaryKey) return isUpdate || !this.AutoIncrement;
    return this.AllowUpdateAPI;
}
```

This fixes the immediate class of bug. **But** the larger duplication remains:
the SQL string template that calls the SP, the variable declaration / SET
pattern, the EXEC argument list assembly, the wrapper for record-change
tracking, the result-table boilerplate — all of it is hand-rolled twice (once
per dialect provider). This plan addresses **that**.

## Goal

Move the SP-save SQL composition into the generic provider layer
(`GenericDatabaseProvider` / `DatabaseProviderBase`), with dialect-specific
behavior expressed as a small set of abstract hook methods. The two existing
hand-rolled implementations collapse to ~80 lines of dialect-specific code
each instead of ~250.

## Current shape (post-`IsSPParameter`)

```
GenericDatabaseProvider / DatabaseProviderBase
├── Save() — high-level orchestration (validation, hooks, encryption, record-change, transaction)
├── EncryptFieldValuesForSave() — shared
├── BuildRecordChangePayload() — shared (dialect-agnostic diff + restore lineage)
└── BuildRecordChangeSQL() — abstract (dialect renders the actual INSERT/EXEC)

SQLServerDataProvider                          PostgreSQLDataProvider
├── GenerateSaveSQL() — override               ├── GenerateSaveSQL() — override
├── GetSaveSQLWithDetails() — hand-rolled      ├── (parallel impl, hand-rolled)
├── generateSPParams() — ~250 lines            ├── getWritableFields() + parallel
│   ├── per-field iteration                    │       SQL-template glue
│   ├── value coercion (datetimeoffset, GUID)  │   ├── per-field iteration
│   ├── DECLARE / SET / EXEC fragments         │   ├── value coercion (gen_random_uuid, etc.)
│   └── _Clear companion handling              │   ├── $1, $2 positional binding
├── generateSetStatementValue()                │   └── CALL / SELECT FROM function()
└── getAllEntityColumnsSQL() — for result table
```

The duplicated parts are the **iteration**, the **value coercion**, and the
**SQL-text assembly**. The dialect-specific parts are the binding syntax,
the result-shape wrapper, and the value-formatting rules.

## Proposed shape

```
GenericDatabaseProvider (NEW)
├── BuildSaveSQL(entity, isUpdate, contextUser) — NEW, replaces both providers' GenerateSaveSQL
│   ├── collectSaveFieldValues() — NEW, shared loop
│   │   └── delegates to EntityFieldInfo.IsSPParameter for inclusion
│   ├── EncryptFieldValuesForSave() — existing shared
│   ├── coerceFieldValue() — NEW, abstract dialect hook (datetimeoffset, GUID functions)
│   ├── RenderSPParams() — NEW, abstract dialect hook (DECLARE/SET/EXEC vs $1, $2)
│   └── ComposeSaveSQL() — NEW, abstract dialect hook (result-table wrapper, record-change glue)

SQLServerDataProvider
├── overrides coerceFieldValue(): datetimeoffset → ISO, newid()/newsequentialid() literal skip
├── overrides RenderSPParams(): DECLARE @x TYPE / SET @x = ... / EXEC sp @x=@x_uuid
└── overrides ComposeSaveSQL(): DECLARE @ResultTable + INSERT INTO @ResultTable EXEC ...
                                + spCreateRecordChange_Internal glue
                                + SELECT * FROM @ResultTable

PostgreSQLDataProvider
├── overrides coerceFieldValue(): gen_random_uuid() literal skip, timestamp normalization
├── overrides RenderSPParams(): positional $1, $2, ... + parameters[] array
└── overrides ComposeSaveSQL(): SELECT * FROM schema.sp_create_x($1, $2, ...)
                                + separate INSERT INTO RecordChange (handled by BuildRecordChangeSQL)
```

### Hook signatures (sketch)

```ts
// On GenericDatabaseProvider / DatabaseProviderBase

// Tagged union for coercion results. The "skip" case covers e.g. the user
// passed a function-call literal like `newid()` and we want the DB default
// to fire instead. Using a discriminated union (not a `typeof SENTINEL`
// magic value) keeps the type system honest: callers MUST pattern-match
// before reading `value`, and there is no risk that a legitimate field
// value happens to equal a global sentinel object.
export type CoerceResult =
    | { kind: 'use'; value: unknown }
    | { kind: 'skip' };

// Each dialect declares its own concrete RenderedSPParams shape. The base
// class never inspects it — generic parameter `TRendered` carries the
// round-trip from RenderSPParams to ComposeSaveSQL with full type safety.
// (An earlier draft called this "opaque to the base class"; that's just
// `any` wearing a disguise in TypeScript. A generic parameter expresses
// the same intent without giving up the compiler check.)
abstract class GenericDatabaseProvider<TRendered = unknown> extends DatabaseProviderBase {

    protected async BuildSaveSQL(
        entity: BaseEntity,
        isUpdate: boolean,
        contextUser: UserInfo,
    ): Promise<SaveSQLResult> {
        // 1. Iterate fields, gather values, apply IsSPParameter filter
        const fieldValueMap = await this.collectSaveFieldValues(entity, isUpdate, contextUser);

        // 2. Encryption (existing shared path) — must run AFTER coercion
        //    and BEFORE rendering. See Risks §1.
        await this.EncryptFieldValuesForSave(entity, fieldValueMap, contextUser);

        // 3. Dialect renders the param syntax
        const rendered = this.RenderSPParams(entity, fieldValueMap, isUpdate);

        // 4. Dialect composes the final SQL (including record-change tracking)
        return this.ComposeSaveSQL(entity, rendered, isUpdate, contextUser);
    }

    protected async collectSaveFieldValues(
        entity: BaseEntity,
        isUpdate: boolean,
        contextUser: UserInfo,
    ): Promise<Map<EntityFieldInfo, unknown>> {
        const map = new Map<EntityFieldInfo, unknown>();
        for (const f of entity.EntityInfo.Fields) {
            if (!f.IsSPParameter(isUpdate)) continue;

            // PK-on-create is in the SP signature, but only PASS it if the
            // user actually provided a value. Otherwise let the DB default fire.
            if (!isUpdate && f.IsPrimaryKey && !f.AutoIncrement) {
                const v = entity.Get(f.Name);
                if (v === null || v === undefined) continue;
            }

            const result = await this.coerceFieldValue(f, entity, isUpdate);
            if (result.kind === 'skip') continue;
            map.set(f, result.value);
        }
        return map;
    }

    protected abstract coerceFieldValue(
        f: EntityFieldInfo,
        entity: BaseEntity,
        isUpdate: boolean,
    ): Promise<CoerceResult>;

    protected abstract RenderSPParams(
        entity: BaseEntity,
        values: Map<EntityFieldInfo, unknown>,
        isUpdate: boolean,
    ): TRendered;

    protected abstract ComposeSaveSQL(
        entity: BaseEntity,
        rendered: TRendered,
        isUpdate: boolean,
        contextUser: UserInfo,
    ): Promise<SaveSQLResult>;
}

// Subclasses pin TRendered to their concrete dialect struct.
class SQLServerDataProvider extends GenericDatabaseProvider<SqlServerRenderedSPParams> {
    // SqlServerRenderedSPParams = { declarations, setStatements, execParams, simpleParams }
}

class PostgreSQLDataProvider extends GenericDatabaseProvider<PgRenderedSPParams> {
    // PgRenderedSPParams = { placeholders: string[], values: unknown[] }
    //   OR for wide entities: { jsonArgName: string, jsonValue: object }
    // (see Risks §8 — JSON-arg shape for >100-param entities)
}
```

## What collapses, what stays

### Collapses into the base
- The field iteration loop (today: ~50 lines in SQL Server, ~10 lines in PG)
- The `IsSPParameter` filter application
- The encryption integration point
- The PK-on-create "pass only if value provided" rule
- The top-level `Save → GenerateSaveSQL → execute` dispatch (currently each
  provider overrides `GenerateSaveSQL` to do the same orchestration)

### Stays dialect-specific (as override hooks)
- **Value coercion**: how `datetimeoffset` is formatted for the wire, how
  `gen_random_uuid()` / `newid()` literal detection works, encryption type
  shape.
- **Parameter syntax**: SQL Server `DECLARE/SET/EXEC` with `@var_uuid`
  uniqueness vs PG positional `$1, $2, ...` with a values array vs PG
  **JSON-arg shape** for wide entities (see Risks §8). All three are
  `RenderSPParams` variants; the base doesn't need to know which one fires.
- **SQL template shape**: SQL Server's `DECLARE @ResultTable + INSERT INTO
  @ResultTable EXEC sp + RecordChange glue + SELECT @ResultTable` vs PG's
  `SELECT * FROM function(...)` + separate `INSERT INTO RecordChange`.
- **Record-change integration**: stays in `BuildRecordChangeSQL` (already
  abstract today — dialect-specific INSERT-INTO-RecordChange).

## Scar tissue — recent fixes the new code must preserve

The current save pipeline has been patched repeatedly over the past two
months. Every one of these patches lives inside the code paths this refactor
is rewriting, so each one needs an explicit home in the new hook surface.
Reviewers should sanity-check that the corresponding test exists.

| Commit | What it fixed | New home |
|---|---|---|
| `c136d41f03` | Narrowed `_Clear` companion rule to stay under PG's 100-argument hard limit | `RenderSPParams` (PG): `_Clear` decision is part of param emission |
| `5ff75b96ae` | **JSON-arg sproc shape for wide entities** (AIAgent, AIPromptRun): one `_args jsonb` parameter instead of N positional. NOT a marginal variant — this is a second `RenderSPParams` mode on PG | `RenderSPParams` (PG): switches on `entity.EntityInfo.Fields.length` (threshold ~90 today). `PgRenderedSPParams` must be a discriminated union of positional vs json-arg shapes |
| `7b1d9b5673` | PG savepoint-wrap around TemplateContent param extraction so PG matches SS semantics under failure | `ComposeSaveSQL` (PG): wrapper around the SELECT-FROM-function call |
| `da2e347d72` | DROP-overload guard + named-arg `PERFORM` in `CREATE OR REPLACE FUNCTION` output | CodeGen-side, not this refactor — but the new `RenderSPParams` on PG must continue to emit named args (`p_id := $1`) so the overload guard works |
| `387d46728b` + `003317fa08` | `IsComputed` flag added to `EntityField`; included in `IsSPParameter`. Both dialects must skip computed columns | `collectSaveFieldValues` (base): already handled via `IsSPParameter`. Verify the PG path doesn't also have a parallel filter that needs updating |
| `aabaff858f` | Disable self-join view for virtual `NameField` on SQL Server | Adjacent to `coerceFieldValue` — virtual NameField must be filtered before value lookup |
| `adc8da9ea1` | Align codegen↔runtime contract + bool/INTEGER SQL coercions on PG | `coerceFieldValue` (PG): bool→int conversion lives here |

If any of these are not reproduced in the new code, you will reintroduce the
exact regression the commit fixed. Treat the table as a literal test
checklist.

## Risks & migration concerns

1. **Encryption ordering.** `EncryptFieldValuesForSave` mutates the
   `fieldValueMap` after population but before SQL rendering. The new flow
   preserves this — same call site, just moved up into the base method.

2. **Variable name uniqueness in batched saves.** SQL Server's
   `SQLServerTransactionGroup` batches multiple saves into one SQL string,
   so each save's variables must be uniquely named to avoid collisions —
   that's the `_<uuid-suffix>` we generate today. PG uses positional
   parameters and sidesteps this entirely. The base method must let
   `RenderSPParams` own naming (since the strategy is dialect-specific).

3. **`generateSingleSPParam` (SQL Server, line 1088) — the "simpleParams"
   builder.** Used by some external callers (manifest-driven tooling, the
   GraphQL test harness) for backward compat. Stays SQL-Server-specific.
   The new `RenderSPParams` can emit it as part of its result so existing
   consumers keep working unchanged.

4. **Record-change inlining vs separate-statement.** SQL Server inlines
   the record-change `EXEC` into the same SQL batch as the entity save
   (one round trip). PG runs it as a separate statement after the save
   commits. Both styles must be possible — the `ComposeSaveSQL` hook
   decides. `BuildRecordChangeSQL` already supports both shapes (returns
   `{ sql, parameters? }`).

5. **Snapshot tests.** Both `SQLServerDataProvider` and
   `PostgreSQLDataProvider` have unit tests asserting against generated
   SQL strings. Behavior is preserved but the exact line breaks / whitespace
   may shift. Expect to re-bless ~10-20 snapshots. Each snapshot diff should
   be a no-op semantically; that's part of the PR review.

6. **Public API breakage for downstream subclasses.** Anyone who has
   subclassed `SQLServerDataProvider` and overridden `generateSPParams` or
   `GetSaveSQLWithDetails` directly will need to migrate to the new hook
   surface. Mitigation: ship a deprecation shim that calls the new hooks
   (so old overrides still get invoked, just with a deprecation warning),
   and remove the shim one major version later. Audience is small (this is
   private-ish API today) but worth being explicit about.

7. **TransactionGroup interaction.** `SQLServerTransactionGroup` already
   calls `GetSaveSQL` to regenerate per-item SQL when variables get rebound
   from earlier items in the same batch. That entry point needs to either
   keep working (via wrapper) or migrate to call `BuildSaveSQL`.
   Straightforward — same input, new output shape.

8. **PG JSON-arg shape for wide entities.** Recently landed (commit
   `5ff75b96ae`): PG has a hard 100-argument limit on functions, so wide
   entities (AIAgent, AIPromptRun, anything with ≥90 fields after filtering)
   use a single `_args jsonb` parameter instead of positional bindings. This
   is NOT a minor variant — it's a second `RenderSPParams` strategy on PG
   with different value-serialization rules (JSON-encoded, not type-cast),
   a different SP signature, and different value-coercion needs (e.g.
   binary/bytea fields need base64 encoding inside JSON). `PgRenderedSPParams`
   should be a discriminated union:
   ```ts
   type PgRenderedSPParams =
       | { mode: 'positional'; placeholders: string[]; values: unknown[] }
       | { mode: 'json'; argName: string; argValue: Record<string, unknown> };
   ```
   `RenderSPParams` (PG) picks based on field count; `ComposeSaveSQL` (PG)
   pattern-matches to emit the right call shape. **Do not start the refactor
   without confirming this with whoever owns the JSON-arg work** — getting
   the threshold or the coercion rules wrong silently breaks every wide
   entity on PG.

## Sequencing — ship in one PR, gated by a parity harness

The blast radius of this refactor is "every save in MJ" across both dialects,
regardless of whether we ship in one PR or five. Phasing doesn't reduce the
risk; it just smears it across multiple rebases against `next`, multiple
rounds of snapshot re-blessing, and multiple context-loads for reviewers.

**The thing that actually de-risks this is a SQL parity harness, not phasing.**
Build the harness first; ship the refactor as one PR; let the harness be
the safety net.

### What we get for free from pg-migrate (don't rebuild this)

The existing pg-migrate toolchain already covers a slice of the parity
story at the migration-file layer. Specifically:

- `generateParityReport(tsqlDir, pgDir)` from `@memberjunction/sql-converter`
  — **filename-level** coverage: every T-SQL migration in `migrations/v5/`
  has a `.pg.sql` counterpart in `migrations-pg/v5/`. Emits gaps + coverage %.
- `.github/workflows/pg-migrations.yml` — applies both dialects' migrations
  to fresh DBs, runs the two-pass `migrate → codegen → migrate` cycle,
  verifies schema counts. End-to-end SP-signature agreement across dialects.
- `mj migrate convert` — rule-based T-SQL → PG converter for SP bodies.

**Cross-dialect SP-signature parity is already covered by this CI.** Don't
duplicate it.

**What pg-migrate does NOT cover for this refactor:** it compares SP
*definitions* in migration files. The bug class we just patched — and the
code this refactor is rewriting — lives one layer up, at the **runtime
caller**: what `generateSPParams` / `getWritableFields` emit at save time.
pg-migrate has no visibility into runtime-emitted SQL.

So the parity check we still need is narrower than the original Step 0
draft implied: **per-dialect before/after equivalence for the rewrite**,
not a fresh cross-dialect comparison.

### Step 0 — Save-SQL snapshot harness (per-dialect before/after)

A test helper that, for every entity in the fixture corpus and for each
`{create, update} × {SQL Server, PG}`:

1. Constructs a representative field-value payload (covering nulls,
   default-eligible fields, encrypted fields, function-literal PKs).
2. Calls the **current** `GenerateSaveSQL` and captures the exact emitted
   SQL string (plus the `simpleParams` builder output).
3. Normalizes the captured SQL — strips the per-save uuid variable
   suffixes, whitespace, line breaks — and writes it as a golden file.
4. On subsequent runs, regenerates and diffs against the golden.

Lands on `next` first. No code-under-test changes. The harness is the
checkpoint; the goldens become the contract for the rewrite.

Cross-dialect SP-signature agreement remains the existing pg-migrate CI's
job — this harness only proves "the SAME dialect emits the SAME runtime
SQL before and after the refactor."

### Step 1 (the actual refactor — one PR)

Implements all five "phases" from the old plan at once:

- Adds `BuildSaveSQL` + the three hooks (typed via the `TRendered` generic)
  to `GenericDatabaseProvider`.
- Implements the hooks for `SQLServerDataProvider` (positional + simpleParams).
- Implements the hooks for `PostgreSQLDataProvider` (positional **and**
  JSON-arg shape — see Risks §8).
- Deletes `generateSPParams`, `getWritableFields`, `GetSaveSQLWithDetails`,
  and the per-provider `GenerateSaveSQL` overrides.
- Ships a deprecation shim for downstream subclasses (see Risks §6).
- Re-runs the parity harness from Step 0 — every diff is either zero or
  explicitly justified in the PR description.

### Step 2 (follow-up cleanup, optional)

Delete the deprecation shim after one major version. Not in this PR.

## Out of scope

- **Cross-dialect feature parity.** This refactor doesn't try to make
  SQL Server and PG behave identically — only to share the orchestration.
  Dialect-specific behavior (e.g. SQL Server's `OUTPUT INTO @ResultTable`
  pattern vs PG's `RETURNING` clause) stays where it is.
- **`spDelete` consolidation.** Same pattern likely applies but is its own
  refactor; this plan covers `spCreate`/`spUpdate` only.
- **Encryption refactor.** `EncryptFieldValuesForSave` is already shared and
  works; left as-is.
- **TransactionGroup overhaul.** PG and SQL Server have separate transaction
  group classes today; that's a parallel concern, not bundled here.

## Acceptance criteria

### Behavior-preservation (the decisive signal)

- **Parity harness** (Step 0) shows **zero unjustified diffs** across the
  full fixture corpus on both dialects, for both create and update. Any
  diff is called out in the PR description with a one-line rationale
  ("whitespace normalization", "deterministic ordering of SET statements
  after Map→array conversion", etc.). Reviewer sign-off is on the diff
  list, not on the code in isolation.

### Round-trip integration tests (the "SQL still actually works" signal)

Run against a real SQL Server (docker workbench) AND a real PG instance.
The parity harness only proves the string is the same; these prove the
string still does the right thing.

- [ ] **Regression: virtual field with mis-set `AllowUpdateAPI=1`** saves
  cleanly. (The original bug class.)
- [ ] **Value-coercion edges**: `datetimeoffset` with non-null value;
  `uniqueidentifier` set to literal `"newid()"`; bool→INTEGER on PG;
  bytea/binary field through both positional and JSON-arg paths.
- [ ] **Encrypted field**: save with a field marked for encryption,
  verify the stored value is the encrypted form (encryption must run
  AFTER coercion and BEFORE rendering — Risks §1).
- [ ] **`SQLServerTransactionGroup` batch save**: 5+ saves in one batch,
  verify no `@variable` name collisions and all rows land.
- [ ] **Wide PG entity (AIAgent or AIPromptRun)**: must hit the JSON-arg
  path, not positional. Verify the persisted row matches the input
  field-by-field (Risks §8).
- [ ] **PG `_Clear` companion**: entity that triggers `_Clear` columns
  on PG, verify the total argument count stays under 100 (commit
  `c136d41f03`).
- [ ] **PK-on-create with value provided** vs **PK-on-create with function
  literal `"newid()"`**: both code paths in `collectSaveFieldValues`,
  verify the first uses the user-supplied UUID and the second lets the
  DB default fire.
- [ ] **Record-change row**: save with record-change tracking enabled on
  both dialects (inlined on SQL Server, separate-statement on PG).
- [ ] **`IsComputed` field**: entity with a computed column saves
  successfully and the computed column is read back correctly (the new
  filter must skip it on both dialects).
- [ ] **The original repro**: a fresh agent run that produces an
  artifact payload completes with the artifact + version + junction
  all persisted.

### Code-quality bars

- All existing unit tests pass.
- New unit tests for each of the three hooks per dialect (6 test
  classes), each exercising the relevant `coerceFieldValue` /
  `RenderSPParams` / `ComposeSaveSQL` paths in isolation against
  fixture data.
- No new `any` types introduced in the new hook surface — TS `strict`
  must remain clean.
- No new entries in any downstream package's `@memberjunction/*` major
  version bump tracker (public API preserved via the deprecation shim).
- Microbenchmark: save throughput on a 50-field test entity (1000 rows,
  both dialects) is within ±5% of the pre-refactor baseline. Map
  iteration allocates differently than the parallel-array approach; this
  check catches an accidental N² or hot-path allocation regression.

### Out of scope for this PR (filed as separate issues)

- Deletion of the deprecation shim (one major version later).
- `spDelete` consolidation.
- Cross-dialect feature parity (e.g. unifying `OUTPUT INTO @ResultTable`
  with `RETURNING` semantics).
- TransactionGroup overhaul.

# Issue #3252 — `mj migrate convert` silently drops statements: root causes + build plan

- **Issue**: [#3252](https://github.com/MemberJunction/MJ/issues/3252) — `mj migrate convert` silently drops statements and emits empty PG migrations while reporting success (`priority: critical`)
- **Related**: #3253 (shipped instance), #3254 (external detector / parity gate — compensating control, NOT this fix)
- **Branch**: `fix/3252-migrate-convert-drops-statements`
- **Status**: root causes confirmed by deterministic repro (2026-07-22); plan approved — scope = all 3 root causes + reconciliation invariant; bake mode halts at first gap; block-less IF guards get translated (not just reported)
- **Verification (2026-07-22)**: adversarially verified by a 5-agent workflow against the real code + live sqlglot 30.13. Verdict **go-with-amendments**. RC1/RC2/RC3 diagnoses and fixes 1a/1b/1c, 2a/2b/2c all **confirmed sound**. Phases 3 & 4 were **not executable as originally written** — this document has been amended in place per the two blockers + four majors the review surfaced. The amendment points are called out inline with **[V]** markers.
- **Execution progress (TDD, 2026-07-22)**:
  - ✅ **Phase 1 (dialect)** — 1a block-less IF envelope, 1b If/IfBlock guard + EMPTY-EMISSION postcondition, 1c inline named-default strip, 1d SOFT drop-accounting (`dropped[]` + `ACCOUNTING-LEAK`, never raises). `packages/SQLGlotTS`: 69 Python dialect tests + 69 TS tests green, clean build. `mj_transpile` now returns `{sql, unhandled, dropped}`.
  - ✅ **Phase 2a/2b (classification)** — narrowed `CODEGEN_NAME` (dropped bare `trg`); hardened `isUnbanneredSnapshot` to require a vw/sp/fn codegen-object (matched on `evidence` prefix). `packages/SQLConverter`: full suite 1080 tests green, clean build. RC1 and RC2 are fixed end-to-end at the dialect + classifier layers.
  - ✅ **Phase 3 (reconciliation)** — refined from the fragile exact byte-balance (which the verification flagged) to a robust **coarse count + a targeted "content vanished" guard** matching the issue's own #3254 detector logic. `MigrationConversionResult.reconciliation` = `{ sourceStatements, emittedStatements, gaps, accountingLeak, suspiciousEmptyOutput }`. `suspiciousEmptyOutput` (substantive kept T-SQL → no output + no gap) and a propagated dialect `ACCOUNTING-LEAK` both push a `RECONCILIATION-EMPTY-OUTPUT` gap into `unhandled`, which flows through the existing CLI gap path to fail the run. The Python numeric `parsed`/`emitted` export is **not needed** by this design (counts computed in TS). +4 tests.
  - ✅ **Phase 4 (bake-path + CLI-catch hardening)** — 4a FORWARD-only gap gate (`gap-no-bake`, placed after the baseline/re-bake branches so those are untouched; baseline exemption verified); 4b `mode` union + `ConvertedShape` intersection; **4c folded into 4e** (the FORWARD gate means `db.apply` only runs for clean conversions, so the generic catch already covers apply/capture throws — no separate `BakeApplyError` class); 4d halt-at-first-gap via a pure `decideConvertWrite` helper + a guaranteed non-zero exit before `process.exit(0)`; 4e non-bake catch writes a `.needs-hand` stub instead of a bare `this.error`; 4f `--allow-gaps`+`--bake-codegen` guard. SQLConverter baker +4 tests, MJCLI +6 decision tests. Builds clean (`SQLGlotTS`, `SQLConverter`, `MJCLI`).
  - ⏳ **Remaining**: Phase 5 CLI-level + bake-mode end-to-end (bake against live PG is a release-time step); the CLI reconciliation **summary line** + 2c dropped-object surfacing (low-value telemetry) deferred. Test tallies: SQLGlotTS 69+69, SQLConverter 1087, MJCLI 432 — all green.

## Executive summary

Three independent defects, each reproduced deterministically against the literal v5.49 migration files, combined to let the converter emit empty/broken PG migrations while printing `unhandled stmts: 0` and exiting 0:

| # | Symptom (v5.49 evidence) | Root cause | Layer |
|---|---|---|---|
| RC1 | `Backfill_Missing_FK_Auto_Indexes` → six bare `;`, zero index DDL, `unhandled: []` | Block-less `IF [NOT] EXISTS (…) <stmt>` isn't matched by the IF-envelope (which requires `BEGIN`), parses as `exp.IfBlock`, and sqlglot's PG generator emits an **empty string** with only a warning. `_transpile_plain` has no `If`/`IfBlock` guard and accepts empty emissions | Python dialect (`mj_postgres.py`) |
| RC2 | `Fix_ConversationDetail_Sequence_Deadlock` → "no DDL to translate", hand trigger vanished, status `converted` | Bare `trg` alternative in `CODEGEN_NAME` classifies **any** trigger as a CodeGen object → trips `isUnbanneredSnapshot` → whole hand-written file flips to baseline statement-mode, which drops `codegen-object` batches by design | TS classification (`MigrationStatementSplitter.ts`, `MigrationConverter.ts`) |
| RC3 | `Agent_Conversation_Compaction` + `--bake-codegen` → hard crash, **no** `.needs-hand`, no gap report | (a) `IncrementalBaker` FORWARD mode never gates on `conv.status`/`conv.unhandled` before `db.apply()` (RE-BAKE mode does); (b) the applied body contained invalid PG (`ADD COLUMN … CONSTRAINT "DF_x" DEFAULT (…)` — T-SQL named-inline-default emitted verbatim); (c) the CLI's per-file catch calls `this.error` → run dies with zero artifacts | Baker + CLI + dialect |

The module's own documented contract ("**nothing is dropped silently**", `MigrationConverter.ts` header) has no enforcement mechanism. Phase 3 adds one: an exact statement-accounting invariant (`in == emitted + reported + justified-drops`) that fails the run on any unaccounted statement — the internal counterpart to #3254's external detector.

---

## Root-cause detail (with repro evidence)

### RC1 — block-less IF guards → bare `;` (silent drop in the AST dialect)

**File**: `packages/SQLGlotTS/src/python/mj_postgres.py`

Chain:
1. `_find_if_exists_begin` (line ~755) explicitly requires the word `BEGIN` after the guard condition (`if not m or m.group(0).upper() != "BEGIN": continue`). The v5.49 FK-index migration uses the block-less T-SQL form:
   ```sql
   IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = '…' AND object_id = OBJECT_ID('…'))
       CREATE INDEX … ON … (…);
   ```
   so the envelope never matches and the whole batch falls through to `_transpile_plain`.
2. sqlglot 30.x parses this as `exp.IfBlock`. `_transpile_plain` (line ~1110) guards `exp.Command`, `exp.Declare`, `exp.Parameter`-bearing statements, routines, etc. — but not `exp.If`/`exp.IfBlock`. (The code even *mentions* the If/IfBlock version-variance in a comment, but only in the context of `@variable` detection — a sys-guard IF has no `@variable`.)
3. The statement reaches `stmt.sql(dialect=MJPostgres)`. sqlglot's generator treats an unsupported node as a **warning**, not an error, and returns `""`.
4. `out.append("")` → `";\n".join(out) + ";"` → a bare `;` per guard. `unhandled` stays empty.

**Repro** (verified): feeding the literal statement from `V202607191254__v5.49.x__Backfill_Missing_FK_Auto_Indexes.sql` into `mj_transpile` returns `{"sql": [";"], "unhandled": []}` and logs `Unsupported If block syntax` to stderr. Six guards → the exact six bare `;` shipped in the issue.

Note the `BEGIN…END` form of the *same* guard is already translated correctly (`_translate_sys_guard` → `pg_indexes` predicate → `DO $$` block — covered by `test_mj_postgres.py` "sys.indexes guard → pg_indexes"). The block-less form is a pure envelope-matching gap.

### RC2 — bare `trg` prefix + fragile snapshot heuristic → hand trigger vanishes

**Files**: `packages/SQLConverter/src/MigrationStatementSplitter.ts:47`, `packages/SQLConverter/src/MigrationConverter.ts:137-141`

Chain:
1. `CODEGEN_NAME = /^(spCreate|spUpdate|spDelete|spRecompile|vw|fn|trgUpdate|trgCreate|trgDelete|trg)/i` — the final bare `trg` alternative makes *every* trigger a "CodeGen object". `trgConversationDetail_AssignSequence` (hand-written, 97 lines) → `codegen-object`.
2. `extractKeptTSQL`'s snapshot heuristic:
   ```ts
   const isUnbanneredSnapshot =
     split.boundaryMethod === 'no-codegen-block' && stmts.some((s) => s.kind === 'codegen-object');
   ```
   A **single** false-positive batch flips the entire file into statement-mode.
3. Statement-mode (`classifyStatementMode`) drops `codegen-object` batches ("regenerated by `mj codegen`" — true for baselines, false here). Result: `tsql: ''`, `status: 'converted'`, `droppedObjects: ['TRIGGER trgConversationDetail_AssignSequence']` — and **nothing downstream gates on `droppedObjects`**.
4. `convertMigration` early-returns the `regenOnlyMarker` → the shipped "no DDL to translate" stub. Exit 0.

**Repro** (verified via built dist against the real file): `batches: [noise, codegen-object(TRIGGER trgConversationDetail_AssignSequence)]`, `status: converted`, `tsql length: 0`.

**Ledger evidence that narrowing is safe** *(corrected per [V] — the original undercounted)*: a sweep of every `CREATE TRIGGER` in `migrations/v5/*.sql` finds **381 distinct trigger names — 379 `trgUpdate*`, zero `trgCreate*`, zero `trgDelete*`**, plus **two hand-written** triggers: `trgConversationDetail_AssignSequence` (`trg`-prefixed — the bare-`trg` victim this fix rescues) and `tr_APIScope_UpdateFullPath` (`tr_`-prefixed, present in all 5 baselines). The `tr_`-prefixed one is matched by **neither** the current bare-`trg` regex **nor** the narrowed regex, so it is already `hand-procedural` today and stays so — it *confirms* the narrowing is safe rather than contradicting it. `trgCreate*`/`trgDelete*` are kept in the regex as documented CodeGen conventions (harmless — none committed).

Had the file stayed in banner-mode (the correct route), `HAND_PROCEDURAL` in `MigrationSplitter` would have flagged it `needs-hand-authoring` — the correct outcome (the committed PG counterpart is a hand-authored `pg_advisory_xact_lock` variant, proving a human port was genuinely required).

### RC3 — bake path applies known-gappy SQL, then crashes with zero artifacts

**Files**: `packages/SQLConverter/src/IncrementalBaker.ts:121-160`, `packages/MJCLI/src/commands/migrate/convert.ts:292-299`, `mj_postgres.py`

Chain:
1. `bakeMigration` RE-BAKE mode has the guard:
   ```ts
   if (conv.status === 'needs-hand-authoring' || conv.unhandled.length > 0) {
     return { ...base, pgSQL: committedPgSql, mode: 'preserved' };
   }
   ```
   **FORWARD mode (the release path) has no equivalent** — it goes straight to `db.apply(this.withSearchPath(handBody))` even when the conversion carries 9 unhandled statements + a hand-procedural trigger.
2. The transpiled hand body for `Agent_Conversation_Compaction` contains (verified by transpiling the real kept T-SQL):
   ```sql
   ADD COLUMN "CompactionTriggerPercent" INT NOT NULL CONSTRAINT "DF_AIAgentType_CompactionTriggerPercent" DEFAULT (75)
   ```
   PostgreSQL has no named DEFAULT constraints → `syntax error at or near "CONSTRAINT"` — the exact error in the issue. (sqlglot passes the T-SQL inline named-default through; the *standalone* `ADD CONSTRAINT DF_x DEFAULT … FOR col` form is already handled by `_transpile_default_constraint`, the *inline column* form is not.)
3. `db.apply` throws → the CLI's per-file `catch` calls `this.error(...)` → oclif exits the entire run. No `.needs-hand`, no `conversion-gaps.report.json`, no summary. The correct reporting that the non-bake path produces for this exact file (a 970-line `.needs-hand`, itemized gaps, non-zero exit) never happens.

---

## Approved design decisions

1. **Scope**: fix all three root causes AND add the statement-accounting reconciliation invariant (defense-in-depth inside the tool; #3254's detector remains the outer gate).
2. **Bake halt semantics**: in `--bake-codegen` mode, ANY gap (needs-hand, unhandled statements, or a working-DB apply failure) **halts the batch at that migration** — artifacts (`.needs-hand` + gap report) are written first, exit is non-zero, and later migrations are not baked against a stale DB. `--allow-gaps` becomes incompatible with `--bake-codegen` (flag-parse error): an "accepted gap" contradicts bake's applies-standalone contract.
3. **Block-less IF**: extend the envelope so block-less sys-guards **translate** exactly like the `BEGIN…END` form (same `_translate_sys_guard` machinery), AND add the empty-emission postcondition so any *future* unsupported node is reported, never dropped.
4. **Bake-mode gap artifacts are always `.needs-hand`** (never a discoverable `.pg.sql` with gap comments, which the non-bake path permits for `unhandled`-only files): a gap-commented unbaked `.pg.sql` would violate bake's "deploys standalone via `mj migrate` alone" contract and would be skipped as "already converted" on re-run.

---

## Build plan

Phases 1–2 are independent of each other; Phase 3 depends on Phase 1 (dialect accounting); Phase 4 depends on 1–3; Phase 5 validates everything. Per repo rules: every phase ends with `npm run build` + `npm run test` in the touched package(s).

### Phase 1 — Dialect fixes (`packages/SQLGlotTS`)

All changes in `src/python/mj_postgres.py`, tests in `src/python/test_mj_postgres.py` (run: `python3 src/python/test_mj_postgres.py`), mirrored where sensible in `src/__tests__/MJPostgresTranspiler.test.ts` (vitest; auto-skips without Python).

**1a. Block-less IF envelope (RC1 translate path)**
- In `_find_if_exists_begin`: when the word after the guard's closing paren is NOT `BEGIN`, capture the **single following statement** as the body — scan with the existing `_scan_atom` machinery to the first top-level `;` (or end of text). Return the same `_IfExistsMatch` shape so `_transpile_if_exists_begin` works unchanged (sys-guard translation, extprop bodies, RAISERROR, unhandled routing all inherited).
- Bail out (no match → falls to the plain path, where 1b reports it) when an `ELSE` follows the captured statement — block-less IF/ELSE is not worth modeling.
- Result for the FK-index file: each guard becomes `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_indexes …) THEN CREATE INDEX … END IF; END $$;`.

**1b. `If`/`IfBlock` guard + empty-emission postcondition (RC1 report path — the contract enforcement)**
- In `_transpile_plain`, before the generic emission: `isinstance(stmt, (exp.If, exp.IfBlock))` → route to `unhandled` with kind `IF-BLOCK` (anything reaching here wasn't translatable as an envelope).
- Postcondition at the final `out.append(...)`: if the generated text is empty/whitespace/bare `;` for a non-empty source statement → `unhandled` with kind `EMPTY-EMISSION` (include the T-SQL snippet), do NOT append. This closes the *class* of "generator warned and returned nothing" bugs, not just the IfBlock instance.

**1c. Strip names from inline column DEFAULT constraints (RC3's crash statement)** — *[V] confirmed: the inline named default parses as `exp.Alter` whose `ColumnDef` carries `ColumnConstraint(kind=DefaultColumnConstraint, this=Identifier('DF_x'))` — NOT `exp.Command` — so this AST seam is correct.*
- New AST transform (alongside `_rewrite_boolean_defaults`): a `ColumnConstraint` whose kind is `DefaultColumnConstraint` and which carries a name (`this` = Identifier) → drop the name (PG defaults are unnamed). `ADD [X] INT NOT NULL CONSTRAINT [DF_x] DEFAULT (75)` → `ADD COLUMN "X" INT NOT NULL DEFAULT (75)`. Named CHECK/FK/UNIQUE constraints are untouched (valid PG).
- **[V] cosmetic**: the emitted form retains the paren — `DEFAULT (75)`, not `DEFAULT 75` (both valid PG). Assert on `DEFAULT (75)` in the test.

**1d. Drop accounting (feeds Phase 3) — SOFT, never raises** — *[V] BLOCKER-2 amendment.*
- `mj_transpile` result gains `"dropped": [{kind, snippet}, …]` recording every *intentional* drop (`SET` noise, `PRINT`, statement-level `RAISERROR`, batch-control Commands, extprop-dance guards, actionless ALTERs, …). Add `dropped.append(...)` at **every** intentional-drop `continue` site.
- **Audit every `continue` in the `_transpile_plain` loop** so each maps to exactly one bucket. The original 1d list **omitted the `swallow_routine_end` path** (`mj_postgres.py:~1119-1123`) — a genuine 1→0 drop that fires on routine-bearing files (a hand trigger's dangling `END` is swallowed). It **must** get a `dropped.append({kind:'ROUTINE-END', …})`. Also instrument the dead `_METADATA_TABLES` insert-drop site. (Verified: without this, the accounting check trips on any routine-bearing file in the Phase 5 ledger sweep.)
- **Reconciliation is a SOFT failure — it must NOT `raise`/`assert`.** On `parsed != emitted + unhandled + dropped`, append a synthetic gap to `unhandled` (kind `ACCOUNTING-LEAK`, with the leaked-count context) so the file is flagged loudly **with artifacts**. A hard `raise` would propagate through `MJPostgresTranspiler.transpile` → `convertMigration` throws → the (currently unhardened) non-bake per-file catch `this.error`s → **zero artifacts** — reintroducing the exact RC3 pathology on every routine-bearing file. (The non-bake catch is separately hardened in 4e.)
- **[V] known caveat (not introduced here, document it)**: a `CREATE TRIGGER … AS BEGIN … END` that sqlglot falls back to as `exp.Command` does NOT set `swallow_routine_end`, so its trailing `END` leaks a bogus `END;` while only the header is reported. Reconciliation is a *counting* check, not a *correctness* check, so it passes on this bogus emission — the file is already `needs-hand-authoring`, so a human rewrites it anyway. Optionally guard `CREATE-TRIGGER-as-Command` to route the whole batch to `unhandled`; at minimum note it as a known `.needs-hand` artifact caveat.

**Phase 1 tests** (each is red before the fix):
- block-less `IF NOT EXISTS(sys.indexes…) CREATE INDEX …;` → must_contain `pg_indexes`, `CREATE INDEX`; must_not_contain bare-`;`-only output; `expect_unhandled=0` — the literal v5.49 shape.
- block-less `IF EXISTS(sys.indexes…) DROP INDEX [x] ON [t];` → translated or reported, never empty (the v5.48 hand-port shape).
- block-less unrecognized guard (`sys.foreign_keys`) → `expect_unhandled=1`, nothing emitted.
- block-less IF with `ELSE` → reported (kind `IF-BLOCK`), not dropped.
- inline named default → emits `DEFAULT (75)`, no `CONSTRAINT "DF_…" DEFAULT`.
- synthetic unsupported-node case → lands in `unhandled` as `EMPTY-EMISSION`, not silent.
- accounting: a batch mixing emit/drop/report reconciles exactly (`parsed == emitted + unhandled + dropped`).
- **routine-bearing input** (a `CREATE OR ALTER TRIGGER … BEGIN … END` file, e.g. the real `Fix_ConversationDetail` content) → transpiler returns a result (no throw), the routine is in `unhandled`, the swallowed `END` is in `dropped`, and accounting balances — **proves 1d does not crash on the ledger's routine files**.
- **forced accounting leak** (a stub/monkeypatched drop-site that "loses" a statement) → an `ACCOUNTING-LEAK` entry appears in `unhandled`, and the call still **returns** (no exception).

### Phase 2 — Classification fixes (`packages/SQLConverter`)

**2a. Narrow `CODEGEN_NAME` (RC2)** — `MigrationStatementSplitter.ts:47`: remove the bare `trg` alternative; keep `trgUpdate|trgCreate|trgDelete` (documented CodeGen conventions). Comment must cite the ledger sweep (all CodeGen triggers are `trgUpdate*`; the only bare-`trg` trigger ever committed is hand-written).

**2b. Harden `isUnbanneredSnapshot` (RC2 defense-in-depth)** — `MigrationConverter.ts:138-142`: a lone trigger classification must never flip a file into statement-mode. Require snapshot-shaped evidence: at least one `codegen-object` batch that is a VIEW or PROCEDURE/FUNCTION (`vw*`/`sp*` — what real squashed snapshots always contain). Triggers/indexes alone → stay banner-mode, where `HAND_PROCEDURAL` and the transpiler report honestly.
- **[V] implementation note**: `StatementBatch.kind` is just `'codegen-object'` for views, sprocs, functions, triggers AND auto-FK indexes — it does **not** discriminate. Match on the `evidence` string prefix (`/^(VIEW|PROCEDURE|FUNCTION)\b/`) of the codegen-object batches, NOT on `kind`. (Verified: baseline `B*.sql` files carry hundreds of `VIEW vw*`/`PROCEDURE sp*` evidence strings, so they stay statement-mode; the RC2 target file has none, so both 2a and 2b independently route it to banner-mode → `HAND_PROCEDURAL` flags `needs-hand-authoring`.)

**2c. Surface statement-mode drops** — statement-mode `droppedObjects` already exist on the result; thread them through `ConvertedShape` in `convert.ts` so the split summary prints them per file (`dropped N CodeGen objects: …`). For **non-baseline** files, any statement-mode drop feeds the Phase 3 reconciliation as a *justified* drop only when the object name matches the (narrowed) CodeGen convention; otherwise it is unaccounted → fail.

**Phase 2 tests** (red first):
- `MigrationStatementSplitter`: `CREATE OR ALTER TRIGGER trgConversationDetail_AssignSequence …` → `hand-procedural`; `trgUpdateFoo` → `codegen-object`.
- `MigrationConverter`: the **literal** `V202607202110__…Fix_ConversationDetail_Sequence_Deadlock.sql` content → `status: 'needs-hand-authoring'`, `handProcedural` non-empty, `tsql` contains the trigger.
- Heuristic: unbannered file with hand DDL + one `trgUpdate*` batch (no vw/sp) → banner-mode (not statement-mode); genuine snapshot fixture (vw + spCreate + grants + metadata) → still statement-mode.
- Baseline (`B*`) fixtures → behavior unchanged (statement-mode, metadata kept, codegen dropped).

### Phase 3 — Statement-accounting reconciliation (Python dialect + converter + CLI) — *[V] BLOCKER-1: redesigned at the dialect layer*

The internal invariant the issue asks for (fix direction #2): **every source statement must land in exactly one bucket** — emitted, reported gap, or justified drop — and the run **flags** any unaccounted statement (soft-fail, per 1d).

**Why the original TS-layer design was wrong (and this replaces it).** The first draft computed `emitted` as "statements in the pgSQL body" at the TS layer. Three verified problems make that uncountable:
1. `mj_transpile.sql` is a `string[]` of **GO-batch/envelope chunks**, not per-statement — the same statements yield `emitted=1` when batched vs `3` when GO-separated.
2. A single source statement legitimately **expands** to multiple emitted top-level statements — an `ALTER COLUMN` emits a dependent-view-drop `DO $$…$$` block **plus** the ALTER; every `IF EXISTS` guard is one `DO $$…$$` block containing internal `;`. Re-splitting the pgSQL text on `;` over-counts and also breaks on the dollar-quoted `DO` bodies.
3. The single formula conflated **banner mode** (measures the CodeGen block as *lines* + wholesale hand text) with **statement mode** (GO-batch granularity) — incompatible units.
4. `recoverEntityRegistrationInserts` **double-counts**: recovered INSERTs land in both the codegen-drop bucket and the emitted output.

**Corrected design — count at the dialect, at source-statement granularity:**
- The reconciliation numbers are produced **inside Python `_transpile_plain`**, where `parsed` (from `_parse_resilient`), `emitted` (one `out.append` per source statement), `unhandled`, and `dropped` are all known **per source statement**. `mj_transpile` sums them across batches and returns explicit numeric counts on the result: `{ parsed, emitted, droppedCount, unhandled: [...], dropped: [...] }`. **Never** derive `emitted` from `transpiled.sql.length` or by re-splitting joined pgSQL text.
- `MJTranspileResult` (TS, in `MigrationConverter.ts`) gains `parsed: number`, `emitted: number`, `dropped: UnhandledStatement[]` mirroring the Python fields.
- `MigrationConversionResult` gains a `reconciliation` block computed by `convertMigration` at **one consistent per-statement granularity for both modes**:
  ```ts
  interface ConversionReconciliation {
    sourceStatements: number;   // splitByStatement(whole file) minus noise — the denominator, ONE granularity for both modes
    emitted: number;            // from the dialect's per-statement count (NOT from pgSQL text)
    gaps: number;               // unhandled.length + handProcedural.length
    droppedCodeGen: number;     // banner CodeGen block + statement-mode codegen-object/grant batches — counted via splitByStatement, per-statement
    droppedMetadata: number;    // mj-sync / statement-mode metadata batches (per-statement)
    droppedNoise: number;       // SET/PRINT/batch-control (dialect dropped[] of kind noise + statement-mode noise batches)
    recoveredRegistration: number; // registration INSERTs pulled OUT of the codegen block back INTO emitted (see netting rule)
    unaccounted: number;        // sourceStatements - (emitted + gaps + droppedCodeGen + droppedMetadata + droppedNoise); MUST be 0
  }
  ```
- **Banner mode** (`classifyBannerMode`): to keep ONE granularity, run `splitByStatement` over the **whole file** for `sourceStatements`, and over the **CodeGen block** for `droppedCodeGen` — so the denominator and the codegen-drop count use the same per-statement units as the transpiled hand region's dialect counts.
- **Netting rule for recovered registration INSERTs**: statements `recoverEntityRegistrationInserts` pulls out of the dropped CodeGen block and re-adds to `tsql` are counted in **`emitted`** (they transpile) and **subtracted** from `droppedCodeGen` (`recoveredRegistration`) — so they occupy exactly one bucket, not two.
- **Statement-mode noise** batches are explicitly counted into `droppedNoise` (the original omitted them).
- Postcondition (**soft**, matching 1d): `unaccounted > 0` → `convertMigration` force-flags the result as a gap (append an `ACCOUNTING-LEAK` entry to `unhandled`, escalate status away from clean `converted`, detail in `notes`) — it does **not** throw.
- A `regen-only` marker (`"no DDL to translate"`) is legal only when `sourceStatements` minus justified drops is 0 — a marker over real unaccounted DDL escalates to a gap (the issue's "no marker over demonstrable DDL" ask).
- CLI summary gains a per-run reconciliation line (`N stmts in → E emitted, G gaps, D dropped (codegen/meta/noise), 0 unaccounted`). The CLI exits non-zero when any file has `unaccounted > 0`, independent of `--allow-gaps` (unaccounted is a correctness failure, not an accepted gap).

**Phase 3 tests**: 
- Python (`test_mj_postgres.py`): the dialect returns correct `parsed`/`emitted`/`droppedCount` for a mixed batch; a routine-bearing batch balances (regression against BLOCKER-2); a forced leak surfaces `ACCOUNTING-LEAK` without raising.
- TS (`MigrationConverter.test.ts`): reconciliation arithmetic on fixtures for **each** path — banner (hand DDL + CodeGen block), statement-mode baseline, statement-mode snapshot, and the **recovered-registration-INSERT** path (assert `recoveredRegistration` nets correctly and `unaccounted === 0`). A sabotage fixture (stub transpiler under-reporting emitted) → `unaccounted > 0` → status escalated, no throw.
- **New async, Python-gated sweep** (NOT an extension of the existing sync loops): `pg-migration-regression.test.ts`'s existing sweeps call the **legacy** `convertFile` (regex pipeline). The reconciliation sweep must instantiate `MJPostgresTranspiler` (spawns `python3` per file), be `async`, and skip when `python3`/`sqlglot` is absent **in addition to** `SKIP_HEAVY_IN_CI`. Add it as its own `describe` block: for every `migrations/v5/*.sql`, `convertMigration` reconciles with `unaccounted === 0`, plus a status diff vs. the current converter (only the RC2-affected file(s) may change category).

### Phase 4 — Bake-path + CLI-catch hardening (`IncrementalBaker` + `convert.ts`) — *[V] Majors 1–3 + Blocker-2 (4e)*

**4a. FORWARD-mode gap gate (RC3a) — placed STRICTLY inside the forward branch** — *[V] MAJOR-3: must NOT be hoisted to the top of `bakeMigration`.* In `IncrementalBaker.bakeMigration`, add the gate **after** the baseline branch (`~line 152`), **immediately before** `if (handBody) { await this.opts.db.apply(...) }` (`~line 154`):
```ts
if (conv.status === 'needs-hand-authoring' || conv.unhandled.length > 0 || conv.reconciliation.unaccounted > 0) {
  return { ...base, pgSQL: handBody /* header + gap comments + transpiled DDL, no bake */, mode: 'gap-no-bake' };
}
```
No apply, no capture, working DB untouched.
- **Leave the RE-BAKE `'preserved'` path (`~137-145`) and the BASELINE branch (`~147-152`) untouched.** Hoisting the gate would (1) skip the committed-file apply that advances the working DB and flip the passing test `IncrementalBaker.test.ts:243` (`expect(r.mode).toBe('preserved')`), and (2) make **every baseline** return `gap-no-bake` — baselines legitimately carry `status='needs-hand-authoring'` (the 5 hand utility fns) yet bake completely via the baseline branch, so under 4c halt-semantics a top-level gate would halt the entire `--bake-codegen` run at the first baseline.
- **Baseline exemption (resolves the design-decision-#2 tension)**: "ANY gap halts" is scoped to **non-baseline forward baking**. Baseline `needs-hand-authoring` is expected and non-fatal — the baseline branch returns `'baked'` (with the utility-fn gaps surfaced), and the caller still writes `.needs-hand` because it keys off `status`.

**4b. Type threading (so 4a/4c compile)** — *[V] MAJOR-1: the original would not compile.*
- Extend `BakedMigrationResult.mode` union to `'baked' | 'preserved' | 'gap-no-bake'`.
- `MigrationConversionResult` (from Phase 3) now carries `reconciliation` — used by 4a's gate.
- Redefine `ConvertedShape` in `convert.ts:27` from a bare `Pick` to an **intersection**:
  ```ts
  type ConvertedShape = Pick<MigrationConversionResult, 'status' | 'pgSQL' | 'unhandled' | 'handProcedural'>
    & { mode?: BakedMigrationResult['mode']; reconciliation?: ConversionReconciliation };
  ```
  The non-bake `convertMigration` path leaves `mode` undefined; the baker path sets it. `MigrationConversionResult` has no `mode`, so a plain `Pick<…,'mode'>` is a type error — the intersection is required.

**4c. Apply-failure artifacts (RC3b)** — wrap the `db.apply` call(s): on error throw a typed `BakeApplyError { fileName, pgError, transpiledSQL }`. *[V] minor*: `captureEntity` also executes generated SQL against the working DB (`skipExecution:false`) and can throw — either wrap it in the same `BakeApplyError` typing, or scope `BakeApplyError` to hand-body apply and document the capture-failure residual in Risks. **Decision: wrap `captureEntity` too** — a capture-execution failure is as artifact-destroying as an apply failure.

**4d. Halt-at-first-gap + guaranteed non-zero exit (approved semantics)** — *[V] MAJOR-2: the original let a gap-no-bake escape to `exit 0`.* In `runSplit` bake mode:
- **Force `.needs-hand` for any `gap-no-bake` regardless of `status`** — `isNeedsHand` currently keys only off `status === 'needs-hand-authoring'`, so an unhandled-only or unaccounted-only gap-no-bake (status `'converted'`) would otherwise be written as a discoverable `.pg.sql`, violating design decision #4. In bake mode, `mode === 'gap-no-bake'` ⇒ write `.needs-hand`.
- **Record every `gap-no-bake` AND `BakeApplyError` file into the gap trackers (or a dedicated `halted` flag)** so the gap report captures it and `gapCount > 0`.
- **Guarantee a non-zero exit for a halt BEFORE the unconditional `if (bakeCodegen) process.exit(0)` at `convert.ts:368`.** A halt driven by an unaccounted-only gap or a `BakeApplyError` must not fall through to `process.exit(0)`. Route through `this.error`/explicit `exit(1)` inline (keeping `result` definitely-assigned), with a message: resolve the gap → apply the finished `.pg.sql` to the working DB → re-run (already-converted files are skipped by discovery).
- Then stop the loop (later migrations must not bake against a stale DB); still write the gap report + summary first.

**4e. Non-bake per-file catch hardening** — *[V] BLOCKER-2 (second half): the non-bake path must not `this.error` with zero artifacts either.* Rewrite `convert.ts:295-299`'s catch so that when `convertMigration` throws (e.g. Python/transpiler infra failure — the soft-fail in 1d/Phase 3 means logical gaps no longer throw, but infra errors still can), it writes the best-available transpile-only `<name>.pg.sql.needs-hand` with the error embedded as a header comment, appends to `conversion-gaps.report.json`, prints the summary-so-far, THEN exits non-zero. Never `this.error` mid-loop with zero artifacts. This mirrors 4c/4d for the non-bake path and closes the RC3-analogue there.

**4f. Flag guard** — `--allow-gaps` + `--bake-codegen` → flag-parse error at `convert.ts:119-122` (mirrors the existing `--dry-run` incompatibility, same reason: gaps and standalone-deploy are contradictory).

**Phase 4 tests** (`IncrementalBaker.test.ts` has a stub-`BakerWorkingDB` seam recording `calls`/`applied`):
- forward-mode conversion with unhandled statements → `db.apply` never called (`expect(db.calls).not.toContain('apply')`), `mode: 'gap-no-bake'`, pgSQL contains gap comments.
- forward-mode conversion with `reconciliation.unaccounted > 0` (status `'converted'`, unhandled empty) → `mode: 'gap-no-bake'`, and in `runSplit` it is written `.needs-hand` + produces a non-zero exit (guards MAJOR-2's silent-`exit 0`).
- `db.apply` rejection → `BakeApplyError` with fileName + PG error, DB calls stop; `captureEntity` rejection → same.
- **baseline-with-hand-utilities fixture** (status `needs-hand-authoring`, baseline branch) → `mode: 'baked'`, NOT halted (guards MAJOR-3's baseline regression). *(New fixture — the existing baseline test uses a `'converted'` fixture and wouldn't catch this.)*
- re-bake mode behavior unchanged: gappy re-bake → `'preserved'` (existing test stays green).
- clean forward bake unchanged: apply → refresh → capture → assemble.

### Phase 5 — Validation against the real v5.49 set + regression

1. `packages/SQLGlotTS && npm run build && npm run test && python3 src/python/test_mj_postgres.py`; `packages/SQLConverter && npm run build && npm run test`; `packages/MJCLI && npm run build`.
2. **The three files, non-bake** (temporarily move their committed `.pg.sql` aside so discovery picks them up, `--dry-run` off, scratch output dir):
   - `Backfill_Missing_FK_Auto_Indexes` → 6 translated index guards, `unhandled: 0`, reconciliation clean. **[V]** Validate **behaviorally, not by text diff**: our 1a output is `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_indexes …) THEN CREATE INDEX … END IF; END $$;` while the committed counterpart uses native `CREATE INDEX IF NOT EXISTS` — **semantically equivalent (both idempotent), not textually identical**. Apply both to a fresh PG and diff the resulting indexes (names, columns, uniqueness). *(Optional refinement: emit native `CREATE INDEX IF NOT EXISTS` for the sys.indexes-guarded shape to match the committed convention — deferred unless the behavioral diff shows a reason.)*
   - `Fix_ConversationDetail_Sequence_Deadlock` → `.needs-hand` + non-zero exit + trigger listed (a human PG port using `pg_advisory_xact_lock` is genuinely required — the committed counterpart proves it). **[V]** Confirm the run **produces artifacts** (the file's `.needs-hand` + `conversion-gaps.report.json` + summary) and does not `this.error` with zero output — the specific regression 4e/Blocker-2 guard against.
   - `Agent_Conversation_Compaction` → `.needs-hand`, trigger + remaining unhandled itemized, **no** named-default statements among the gaps (1c fixed them), non-zero exit, artifacts present.
3. **Whole-ledger sweep**: the Phase 3 regression test over all of `migrations/v5` — reconciliation `unaccounted === 0` everywhere, and a status diff vs. the current converter to confirm no file silently changed category (expected diffs: exactly the RC2-affected file(s) escalating from `converted`-empty to `needs-hand-authoring`).
4. **Deterministic integration tier** (repo rule): `npm run test:integration`.
5. Bake-mode end-to-end (halt semantics, live PG working DB) is exercised at the next release build per the DEPLOYMENT.md Step 8 runbook — the unit seams above cover the logic; note this residual manual-verification step in the PR.

## Acceptance criteria (mapped to the issue's asks)

1. **"Fail loudly instead of silently"** — a dropped/untranslated statement can no longer produce a bare `;` (RC1b postcondition), a "no DDL to translate" marker over real DDL (Phase 3 marker guard), or a clean exit (reconciliation gate). Bake mode preserves the non-bake path's `.needs-hand` + itemized gaps + non-zero exit (Phase 4), including on working-DB apply failure.
2. **"Statement-count reconciliation"** — implemented end-to-end (dialect `dropped[]` → `ConversionReconciliation` → CLI summary + hard fail on `unaccounted > 0`).
3. **"Correct the misclassification"** — hand triggers are `hand-procedural` again (RC2a); a lone trigger can't flip a file into snapshot statement-mode (RC2b); statement-mode drops are printed and accounted (RC2c).

## Risks & mitigations

- **Heuristic change reroutes a legacy file** (2b): a pre-banner-era file whose only CodeGen content is `trgUpdate*` triggers would now stay banner-mode and flag `needs-hand`. Ledger sweep found no such file (trgUpdate triggers only appear in baselines — which carry vw/sp objects and keep statement-mode — or below banners); the Phase 5 status diff is the backstop.
- **Accounting mis-count** (1d/3): a missed intentional-drop site now shows up as a **soft** `ACCOUNTING-LEAK` gap on that file (per the Blocker-2 amendment — never a `raise`, never a zero-artifact crash). The safe direction is preserved (loud flag vs. silent loss) without the release-blocking abort the original hard-assert risked. The whole-ledger sweep in Phase 5 flushes real leaks out before merge.
- **`captureEntity` execution failure** (4c): scoped into `BakeApplyError`, so a working-DB capture failure also yields artifacts + a clean halt rather than a zero-artifact crash.
- **Block-less IF single-statement capture** (1a): T-SQL block-less IF governs exactly one statement; the `ELSE` bail-out plus the 1b report path means a mis-capture degrades to a *reported* gap, never a silent drop.
- **PG version sensitivity of the named-default error**: irrelevant post-fix — the construct is never emitted.

## Out of scope

- #3254's external content detector (`scripts/check-pg-migration-content.mjs`) — complementary outer gate, lives on its own branch.
- #3253 (the shipped v5.45 `Metadata_Sync` stub) — data remediation, separate issue.
- LLM last-mile auto-porting of `.needs-hand` gaps — future work per `SPLIT_AND_REGENERATE_PROPOSAL.md`.

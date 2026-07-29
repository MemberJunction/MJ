---
"@memberjunction/sqlglot-ts": patch
"@memberjunction/sql-converter": patch
"@memberjunction/cli": patch
---

fix(migrate-convert): stop `mj migrate convert` silently dropping statements and emitting empty PG migrations while reporting success (#3252)

The split-and-regenerate converter could emit empty or broken `.pg.sql` migrations while printing `unhandled stmts: 0` and exiting 0. Three independent root causes are fixed at the dialect, classifier, and bake-path layers:

- **RC1 — block-less `IF NOT EXISTS(...) CREATE INDEX ...;`** (the v5.49 FK-index shape) fell through to sqlglot, parsed as `exp.IfBlock`, and emitted a bare `;` with no gap reported. The `IF-EXISTS` envelope now captures a block-less guard's single governed statement (so `sys.indexes`/`columns`/`tables` guards translate to the same `DO $$ … pg_indexes … END IF $$` as the `BEGIN…END` form), an `exp.If`/`exp.IfBlock` guard plus an EMPTY-EMISSION postcondition report any node that renders to nothing instead of dropping it, and an inline named `DEFAULT` constraint (`CONSTRAINT [DF_x] DEFAULT (75)` — invalid PG) has its name stripped.

- **RC2 — a hand-written trigger classified as a CodeGen object and silently dropped** (the file reported a clean `converted` with empty T-SQL). The bare `trg` alternative was removed from the CodeGen-name convention (ledger-verified safe), and an unbannered file now requires a `vw*`/`sp*`/`fn*` object before flipping into statement-mode, so a lone trigger/index can't route a hand-authored file into the drop path.

- **RC3 — the `--bake-codegen` path applied gappy SQL to the working DB and crashed with zero artifacts.** Forward-mode baking now gates on conversion gaps before touching the working DB, the CLI halts at the first bake-mode gap with a guaranteed non-zero exit, forces a `.needs-hand` artifact for any gap, writes an artifact (never a bare error) on any failure, and rejects `--allow-gaps` together with `--bake-codegen`.

Adds a soft statement-accounting reconciliation: the dialect self-checks `parsed == emitted + unhandled + dropped` (surfacing an `ACCOUNTING-LEAK` gap, never raising), and each conversion carries a coarse source→output reconciliation that flags substantive T-SQL producing empty output. Validated by a full-ledger sweep over all 201 v5 migrations: zero crashes, zero accounting leaks, zero bare-`;` bodies, zero reconciliation false-positives.

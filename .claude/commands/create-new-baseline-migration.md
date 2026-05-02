# /create-new-baseline-migration

End-to-end deterministic baseline migration generator + validator.

This command drives the docker workbench from your local Claude Code session:
spins up the workbench (if needed), generates a baseline `B`-file from the
current V-stack end-state, applies it to a fresh DB, compares object-by-object
**and row-by-row**, and only stages the file in `migrations/` if the
comparison is byte-equivalent.

## Usage

```
/create-new-baseline-migration <baseline-version> [--dialect mssql|postgres] [--description <text>] [--keep-dbs] [--commit] [--row-compare full|hash|counts|none]
```

Where `<baseline-version>` is `Major.Minor` (e.g. `3.1`). The literal `X` is
appended in the filename (`B{YYYYMMDDHHMM}__v3.1.X__Baseline.sql`) because
patch versions never carry migrations.

## Execution plan

When invoked, Claude Code (the local instance) MUST follow this sequence:

### Phase 1 — Pre-flight

1. Use `TodoWrite` to lay out the phases of work below as a todo list so the
   user can see progress on a long-running operation.
2. Verify the user is on a clean working tree (`git status`); if not, ask
   whether to proceed or stash. Never overwrite uncommitted changes.
3. Determine the dialect:
   - If `--dialect` is provided, use it.
   - Otherwise read `mj.config.cjs` and use `dbPlatform` (default `mssql`).
4. Determine the next baseline version. If `--baseline-version` is not given,
   error and ask the user — version stamps are policy-relevant and shouldn't
   be guessed.

### Phase 2 — Workbench up

5. Check workbench status: `docker compose -f docker/workbench/docker-compose.yml ps`.
6. If not running, start it:
   - `docker compose -f docker/workbench/docker-compose.yml up -d` for mssql
   - With `--profile postgres` for postgres
7. Wait for the DB service health check to pass (poll `docker compose ps` for
   `(healthy)` on `sql-claude` or `postgres-claude`).

### Phase 3 — Run roundtrip inside workbench

8. Execute the roundtrip script inside the workbench, streaming output:
   ```
   docker compose -f docker/workbench/docker-compose.yml exec workbench \
     baseline-roundtrip \
     --dialect <DIALECT> \
     --baseline-version <VERSION> \
     --description "<DESCRIPTION>" \
     --row-compare <ROW_COMPARE> \
     [--keep-dbs]
   ```
9. The script (see `docker/workbench/baseline-roundtrip.sh`) runs all six
   phases: drop+create scratch DBs, apply V-stack, build baseline, apply
   baseline, introspect+compare, write reports. It uses `mj baseline build`
   and `mj baseline compare` (oclif + ora) so progress streams back live.

### Phase 4 — Inspect result

10. Read the report from `MJ/.workbench/baseline-compare-*.md` (most recent).
11. **If clean (exit code 0):**
    - Print the path to the generated baseline file (in `MJ/.workbench/`).
    - If `--commit` was passed:
      - Copy the baseline into `migrations/v{N+1}/` (mssql) or
        `migrations-pg/v{N+1}/` (postgres). Determine `N+1` by listing the
        existing `vN` dirs and incrementing.
      - `git add` the new file. **Do not commit** — let the user review the
        diff and commit themselves.
    - Otherwise: tell the user the file location and suggest they review and
      run again with `--commit` when satisfied.
12. **If diffs found:**
    - Read the JSON report and surface the top object diffs and (up to 5)
      row diffs in the chat.
    - Do NOT stage anything.
    - Suggest investigation steps:
      - Inspect specific objects with `mj baseline compare --left ... --right ... --ignore '<pattern>'`
        to narrow scope.
      - Check whether a recent migration introduced non-deterministic
        behavior (default values using `NEWID()`, `GETDATE()` without seeding,
        etc.).
      - Re-run with `--keep-dbs` so the user can inspect the scratch DBs
        manually.

### Phase 5 — Cleanup

13. Unless `--keep-dbs` was passed, the script already drops scratch DBs.
14. Print a final summary: baseline file path, report paths, status.

## Flags reference

| Flag | Default | Description |
| --- | --- | --- |
| `<baseline-version>` (positional) | required | `Major.Minor`; literal `X` is the patch component in the filename. |
| `--dialect mssql\|postgres` | `mssql` | Which DB engine to roundtrip against. |
| `--description "<text>"` | `MemberJunction Baseline` | Header text and filename description. |
| `--row-compare full\|hash\|counts\|none` | `full` | Row-comparison mode passed to `mj baseline compare`. |
| `--keep-dbs` | off | Don't drop the scratch DBs after run. |
| `--commit` | off | On clean run, copy the baseline file into `migrations/v{N+1}/` and `git add`. |

## What the comparator checks

Object-by-object: schemas, tables, columns (type, nullability, identity,
defaults), primary keys, unique constraints, check constraints, indexes
(columns, includes, uniqueness), foreign keys (columns, target, on-delete /
on-update), views (body), procedures (body), functions (body), triggers
(body), sequences (start/increment/cycle).

Row-by-row (`--row-compare full`): every row of every table, ordered by PK
(or all columns if no PK), value-by-value comparison with column-level diff
on mismatched rows. Excludes `flyway_schema_history` by default.

## Notes

- Workbench DB scratch names are fixed: `MJ_BL_Stack` (gold from V-stack)
  and `MJ_BL_New` (built from the new baseline). Don't reuse these names
  in development.
- Long runs (full row compare on a populated DB) can take several minutes.
  The oclif progress UX uses `ora-classic` spinners with per-phase counts;
  inside docker exec these stream as plain log lines.
- The PG roundtrip currently piggybacks on the MSSQL leg (it expects a
  T-SQL baseline already produced and runs it through `mj migrate convert`).
  A native PG-introspect path may follow.

## Implementation status — all green

- [x] `mj baseline build` (`packages/MJCLI/src/commands/baseline/build.ts`)
- [x] `mj baseline compare` (`packages/MJCLI/src/commands/baseline/compare.ts`)
- [x] `mj baseline roundtrip` (`packages/MJCLI/src/commands/baseline/roundtrip.ts`)
- [x] `packages/MJCLI/src/baseline/` core (introspector, data-dumper, emitter, comparator, report)
- [x] `docker/workbench/baseline-roundtrip.sh`
- [x] Workbench Dockerfile + .zshrc wiring
- [x] Vitest unit tests (util, emitter, comparator)
- [ ] End-to-end live integration verification (requires running the workbench against the actual MJ V-stack — first run is the proof)

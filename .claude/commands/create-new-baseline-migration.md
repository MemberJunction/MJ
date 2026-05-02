# /create-new-baseline-migration

> **STATUS: STUB / PROPOSAL.** This file describes the slash command we plan to ship. The underlying `mj baseline *` commands and `baseline-roundtrip.sh` workbench script don't exist yet — see `packages/MJCLI/src/commands/baseline/PLAN.md`.

End-to-end, prove-it-works baseline migration generator. Spins up the docker workbench (if not running), generates a baseline `B`-file from the current V-stack end-state, applies it to a fresh DB inside the workbench, compares object-by-object against the V-stack-built DB, and only writes the new baseline file to `migrations/` if the comparison is byte-equivalent.

## Usage

```
/create-new-baseline-migration [--dialect mssql|postgres] [--baseline-version <ver>] [--description <text>] [--keep-dbs] [--commit]
```

## What this command does (when implemented)

1. **Verify workbench is up.** If `docker compose -f docker/workbench/docker-compose.yml ps` shows the right service is not running, start it. For `--dialect postgres`, ensure the `--profile postgres` is active.
2. **Run roundtrip inside workbench.** `docker compose exec workbench baseline-roundtrip.sh --dialect <d> --baseline-version <v> --description <t>`.
3. **Stream progress.** The roundtrip script uses `mj baseline build|compare` (oclif + ora) — spinners and per-phase progress stream back to the local Claude Code session.
4. **Inspect result.**
   - If comparison is clean: print path to generated baseline file and diff report (`/workspace/MJ/.workbench/baseline-compare-<ts>.md`). If `--commit`, copy the baseline file into `migrations/v{next}/` on the host and stage it.
   - If comparison shows diffs: surface the failing objects, drop the user into a review prompt, do not stage anything. Suggest next steps (inspect the offending object's introspection vs. V-stack DDL).
5. **Cleanup.** Drop scratch DBs unless `--keep-dbs`.

## Flags

- `--dialect <mssql|postgres>` — defaults to `mssql` unless `mj.config.cjs` indicates otherwise.
- `--baseline-version <ver>` — the version stamp for the new B-file (default: derived from highest existing V-version + 1).
- `--description <text>` — human-readable name embedded in the filename and `flyway_schema_history` description.
- `--keep-dbs` — leave the two scratch DBs (`MJ_BL_Stack`, `MJ_BL_New`) in place for manual inspection.
- `--commit` — on success, place the new baseline `.sql` into `migrations/v{N+1}/` and `git add` it (does not commit; user reviews diff first).
- `--include-data <table-list>` — pass-through to `mj baseline build` for opt-in seed data.

## Implementation status

- [ ] `mj baseline build` command (oclif)
- [ ] `mj baseline compare` command (oclif)
- [ ] `mj baseline roundtrip` command (oclif)
- [ ] `packages/MJCLI/src/baseline/` core module (introspector, emitter, comparator, hasher)
- [ ] `docker/workbench/baseline-roundtrip.sh` script
- [ ] Workbench `Dockerfile` + `.zshrc` wiring
- [ ] This slash command's actual logic (replace this stub)
- [ ] Vitest unit tests + integration roundtrip on both dialects

See `packages/MJCLI/src/commands/baseline/PLAN.md` for the full plan.

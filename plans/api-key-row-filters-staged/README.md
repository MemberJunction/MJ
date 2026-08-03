# Staged migration — API-key row filters (Phase 2 input, NOT applied)

These files are **staged, not live**. They were originally committed under `migrations/v5/` /
`migrations-pg/v5/` / `.changeset/` on PR #3409, and CI's deterministic integration tier correctly
rejected that: applying the DDL without its CodeGen output leaves views/procs/EntityField metadata
mutually inconsistent (IT13 `api-keys.AK3` and IT36 `SE1/SE2/SE3/SE5` fail on
`INSERT INTO @ResultTable EXEC spCreate...` column-count mismatch, because the CI pipeline's
repeatable `R__RefreshMetadata` partially absorbs the new columns).

**A migration and its CodeGen output ship as one unit.** See `plans/api-key-row-filters.md` §8
Phase 2.

## Phase 2 activation checklist (implementation owner)

1. `git mv` the two `.sql` files back into place:
   - `V202608021623__v5.52.x__APIKey_Scope_RowFilterID.sql` → `migrations/v5/`
   - `V202608021623__v5.52.x__APIKey_Scope_RowFilterID.pg.sql` → `migrations-pg/v5/`

   Check the version segment against the then-latest migration (`v5.52.x` assumed `v5.51.x` was
   latest; renumber the timestamp AND version if the sequence has moved — see the ordering rule in
   `migrations/CLAUDE.md`).
2. Apply to a dev database, run `mj sync push`, then `mj codegen`.
3. Append the `CodeGen_Run_*.sql` output to the bottom of the T-SQL migration behind the required
   separator block (≥50 blank lines + generated-code banner — `migrations/CLAUDE.md`), delete the
   standalone CodeGen file, and regenerate/commit the PG counterpart for the combined content.
4. `git mv api-key-scope-row-filter-columns.md` → `.changeset/` (the "Check migrations" CI gate
   requires a minor changeset whenever `migrations/**` changes).
5. Commit the regenerated `MJCoreEntities` classes (now exposing `RowFilterID` on
   `MJAPIKeyScopeEntity` / `MJAPIApplicationScopeEntity`) — only then write TypeScript against the
   new fields.

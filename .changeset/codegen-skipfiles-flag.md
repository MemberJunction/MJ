---
"@memberjunction/cli": minor
"@memberjunction/codegen-lib": minor
---

feat(codegen): add `--skipfiles` flag for DB-only CodeGen runs

Adds the inverse of the existing `--skipdb` flag so CodeGen's database and file-generation phases can be driven independently:

- `mj codegen` → DB writes + file generation (existing default)
- `mj codegen --skipdb` → file generation only (existing)
- `mj codegen --skipfiles` → DB writes only (new)
- `mj codegen --skipdb --skipfiles` → both phases skipped (valid combination)

Useful for migration-dependent DB touch-ups, CI pipelines that only need SPs/views/permissions refreshed, and reset-and-rebuild scenarios where re-running file generation would conflict with stub files already on disk.

Also adds `skip_file_generation` (default `false`) to the CodeGen default settings, mirroring the existing `skip_database_generation` config key — so the behavior can be controlled from `mj.config.cjs` as well as the CLI.

Also fixes a pre-existing CLI bug: the `codegen` command was reading `this.flags.skipDb` (camelCase), which did not match the flag key `skipdb`, so `--skipdb` was always being passed as `undefined` from the CLI layer. Corrected to `this.flags.skipdb`.

Closes #2440

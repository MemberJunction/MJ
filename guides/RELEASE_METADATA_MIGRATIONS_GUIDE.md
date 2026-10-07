# Release Metadata Migrations

How metadata reaches a MemberJunction install, for MJ core and for every Open App. This guide states the model. The step-by-step recipe lives in one place per package, linked below, so it cannot drift.

## The model

**Install and upgrade run migrations only.** `mj migrate`, and `mj app install` / upgrade for Open Apps, run the package's migrations folder and nothing else. There is no "metadata phase", by design, and none should be added. A record that exists only as JSON under `metadata/` (or an app's other sync directories) is not on anyone else's database until a release materializes it as SQL.

**Individual PRs never ship metadata migration SQL.** A PR that changes metadata contributes the declarative JSON only: fields, `@lookup` / `@file` / `@parent` references, a `primaryKey` from `uuidgen`, and no `sync` block. Turning that JSON into SQL is a separate release-time step. So a PR that changes metadata JSON without a `*__Metadata_Sync.sql` file is correct, and neither human nor AI reviewers should flag the missing file as a defect.

**The build engineer produces one metadata migration per release.** It holds the net change relative to the last release, for MJ and for each Open App. One generation per release: split the file into parts only when it is too large for a single file, never into one delta per PR.

## The recipe

**MJ core:** [`DEPLOYMENT.md`](../DEPLOYMENT.md), **Step 3: Handle Metadata Changes**. That is the process the build engineer follows for every release.

**An Open App:** the app repo's own recipe, linked from its `CLAUDE.md` (for example bizapps-common's `migrations/README.md`, "Regenerating the metadata seed"). The shape matches core, a fresh database plus a logged `mj sync push`, but three steps differ, and the raw push log is **not** shippable as-is:

1. **Migrate the app's schema, not core.** Use `mj migrate --schema __mj_<App> --dir ./migrations` (most apps wrap it as `pnpm run mj:migrate`). Plain `mj migrate` migrates core.
2. **Hold back any unreleased `Metadata_Sync`** before migrating the generation database. Otherwise its records already match the JSON, the push emits nothing for them, and they end up in no migration.
3. **Fix the schema references in the log.** The SQL logger writes core stored-procedure calls as `${flyway:defaultSchema}`, which in an app migration resolves to the app's schema (`__mj_<App>.spCreateAction`, which does not exist). Core calls must become `${mjSchema}`, and the app's own procedure calls, logged as the literal schema name, must become `${flyway:defaultSchema}`. Every Open App seed shipped so far makes these two substitutions.

**CodeGen at release time:** not needed to generate the seed, because `mj migrate` on a fresh database already replays every `CodeGen_Run_*.sql`. Running `mj codegen` afterwards is an optional drift check: it should produce nothing, and any output means something is wrong.

## Diagnosing rows missing after a fresh install

Usually the cause is not the installer. Find the releases of the package that shipped no `Metadata_Sync` migration after the missing records were added. The fix is a new release of that package with its net metadata migration, owned by its build engineer. Say it that way: "vX.Y shipped without its metadata migration."

Do not propose an installer change or a workaround script.

**Check for a deliberate exception first.** Some apps leave specific directories out of their seed on purpose, for operators to push after install. Bizapps-caliber's `bundles/` and `task-types/` are an example, documented in the header of its seed migration. Missing rows from a directory like that are expected, and a post-install push is the documented step, not a workaround. Read the app's seed header and its `CLAUDE.md` before calling it a missed seed.

## Related

- [`DEPLOYMENT.md`](../DEPLOYMENT.md) Step 3 — the release recipe for MJ core
- [`metadata/CLAUDE.md`](../metadata/CLAUDE.md) §1b — metadata authoring rules for MJ core
- [Release Engineering Runbook](RELEASE_ENGINEERING_RUNBOOK.md) — the release operations themselves

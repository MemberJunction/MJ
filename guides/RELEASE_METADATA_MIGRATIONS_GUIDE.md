# Release Metadata Migrations

How metadata reaches a MemberJunction install, for MJ core and for every Open App. Short on purpose: Open App repos link here instead of copying it.

## The model

**Install and upgrade run migrations only.** `mj migrate`, and `mj app install` / upgrade for Open Apps, run the package's migrations folder and nothing else. There is no "metadata phase", by design, and none should be added. A record that exists only as JSON under `metadata/` (or an app's other sync directories) is not on anyone else's database until a release materializes it as SQL.

**Individual PRs never ship metadata migration SQL.** A PR that changes metadata contributes the declarative JSON only: fields, `@lookup` / `@file` / `@parent` references, a `primaryKey` from `uuidgen`, and no `sync` block. Turning that JSON into SQL is a separate release-time step. So a PR that changes metadata JSON without a `*__Metadata_Sync.sql` file is correct, and neither human nor AI reviewers should flag the missing file as a defect.

**The build engineer produces one metadata migration per release.** It holds the net change relative to the last release, for MJ and for each Open App.

## The build engineer's recipe

1. On a fresh database, install the **last published release**. For MJ core, migrate a clean database to that version. For an Open App, `mj app install` the app's last published release.
2. Run `mj migrate` to apply every migration merged since that release.
3. Run `mj sync push` for the package's metadata with SQL logging enabled. The log is exactly the net differential that made the database match the JSON.
4. Rename the log `V<UTC stamp>__v<next version>__Metadata_Sync.sql` and put it in the package's migrations folder. It ships with the release, and `mj migrate` applies it on install and upgrade.

**No CodeGen step.** Each developer's PR already carries its migration plus its CodeGen output (SQL and generated code), and CodeGen is idempotent, so rerunning it at release time is a wasted no-op.

One generation per release. Split the file into parts only when it is too large for a single file, never into one delta per PR.

## Diagnosing rows missing after a fresh install

The cause is not the installer. Find the releases of the package that shipped no `Metadata_Sync` migration after the missing records were added. The fix is a new release of that package with its net metadata migration, owned by its build engineer. Say it that way: "vX.Y shipped without its metadata migration."

Do not propose an installer change, a post-install `mj sync push` step, or a workaround script.

## Related

- [`metadata/CLAUDE.md`](../metadata/CLAUDE.md) §1b — metadata authoring rules for MJ core
- [Release Engineering Runbook](RELEASE_ENGINEERING_RUNBOOK.md) — the release operations themselves

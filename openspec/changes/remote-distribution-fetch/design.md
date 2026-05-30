## Context

> **Apply-phase correction (Skyway, not Flyway).** This design was written assuming Flyway. In reality MJ has replaced Flyway with its own engine `@memberjunction/skyway-core`, which **already** auto-selects the highest baseline (the `'1'` `BaselineVersion` sentinel) and subsumes every migration at/below that floor. So the run-set *selection* and baseline semantics are done in Skyway — the only genuine remaining work is the **fetch optimization** (download just the slice Skyway will run). Where this doc says "Flyway," read "Skyway"; **D3 (`ignoreMigrationPatterns`) is moot** — Skyway needs no missing-migration escape hatch because it disregards the omitted files by design.

`mj install` and `mj migrate` (package `packages/MJCLI`) today assume a zip-delivery model:

- `mj install` (`src/commands/install/index.ts`) calls `verifyDirs(GeneratedEntities, SQL Scripts, MJAPI, MJExplorer)` and **errors** if those directories are not already present in the working directory. It is a post-extraction bootstrapper: npm install/link, write `.env`, rename `SQL Scripts/generated/MJ_BASE → <db>`, run CodeGen, patch MJExplorer env files. It never fetches anything.
- `mj migrate` (`src/commands/migrate/index.ts` + `src/config.ts:getFlywayConfig`) defaults to `filesystem:./migrations`. With `--tag`, it `git clone --sparse --depth=1 --branch <tag>` the canonical repo into a temp dir, `sparse-checkout set migrations`, and points Flyway at it — pulling **all** ~93 MB of migration SQL regardless of how many migrations actually need to run.

The delivered zip (`Distributions/MemberJunction_Code_Bootstrap.zip`, built by `CreateMJDistribution.js`) is force-committed every release. It is ~98% migrations (93 MB) and ~1.8 MB code. Migration history already has self-contained Flyway baselines being produced (`B`-prefixed: `migrations/v3/B…__v3.0_Baseline.sql`, v4, v5, plus a `migrations-pg/` postgres track) via the `create-new-baseline-migration` command and `baseline-roundtrip` workbench. A `B`-baseline is a complete STRUCTURE + metadata snapshot with zero dependency on prior scripts.

Constraints:
- The canonical repo (`git@github.com:MemberJunction/MJ.git`) remains the source of truth and keeps full history. Origin `HEAD` is `next`; `main` also exists.
- No `any` types; functions small and single-purpose; bound every loop; surface side effects (this is a network/FS/process-heavy command surface).
- Baseline *production* is out of scope — this design only *consumes* baselines.

## Goals / Non-Goals

**Goals:**
- Make `mj install` stand up a fresh instance by fetching code from the canonical repo at a ref, with no zip and no pre-extracted files.
- Make `mj migrate` fetch only the migration slice it needs: most-recent baseline ≤ target plus the `V`-tail after it (fresh DB), or only migrations newer than the DB's current version (existing DB).
- Default both commands to the latest version invariant; allow `--tag vX.Y.Z` to pin.
- Provide `mj bundle` for on-demand, never-committed zip generation (offline/air-gapped).
- Remove `CreateMJDistribution.js`, the committed zip, and the release step that commits it.

**Non-Goals:**
- Generating or validating `B`-baseline scripts (already handled by `create-new-baseline-migration`).
- Changing Flyway's migration ordering/semantics or the migration file contents.
- Changing how npm packages (`@memberjunction/*`) are versioned/published.
- A general-purpose offline mirror/proxy beyond `mj bundle`.

## Decisions

### D1 — Fetch via git partial clone (`--filter=blob:none`), not full sparse clone or tarball
A single shared helper performs: `git clone --filter=blob:none --no-checkout --depth=1 --branch <ref>` into a temp dir, then `sparse-checkout set <explicit file/dir list>`, then `checkout`. `--filter=blob:none` defers blob download until checkout, so only the blobs for the selected paths come over the wire.
- *Why over today's `--sparse` full clone*: that still downloads every blob in the sparse cone; for migrations that is the whole 93 MB. Blobless partial clone is what makes the baseline slice cheap.
- *Why over the GitHub tarball/archive API*: tarball is whole-ref or nothing and can't express "files after version N"; partial clone lets us resolve the tree cheaply and pull an arbitrary file subset. Keeps one mechanism for both install (dir subset) and migrate (file subset).
- *Fallback*: if the server/git lacks partial-clone filter support, fall back to `--sparse --depth=1` (today's behavior). Detected by clone failure, logged explicitly.

### D2 — Migrate fetches `[most-recent B ≤ target] + [V-tail > baseline]`, and lets Flyway do the skipping
The fetch helper lists `migrations/v*/` (or `migrations-pg/v*/`) at the target ref via `git ls-tree`, selects the latest `B*` baseline, then adds every `V*` file that sorts after it. Two bounds, two mechanisms: the **git ref caps the top** (only migrations existing at/below the target are present in the tree) and the **latest baseline caps the bottom**. Ordering and "latest baseline" use Flyway's version key — the numeric `<timestamp>` token in `B<timestamp>__…` / `V<timestamp>__…` filenames — **not** the human-readable `vX.Y` tag, which lives in the description. Because the baseline command stamps a baseline at "last consolidated V timestamp + 1 minute," the latest baseline reliably sorts after the stack it replaces and before the tail. A correct numeric-per-component compare is needed so `…2.100` sorts after `…2.96` (timestamps are already monotonic, but the principle holds for any version key). Flyway then applies the correct subset by its own rules:
- *Fresh/empty DB*: Flyway runs the `B`-baseline (highest ≤ target) then the `V`-tail — exactly the fetched set.
- *Existing DB already past the baseline*: Flyway ignores the `B` and skips already-applied `V`s.
- *Why fetch from the baseline rather than reading the DB first*: one fetch rule is correct for both regimes and needs no DB round-trip before cloning. The baseline slice is already small (a baseline + a short tail), so the simplicity is worth it.
- *Optional refinement (existing DBs)*: read `flyway_schema_history`'s current version first and fetch only `V > current`, trimming the baseline + intermediate files an up-to-date DB doesn't need. Deferred to a later phase; not required for correctness.
- *Legacy v2*: `migrations/v2/` has no `B`-baseline, so a v2.x target fetches the full v2 history. Acceptable — v2 is legacy and baselines exist from v3.

### D3 — Flyway validation must tolerate absent older migrations
When fetching only a slice, files for already-applied or pre-baseline migrations are absent on disk. Flyway's default `validate` errors on "applied migration not resolved locally." Set `ignoreMigrationPatterns` (e.g. `*:missing`) in the Flyway config so a sliced local set does not fail validation, while still validating the migrations that *are* present.
- *Risk-bearing*: this loosens checksum drift detection for missing files; the `baseline-roundtrip` validator remains the guard that baselines faithfully reproduce the V-stack.

### D4 — "Latest version invariant" = `main`, resolved-and-pinned at install
The default target when no `--tag` is given is the `main` branch tip. `main` is the **published-code** branch; `next` is the integration/default branch where new work lands before being merged to `main` for a release — so `next` is deliberately *not* a default install/migrate target. The branch is configurable (`mjRepoBranch`, default `main`). `mj install` resolves `main` to the concrete version it actually fetched and writes it into `mj.config.cjs`, so subsequent `mj migrate` runs target the same version as the installed code rather than independently drifting to the newest tip.
- *Why pin at install*: code (npm packages + source) and schema (migrations) must come from one consistent point; an unpinned migrate could otherwise apply migrations ahead of the installed code.
- *Bare `mj migrate` on an existing instance* still defaults to latest (`main`), which is the desired "bring me current" behavior; the pin only governs the install-time consistency contract.

### D5 — Install reuses git's tracked-file set instead of re-deriving ignore patterns
Install sparse-checks-out the code directories (`MJAPI`, `MJExplorer`, `GeneratedEntities`, `GeneratedActions`, `SQL Scripts`) and relies on the fact that the canonical repo does not track `node_modules/`, `dist/`, or generated output (they are gitignored). This deletes the entire class of ignore-pattern bugs that `CreateMJDistribution.js` carried (the v2.118 breakage came from feeding `.gitignore` lines into `archiver`). Per-file exclusions still needed (e.g. `SQL Scripts/generated/**`, kendo license) are expressed as sparse-checkout negative patterns, not archiver globs.

### D6 — `mj bundle` wraps the existing distribution logic as an on-demand command
Port `CreateMJDistribution.js` into `src/commands/bundle/index.ts`. It can bundle from a ref (fetch-then-zip) or from the local working tree, write to a user-specified path, and is never committed. This preserves offline/air-gapped delivery without the committed binary or the CI commit step.

### D7 — Dialect-aware paths from config
The fetch helper chooses `migrations/` vs `migrations-pg/` and the baseline filename convention from `dbPlatform`/`dbPlatform`-equivalent in `mj.config.cjs`, so the same logic serves mssql and the emerging postgres track.

## Risks / Trade-offs

- **Network required at install/migrate by default** → `mj bundle` provides an offline path; document it as the air-gapped install route.
- **Flyway validation on existing pre-baseline DBs** (D3) → `ignoreMigrationPatterns: *:missing`; rely on `baseline-roundtrip` for baseline fidelity.
- **Partial-clone support assumptions** (D1) → explicit fallback to `--sparse --depth=1`; log which path was taken.
- **Temp-dir leak**: current `mkdtempSync(tmpdir())` is never cleaned up and `mkdtempSync(tmpdir())` lacks a trailing separator (creates siblings of the tmp dir). Fix: use a prefixed mkdtemp and remove the dir in a `finally` on every exit path.
- **Code/migration version drift** (D4) → resolve-and-pin at install; bare migrate tracks latest intentionally.
- **`main` vs `next` mismatch** → Open Question; wrong default would install unreleased code.
- **Reduced on-disk forensics**: a fresh install no longer carries the full migration history locally → acceptable; canonical repo is the record, and `flyway_schema_history` is the applied-state source of truth.

## Migration Plan

1. **Phase 1 (free win, lowest risk)**: baseline-aware partial fetch in `mj migrate` (D1, D2, D3) + temp-dir cleanup fix. Install-from-zip still works unchanged.
2. **Phase 2**: `mj install` remote fetch (D1, D5), default-latest + resolve-and-pin (D4), dialect awareness (D7).
3. **Phase 3**: `mj bundle` (D6).
4. **Phase 4**: remove `CreateMJDistribution.js`, the committed `Distributions/*.zip`, the `Distributions/.gitignore` un-ignore rule, and the CI "Update distribution zip" step.

Rollback: phases 1–3 are additive/behind flags and revert cleanly via git. Phase 4 is the only lossy step; the zip and `CreateMJDistribution.js` can be restored from history, and `mj bundle` reproduces the artifact regardless.

## Resolved

- **Default branch = `main`** (published code). `next` is integration-only and never a default install/migrate target. (D4.)
- **Scope = all four phases** will be implemented; the existing-DB `V > current` trimming (D2 refinement) is in scope, not deferred.

## Open Questions

- Where exactly should the resolved/pinned version live in `mj.config.cjs` (new top-level field vs. extending `migrationsLocation` semantics)?
- Does the postgres track (`migrations-pg/`) use the same `B`/`V` filename version grammar the selector parses, or does it need dialect-specific parsing?

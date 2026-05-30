<!-- APPLY NOTE: MJ replaced Flyway with `@memberjunction/skyway-core`, which ALREADY
     auto-selects the highest baseline and subsumes every migration at/below it. So run-set
     SELECTION is done in Skyway; the genuine remaining work here is the FETCH optimization —
     download only the slice Skyway will run. Some Flyway-era tasks became no-ops / moved to
     the install phase (annotated). -->

## 1. Shared remote-fetch helper

- [x] 1.1 Added `packages/MJCLI/src/lib/migration-fetch.ts` — `fetchMigrationSlice` does `git clone --filter=blob:none --no-checkout --depth=1 --branch <ref>`, `sparse-checkout set --no-cone <selected>`, `checkout`, returns temp dir + `cleanup`
- [x] 1.2 `resolveGitRef`: semver `X.Y.Z`/`vX.Y.Z` → `vX.Y.Z` tag; non-semver (`main`) → branch unchanged. (Default-latest "no tag → branch tip" wiring deferred to install/pinning — see 2.5.)
- [x] 1.3 Fallback to `--sparse --depth=1` full clone when blobless partial clone is rejected (`tryPartialClone`→`fullSparseClone`), surfaced via `usedFallback` + verbose log
- [x] 1.4 Temp-dir cleanup via `cleanup()` in migrate's `finally` (and on the helper's own error); prefixed `mkdtemp('mj-migrations-')` instead of bare `mkdtempSync(tmpdir())`
- [x] 1.5 Added `mjRepoBranch` (default `main`) to both config schemas + `DEFAULT_CLI_CONFIG`
- [x] 1.6 Version key = numeric `<timestamp>` token via the shared `parseMigrationFilename` (reused from `baseline/util`); 12-digit timestamps compare correctly as strings

## 2. Migrate baseline-aware fetch (Phase 1 — free win)

- [x] 2.1 `selectMigrationSlice`: from the `git ls-tree` path list, run set = highest baseline `B*` + every `V` after it + all `R` repeatables; no baseline (legacy v2) → full versioned history
- [x] 2.2 Dialect-aware off `dbPlatform` (`migrations/` vs `migrations-pg/`) in `fetchMigrationSlice`
- [x] 2.3 Wired `migrate` to pre-fetch the slice and hand the temp dir to `getSkywayConfig` (replacing the all-migrations `--tag` clone)
- [~] 2.4 N/A — Skyway's resolver natively subsumes everything at/below the baseline floor, so a sliced local set does not trip validation; no `ignoreMigrationPatterns` equivalent needed
- [ ] 2.5 DEFERRED to install phase — flipping bare `mj migrate`'s default from `filesystem:./migrations` to remote-`main` is unsafe until `install` pins the version into `mj.config.cjs` (would break monorepo devs otherwise). Belongs with `cli-remote-install`
- [~] 2.6 Largely redundant — Skyway already skips applied migrations; trimming the FETCH to `V > current` needs a pre-clone DB round-trip for marginal bytes over an already-small slice. Optional follow-up
- [x] 2.7 Tests (`src/__tests__/migration-fetch.test.ts`): highest-baseline+tail, target-between-baselines, legacy-v2 no-baseline, repeatables always included, non-migration files excluded, `resolveGitRef`

## 3. Install remote fetch (Phase 2)

- [ ] 3.1 Replace `verifyDirs` precondition in `install/index.ts` with a remote fetch of `MJAPI`, `MJExplorer`, `GeneratedEntities`, `GeneratedActions`, `SQL Scripts` via the shared helper
- [ ] 3.2 Express install-time exclusions as sparse-checkout negative patterns (`SQL Scripts/generated/**`, kendo license) — do NOT re-derive `.gitignore`-style globs
- [ ] 3.3 Default install to the latest version invariant; honor `--tag`
- [ ] 3.4 After fetch, resolve-and-pin the concrete version into `mj.config.cjs`; make `migrate` read that pin
- [ ] 3.5 Keep the existing bootstrap sequence (npm install/link, env files, MJ_BASE rename, CodeGen) unchanged after the fetch
- [ ] 3.6 Emit a clear, actionable error when the canonical repo is unreachable, pointing to `mj bundle`
- [ ] 3.7 Tests: empty-dir fresh install fetch, generated dirs absent, network-failure error path, pin written + consumed by migrate

## 4. `mj bundle` command (Phase 3)

- [ ] 4.1 Create `packages/MJCLI/src/commands/bundle/index.ts` porting the `CreateMJDistribution.js` zip logic into the CLI
- [ ] 4.2 Support `--tag`/latest ref source (fetch-then-zip) and local-working-tree source, with `--out` path; never commit output
- [ ] 4.3 Support optionally including the baseline-plus-tail migration slice so air-gapped `mj migrate` can run offline
- [ ] 4.4 Tests: bundle from ref, bundle latest, extract-then-install round-trip succeeds offline

## 5. Remove the committed distribution artifact (Phase 4)

- [ ] 5.1 Delete `CreateMJDistribution.js` and any root scripts/`package.json` entries that invoke it
- [ ] 5.2 Remove the committed `Distributions/MemberJunction_Code_Bootstrap.zip` and the `!MemberJunction_Code_Bootstrap.zip` un-ignore rule in `Distributions/.gitignore`
- [ ] 5.3 Remove the CI "Update distribution zip [skip ci]" release step that regenerates and commits the zip
- [ ] 5.4 Update install/onboarding docs to reference `mj install` (online) and `mj bundle` (offline) instead of downloading the zip

## 6. Verification

- [x] 6.1 `tsc --noEmit` clean (exit 0), `eslint` clean, and unit tests green (24 passed: 15 `getSkywayConfig` + 9 `migration-fetch`) — no `any`, no new warnings, in changed files. (Full `npm run build` of the whole MJCLI package additionally requires the workspace dep chain, which CI builds.)
- [ ] 6.2 End-to-end: fresh `mj migrate` against an empty DB using a baseline'd version (e.g. v3+) — requires a live DB; manual/CI, not run here
- [ ] 6.3 End-to-end: `mj migrate` one-version upgrade fetches only the tail — requires a live DB; manual/CI
- [ ] 6.4 End-to-end: `mj bundle` → extract → offline `mj install` + `mj migrate` — belongs to Phases 2–3 (install + bundle)
- [ ] 6.5 Confirm repo no longer tracks a distribution zip and history growth per release is eliminated — Phase 4 (zip removal)

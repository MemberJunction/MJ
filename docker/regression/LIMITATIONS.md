# Regression Suite — Known Limitations & Follow-up Work

Living tracker of every known gap, workaround, and "we'll come back to it" item surfaced while building out the generalized regression suite (variable templating, suite-level context, fresh BrowserContexts, archive flow, BYO Mode D).

**How to use this file:** when you hit something that doesn't work the way you'd expect, look here first. If it's a known issue, the workaround is documented. If it's not, add it here so the next person isn't surprised.

Severity:
- **P0** — blocker for a real use case, should be fixed before broad adoption
- **P1** — affects ergonomics or correctness in specific scenarios; workable today
- **P2** — papercut; nice to fix when touching the area
- **P3** — documentation / clarification only

---

## 1. Variable templating (Phase 1A)

### 1.1 `MJ_TEST_VAR_*` env-var fallback is a workaround for not having a TestType `VariablesSchema`
**Severity:** P2

The proper TestingFramework `VariableResolver` requires a `VariablesSchema` declared on the `TestType` to expose `--var name=value` CLI flags through the resolver. Today the Computer Use test type has no schema, so we fall back to reading `MJ_TEST_VAR_*` env vars in [variable-substitution.ts](../../packages/AI/MJComputerUse/src/utils/variable-substitution.ts).

**Workaround:** set `MJ_TEST_VAR_baseUrl=...` env vars on the test-runner (the docker compose overlay does this for BYO).

**Suggested fix:** add a `VariablesSchema` to the Computer Use TestType metadata declaring the standard set (`baseUrl`, `authUsername`, `authPassword`, `allowedDomains`, etc.). Then `--var` flags flow through the resolver normally; env-var fallback can stay for the no-schema case.

### 1.2 No conditionals or defaults in placeholders
**Severity:** P3

`{{baseUrl}}` resolves to the value or remains literal if undefined. There's no `{{baseUrl|default:http://localhost:4200}}` syntax.

**Workaround:** the test-runner entrypoint sets defaults via env vars (so unset variables get a real value before substitution runs).

**Suggested fix:** add Mustache-style `{{var|default:foo}}` to [variable-substitution.ts](../../packages/AI/MJComputerUse/src/utils/variable-substitution.ts) when an actual use case calls for it.

---

## 2. Suite-level application context (Phase 1B)

### 2.1 Token cost — `applicationContext` sent on every controller step
**Severity:** P2

A 500-token context across a 30-step × 25-test suite adds ~375K tokens per run. Anthropic's prompt caching (already used by Computer Use) should amortize this to once-per-run instead of once-per-step, but that's an assumption we haven't measured in production.

**Workaround:** keep `applicationContext` focused on facts that save steps (navigation landmarks, common gotchas), not exhaustive app documentation.

**Suggested fix:** measure real-world cache hit rate via `AIPromptRun.TokensPrompt` vs. `TokensCompletion` over a few runs. If cache hit rate is low, consider one-shot context delivery (first step only) or moving context into a separate cached-system-prompt slot.

### 2.2 No per-test override audit
**Severity:** P3

Tests can override or append context via `InputDefinition.applicationContext`, concatenated under a `## Test-specific Notes` heading. None of the 25 existing MJ tests use this yet.

**Suggested fix:** if a few MJ tests start needing per-test notes, document the pattern in `metadata/tests/regression/README.md`.

---

## 3. Browser context isolation (Phase 1C)

### 3.1 Storage-state cache captures cookies + ALL localStorage wholesale
**Severity:** P2

[`HeadlessBrowserEngine.GetIsolated` / `ReleaseIsolated`](../../packages/AI/ComputerUse/src/browser/HeadlessBrowserEngine.ts) captures the full `context.storageState()` and replays it into the next test's context. That includes:

- Auth tokens (Auth0, MSAL, etc.) — what we want to preserve
- App-specific localStorage entries set by the previous test — leaks across tests

For most cases this is fine because tests rarely mutate localStorage in load-bearing ways. But it's not strict isolation.

**Workaround:** none today. Tests in the same worker can technically observe each other's localStorage writes.

**Suggested fix:** filter `storageState` to only auth-related keys (reusing the regex set from `ResetStatePreservingAuth` in [SharedContextBrowserAdapter.ts](../../packages/AI/ComputerUse/src/browser/SharedContextBrowserAdapter.ts)).

### 3.2 Token expiry detection is reactive, not proactive
**Severity:** P1 for very long suites

If an Auth0 token TTL expires mid-suite (typical TTL = 1h), the next test using the cached `storageState` will land on the Auth0 login screen. The test will fail with a goal-completion error before the runner notices the auth issue. Subsequent tests in the same worker continue to use the bad cache.

**Workaround:** keep suites under the token TTL, OR call `HeadlessBrowserEngine.Instance.InvalidateStorageState(workerKey)` manually if a test starts failing due to auth.

**Suggested fix:** add a probe to the engine's first navigation — if it detects the URL pattern `*/login` or `*/oauth/authorize` despite injected state, call `InvalidateStorageState` and re-run the test once. Mostly a per-test cost; should be visible in the report.

### 3.3 No automated audit of MJ tests for cross-test continuity dependencies
**Severity:** P1 — before flipping the default for the MJ regression suite

The plan called for auditing the 25 existing MJ regression tests to confirm none rely on cross-test state before flipping the default. The flip is in place for BYO (which is self-contained by design), but the MJ tests haven't been audited.

**Workaround:** tests that need shared state can set `Configuration.browserSession: "shared:suite"` to opt back into the legacy mode.

**Suggested fix:** quick audit of each test's goal text + expected outcomes. Most are likely self-contained (the current `ResetStatePreservingAuth` already nukes most cross-test state). If any depend on continuity, either rewrite to self-contain OR set the opt-in.

### 3.4 BYO suite overhead — ~7s pure cost when there's no auth
**Severity:** P3

For a 2-test BYO suite with no Auth0, the isolated-context overhead (~100ms × 2 contexts created + state captured) is pure cost since there's no auth replay to compensate. Wall-clock went from 81s (Phase 1A) → 101s (Phase 1A+1B+1C).

**Workaround:** none needed. Phase 1B (suite context) provides offsetting wins for non-trivial tests. For auth-heavy suites like MJ Explorer, the storage-state replay should net out positive.

**Suggested fix:** measure real performance on the MJ regression suite (25 tests, parallel × 4 workers ≈ 6+ tests per worker) once enabled. If the win materializes as projected (10–15s × tests-per-worker), document the projection. If not, consider auto-detection (if no auth bindings configured for the target, fall back to `new-clean` mode and skip the storage capture overhead).

### 3.5 Legacy `shared:*` modes still callable; only a one-time deprecation warning
**Severity:** P3

`browserSession: "shared:suite"` / `"shared:global"` / arbitrary string keys still work and fire a one-time `console.warn`. No removal timeline.

**Suggested fix:** once the MJ suite audit (§ 3.3) confirms no test needs shared mode, hard-deprecate (throw on opt-in unless an explicit `MJ_ALLOW_SHARED_BROWSER=1` env var is set). After a release with that gate, remove `SharedContextBrowserAdapter.ResetStatePreservingAuth` and the shared-mode code paths entirely.

### 3.6 `ResetStatePreservingAuth` heuristic could nuke custom auth schemes
**Severity:** P3 (only matters if you opt back into shared modes)

The regex set in [SharedContextBrowserAdapter.ts](../../packages/AI/ComputerUse/src/browser/SharedContextBrowserAdapter.ts) preserves localStorage keys matching `@@auth0spajs@@`, `msal.`, `okta-`, `access[_-]?token`, etc. Apps using custom auth schemes (e.g. `acmeAuth.session`) would get nuked between tests.

**Workaround:** add custom patterns; or use `browserSession: "new"` (the new default) which doesn't run this heuristic at all.

---

## 4. MetadataSync — `mj sync pull` / `push` (Phase 2 + 3)

### 4.1 `externalizeFields` writes UTF-8 base64 text, never binary
**Severity:** P1 for archive viewing; P3 for round-trip

[`FieldExternalizer.writeExternalFile`](../../packages/MetadataSync/src/lib/FieldExternalizer.ts) always calls `fs.writeFile(path, content, 'utf8')`. A `TestRunOutput.InlineData` containing a base64-encoded PNG ends up as a `.png` file that's actually a base64 *text* file. You can't double-click it to view; `file` reports "ASCII text". Push reads it back as UTF-8 text and round-trips the same base64 to the DB, so data is preserved.

**Workaround:** for viewing screenshots, use the per-run `test-results/run-*/screenshots/` directory (binary PNGs, produced by [extract-screenshots.cjs](scripts/extract-screenshots.cjs) which decodes base64 to binary). The archive `.inlinedata.md` / `.png` files are for **storage and round-trip**, not direct viewing.

**Suggested fix:** add a config option `binaryEncoding: "base64"` on `externalizeFields` that triggers `fs.writeFile(path, Buffer.from(value, 'base64'))`. Push reads the binary back and re-encodes when assigning to the field.

### 4.2 `{TestRunID}` placeholder resolves to literal `parentid` because foreign-key fields are pre-replaced with `@parent:ID`
**Severity:** P2

In the archive pull config we use `pattern: "@file:screenshots/{TestRunID}/{ID}.png"`. The `{TestRunID}` placeholder is supposed to be the parent TestRun's UUID so screenshots land in per-test subdirectories. Instead, the pull replaces `TestRunID` with the literal string `@parent:ID` *before* externalization runs, and the externalizer sanitizes that to `parentid`.

Result: all screenshots from all tests land in `screenshots/parentid/`. Filenames remain unique (`{ID}.png` is the TestRunOutput's UUID) so **no data loss**, but the grouping by test is gone.

**Workaround:** none — the flat structure works for archive purposes.

**Suggested fix:** in [`RelatedEntityHandler.ts`](../../packages/MetadataSync/src/lib/RelatedEntityHandler.ts), run externalization on the raw entity record (with original UUID values) *before* the `@parent:ID` substitution pass. Or expose the parent's UUID under a different placeholder name (e.g. `{__parent.ID}`) that survives the replacement.

### 4.3 Pull captures view-joined virtual fields that aren't writable on push
**Severity:** P2

When pulling `MJ: Test Suite Runs`, the underlying view (`vwTestSuiteRuns`) includes joined denormalized fields like `Suite` (from `SuiteID` → `MJ: Test Suites.Name`), `RunByUser`, etc. The pull writes these into the JSON `fields` block. On push, `mj sync push` rejects them with "Field X is a read-only or system field and cannot be set" because they don't exist as writable columns on the underlying table.

**Workaround:** manually configure `excludeFields` per entity in the pull config. The archive config does this for every joined column on TestSuiteRun, TestRun, and TestRunOutput. See [archive/test-suite-runs/.mj-sync.json](archive/test-suite-runs/.mj-sync.json).

**Suggested fix:** push-side auto-filter: silently skip fields the destination entity marks as `IsVirtual = 1` or `AllowUpdateAPI = 0`. Currently they're hard errors; making them warnings + skip would remove the need for the manual `excludeFields` list.

### 4.4 Push prompts interactively on validation errors — hangs in non-TTY containers
**Severity:** P2

When `mj sync push` encounters validation errors, it prints `Validation failed with errors. Do you want to continue anyway? (y/N)` and waits for stdin. In the test-runner container (no TTY) this hangs until the runner is killed.

**Workaround:** pass `--ci` to `mj sync push` (does not prompt; fails on validation errors instead). The Phase 3 entrypoint uses this.

**Suggested fix:** auto-detect non-TTY (`!process.stdout.isTTY`) and treat as `--ci` mode by default. Interactive mode is a developer-machine convenience that should be opt-in, not opt-out.

### 4.5 `MJ_CONFIG_FILE` env-var override was missing
**Severity:** Resolved in Phase 2

Status: **fixed** in [config-manager.ts](../../packages/MetadataSync/src/lib/config-manager.ts). When `MJ_CONFIG_FILE` is set, `loadMJConfig` calls `cosmiconfigSync('mj').load(path)` instead of `.search(cwd)`. The archive pull/push uses this to swap providers between same-process commands without disturbing the local `mj.config.cjs`.

### 4.6 `filePattern: ".*.json"` matches `.mj-sync.json` itself
**Severity:** P3

If a `.mj-sync.json` entity config has `filePattern: ".*.json"` (which matches *any* dot-prefixed JSON), the entity-config file itself gets picked up as a record file and fails parsing.

**Workaround:** use a more specific pattern like `**/.*.json` (the canonical MJ convention — matches dot-prefixed JSONs in subdirectories but skips the config file at the entity-config level), OR a tighter prefix like `.T*.json` for test records.

**Suggested fix:** mj-sync could explicitly exclude `.mj-sync.json` files from being treated as records. Minor papercut.

### 4.7 Pulled metadata requires writable mount (mj-sync writes back `primaryKey` + `sync` blocks)
**Severity:** P3

After `autoCreateMissingRecords`, mj-sync writes auto-generated `primaryKey` and `sync` blocks back to the source JSON files. If the source is bind-mounted as `:ro`, the push fails with `EROFS: read-only file system`.

**Workaround:** mount the metadata directory as RW (not `:ro`). The BYO overlay does this.

**Suggested fix:** could buffer the `primaryKey`/`sync` updates to a side-file (e.g., `.mj-sync-state.json`) so source files can stay read-only. Or add a `--no-write-back-state` flag.

### 4.8 Metadata layout requires canonical 2-level structure
**Severity:** P3

mj-sync expects `<root>/<entity-subdir>/<records>.json` with `.mj-sync.json` configs at both levels. A flat layout (`<root>/.mj-sync.json` + `<root>/.records.json` at the same level) fails with `No entity directories found`.

**Workaround:** match the canonical layout — see [docker/regression/examples/bring-your-own-app/byo-metadata/](examples/bring-your-own-app/byo-metadata/) for a working example.

**Suggested fix:** detect single-entity layouts and treat the root as the entity dir directly when there are no subdirs.

### 4.9 Entity names must use `MJ:` prefix in mj-sync configs
**Severity:** P3

`{"entity": "Tests"}` silently succeeds but doesn't push records (or pushes to the wrong entity). `{"entity": "MJ: Tests"}` is correct.

**Workaround:** always use the full prefixed name. See [packages/MJCoreEntities/src/generated/entity_subclasses.ts](../../packages/MJCoreEntities/src/generated/entity_subclasses.ts) for canonical names.

**Suggested fix:** mj-sync could fuzzy-match entity names and warn (not silently succeed) when the name doesn't exactly match a registered entity.

---

## 5. Test-runner / Docker stack

### 5.1 `--abort-on-container-exit` and `--exit-code-from` abort the whole stack on `db-setup` clean exit
**Severity:** P2

The plan's original invocation used `docker compose up --abort-on-container-exit --exit-code-from test-runner`. But `db-setup` is a one-shot init container — it exits cleanly when done. `--abort-on-container-exit` treats that as "a container exited" and tears down everything before `test-runner` can run.

**Workaround:** use `docker compose up -d` + `docker compose wait test-runner` to track only the runner's lifecycle.

**Suggested fix:** the BYO README's "Run the BYO suite" command documents the working pattern. A new `mj test regression remote` CLI command (Phase 4) should encode this pattern so users don't have to think about it.

### 5.2 Compose relative paths in overlay files resolve from the first `-f` file's directory
**Severity:** P2

When running `docker compose -f base.yml -f overlay.yml`, relative paths inside `overlay.yml` resolve relative to the directory of `base.yml`, NOT the overlay's own location. Cost me 30 minutes of "file not found" debugging.

**Workaround:** all paths in BYO's [docker-compose.app.yml](examples/bring-your-own-app/docker-compose.app.yml) are written relative to `docker/regression/` (the first `-f` file's directory) — not relative to the overlay's own location.

**Suggested fix:** documentation — flag this prominently in the BYO README and the Phase 4 CLI integration. Compose doesn't expose a flag to change this behavior.

### 5.3 `cd` inside Bash tool changes persistent shell cwd; affects subsequent commands
**Severity:** P3 (developer workflow papercut)

Running `cd packages/X && npm run build` changes the working directory for *all* subsequent shell commands in the same session. Easy to forget after a long build sequence, and the next `docker compose --env-file docker/regression/.env.test` fails with `couldn't find env file`.

**Workaround:** always use absolute paths or `cd` back to repo root after building.

**Suggested fix:** documentation.

### 5.4 Form generator must run once per fresh clone (not auto-triggered by `mj test regression up`)
**Severity:** P2

The 5-container stack's `mjexplorer` Dockerfile `COPY`s from `.docker-generated/MJExplorer-forms/`. That directory is produced by the opt-in `form-generator` compose service (profile `gen-forms`). On a fresh clone, the directory doesn't exist, and `mj test regression up` fails to build the explorer image.

**Workaround:** run `mj test regression gen-forms` first, or `mj test regression build` which has a guard that runs gen-forms when the dir is missing.

**Suggested fix:** `mj test regression up` itself could check for `.docker-generated/MJExplorer-forms/Entities` and run gen-forms automatically. Currently the guard is only in `build`.

### 5.5 Working dir confusion at the host level
**Severity:** P3 (mitigated by Phase 4 `requireMonorepoRoot()` guard)

Multiple times during Phase 2 / Phase 3 verification I ran a docker compose command that failed silently with `couldn't find env file: /Users/.../packages/.../docker/regression/.env.test` because my cwd was inside `packages/MetadataSync` from a prior `npm run build`. Same issue as 5.3 but worth its own entry — this is a real foot-gun that anyone iterating on docker + package builds will hit.

**Workaround:** check `pwd` before running docker compose, or use `cd /Users/caelebbalanesi/Projects/MJ &&` prefix.

**Status:** Phase 4's `mj test regression *` CLI commands include a `requireMonorepoRoot()` check that exits with a helpful message when the cwd isn't the MJ repo root. The error names the missing file, so the next attempt has a clear remedy.

---

## 6. Archive flow specific (Phase 3)

### 6.1 Loopback test verifies the SAME-DB round-trip; cross-DB push to a separately-provisioned MJ instance is unverified
**Severity:** P1 before recommending archive for production use

Phase 3 verified pull → tag → push with the `ARCHIVE_DB_*` vars pointed back at the same docker SQL Server (loopback). The push works (`Updated: 1, Unchanged: 13`), but this doesn't verify:
- Schema compatibility between source and destination MJ versions
- Behavior when the destination doesn't have the source's `Tests` / `TestSuites` records (the `@lookup` references would fail)
- Encryption-key compatibility (`MJ_BASE_ENCRYPTION_KEY` must match for encrypted fields to round-trip)
- Performance of pulling base64 screenshots through a real network (vs. localhost loopback)

**Workaround:** the BYO loopback demo proves the *plumbing* works; cross-DB validation needs a real second MJ instance to test against.

**Suggested fix:** boot a *second* SQL Server + MJAPI in the same compose project, with its own migrations + codegen, and point the `ARCHIVE_DB_*` vars at it. Run the BYO suite against the primary, archive to the secondary, query both, diff results.

### 6.2 Archive pull always pulls the LATEST suite run regardless of when the suite started
**Severity:** P3

The Phase 3 entrypoint extracts `SUITE_RUN_ID` from `results.json` immediately after the suite finishes. This is the correct ID. But if the entrypoint is rerun externally (without running the suite), it'd archive the wrong/stale run.

**Workaround:** the entrypoint only invokes archive in the same script that just ran the suite, so this can't happen in practice.

**Suggested fix:** none needed. Document the assumption.

### 6.3 `@parent:ID` reference in pulled JSON is brittle if a child record references multiple parents
**Severity:** P3

mj-sync replaces foreign-key columns on related entities with `@parent:ID`, assuming a single-parent relationship. For deeply nested cascades (TestSuiteRun → TestRun → TestRunOutput), `@parent:ID` correctly refers to the immediate parent. Works fine for the archive case but documented as a potential surprise.

**Workaround:** none needed for the archive flow.

---

## 7. Safety / mutation control (deferred entirely)

### 7.1 No safety layer ships with this work
**Severity:** P1 — gates production use of the suite

The plan deferred the entire safety / mutation-control layer. Running the suite against a confidential or production MJ instance has no built-in guardrails today. The destructive-action surface depends entirely on what the test definitions ask the LLM to do.

**Workaround:** only run against:
- The self-contained docker stack (Mode A) — ephemeral DB, zero blast radius
- The BYO Mode D overlay — ephemeral app, zero blast radius
- A snapshot/staging MJ instance (Mode B) — restorable
- **Not** production / shared customer environments

**Suggested fix:** separate follow-up plan. Recommended layered approach:
- Network-level mutation guard (HTTP/GraphQL proxy that blocks mutations)
- Read-only test user role on the target's RBAC layer
- Sandbox/snapshot environments for confidential data (Mode D with restored DB)

Target-profile schema reserves a `safety` block for when this lands; plugin system reserves an interface slot.

---

## 8. Future phases not yet implemented

These are not "limitations" per se — they're the rest of the plan. Listed here so the punch list is comprehensive.

- **Phase 4** — **Done.** `mj test regression {build,up,down,gen-forms,compare,remote}` subcommands ship in `@memberjunction/cli`. `regression:*` npm scripts removed. `remote-target` compose profile + `test-runner-remote-entrypoint.sh` + target-profile loader (`scripts/load-target-profile.cjs`) implement Mode B/C. Compose services are now profile-gated (`full` / `remote-target` / `gen-forms`).
- **Phase 5** — **Done.** `mj test suite --oracles-module=path/to/mod.cjs` (and same for `mj test run`) loads custom `IOracle` exports via `packages/TestingFramework/CLI/src/utils/oracle-module-loader.ts`. Target profiles can declare `oraclesModule` to wire it through `mj test regression remote`. Reference scaffold at `docker/regression/examples/generic-web/` ships 3 MDN tests + a class-style + instance-style oracle to demonstrate both patterns.
- **Phase 6** — **Done.** `mj test regression remote --overlay=path/to/docker-compose.app.yml` accepts one or more overlay paths and passes them as additional `-f` flags to docker compose. Minimal reference overlay at `docker/regression/examples/static-file-server/` (nginx:alpine + 2 HTML pages + 2 Computer Use tests) sits alongside the existing realistic BYO example at `examples/bring-your-own-app/`. Mode D documentation in [REGRESSION_TESTING.md §"Bringing Your Own App"](REGRESSION_TESTING.md#bringing-your-own-app-mode-d----overlay).
- **Phase 7** — **Done.** `mj test compare --tag=<value>` (and `mj test regression compare --tag=…`) filters DB-mode runs by `MJTestSuiteRunEntity.Tags`, used to isolate runs from a specific source environment in an archive MJ. JSON mode (`--from-json`) prints a warning and ignores the flag since `results.json` doesn't emit Tags. Combines with `-v` / `-c` for tag-scoped version/commit comparisons.
- **Phase 8** — **Done (pending publish).** New `docker/agentic-test-runner/Dockerfile` generalizes the regression image; `.github/workflows/docker.yml` gets a second job that publishes `memberjunction/agentic-test-runner:v<MJServer-version>` alongside `memberjunction/api`. Example scaffolds at `docker/regression/examples/{remote-mj, generic-web, static-file-server, bring-your-own-app, github-actions}/` ship inside the image and are extractable via `init`. New `mj test regression init <name>` subcommand walks up from cwd to find the monorepo (copies locally) or shells out to `docker run … init …` (external mode); supports `--list`, `--force-docker`, and `--image=` overrides.

  **Not yet executed:** the image has not been built or pushed to Docker Hub — the workflow YAML is staged but won't fire until the next release push. The monorepo's own `docker/regression/Dockerfile.test-runner` is **unchanged** (still a self-contained build) because flipping it to `FROM memberjunction/agentic-test-runner:v…` would require the image to exist first. Sequence to flip the dependency direction:
    1. Push the Phase 8 branch.
    2. Cut a release so the workflow fires and publishes the first `memberjunction/agentic-test-runner` tag.
    3. Open a follow-up PR turning `Dockerfile.test-runner` into a 2-line `FROM <published-tag>` overlay.

---

## How to contribute to this list

When you hit a "huh, that's surprising" moment working on the regression suite:

1. Add a new subsection under the relevant area (or create a new area if needed)
2. Include severity, current workaround, suggested fix
3. Cross-link to relevant code (file paths with line numbers help)
4. If you fix one of these — mark as `**Severity:** Resolved` with a brief note, and move on (don't delete; the history is useful)

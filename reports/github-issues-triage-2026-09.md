# MemberJunction Open GitHub Issues Triage Report

**Generated:** 2026-09-15  
**Baseline:** `origin/next` (commit `33a16b0fcf`)  
**Scope:** All 324 open issues in `MemberJunction/MJ`, analyzed chronologically from oldest (#125, April 2024) to newest (#4495, September 2026).

---

## 1. Executive Summary

A comprehensive audit of all **324 open GitHub issues** was conducted by analyzing issue descriptions, timeline events, linked pull requests, commit logs on `origin/next`, and the live codebase.

### Key Findings
- **30 Issues Should Be Closed Immediately (9.3% of open backlog)**
  - **18 Feature / Bugfix Issues** are fully resolved by existing merged PRs and verified in the current codebase.
  - **12 Stale Backstop Bot Issues** (`🔴 Unit-test backstop failed on next`) were auto-filed on transient test failures and never closed after subsequent recovery. The test backstop on `next` is continuously green.
- **14 Issues Are Partially Addressed (4.3% of open backlog)**
  - Significant architectural groundwork or partial fixes have merged, but specific identified tasks, edge cases, or database columns remain open.
- **280 Issues Remain in the Active Backlog (86.4%)**
  - Comprising feature requests, design specifications, architectural evolutions, edge-case bug reports, and ecosystem expansions.

```
Total Open Issues: 324
├── Ready to Close: 30 (18 Codebase Verified + 12 Stale Bot Backstops)
├── Partially Addressed: 14 (Mapped into Value × Effort Matrix)
└── Active Backlog: 280
```

---

## 2. Issues That Should Be Closed

The following 30 issues are fully resolved by merged PRs or the current codebase state and should be closed. They are listed chronologically starting with the oldest.

### A. Feature & Defect Fixes (18 Issues)

| Issue | Opened | Title | Resolution Evidence & Code Location | Recommended Closing Rationale |
|:---|:---|:---|:---|:---|
| **#1186** | 2025-07-20 | Security: JSON Parsing Vulnerabilities in Loop Agent | Resolved by `BaseAgentType.parseJSONResponse` in `packages/AI/Agents/src/agent-types/base-agent-type.ts:368`. Wraps parsing with code-fence stripping, syntax cleaning via `_jsonValidator`, error trapping, and fallback to `null` without throwing. `LoopAgentType` uses `parseJSONResponse` exclusively. | "Fixed by centralized safe JSON response parsing in `BaseAgentType.parseJSONResponse`, eliminating unhandled JSON parsing exceptions in Loop Agent." |
| **#1317** | 2025-08-30 | Enhancement: Add metadata parameter to `@RegisterClass` decorator and `ClassFactory` | Implemented in `packages/MJGlobal/src/RegisterClass.ts` and `ClassFactory.ts` via `@RegisterClassEx` options bag and the 6th positional `metadata` parameter on `@RegisterClass`. Full test coverage in `ClassFactory.collision.test.ts`. | "Resolved via `@RegisterClassEx` and metadata parameter support in `@memberjunction/global`." |
| **#1700** | 2025-12-16 | Support multiple audiences per auth provider | Implemented in `packages/AuthProviders/src/AuthProviderFactory.ts` (`getAllByIssuer`), wired into token validation in `packages/MJServer/src/auth/index.ts:63` and `TokenValidator.ts`. Comprehensive integration tests in `TestingFramework/integration-test-suite/src/checks/auth-validation.checks.ts:273`. | "Resolved: `AuthProviderFactory.getAllByIssuer()` enables multiple audiences per issuer and is integrated across server token validation." |
| **#1939** | 2026-02-11 | `pdf-parse` dependency crashes on Node.js 24+ during module initialization | Merged in commit `6cb553e8cd` (`feat: default MJStorage uploads for file actions, replace pdf-parse with pdfjs-dist`). `pdf-parse` was completely removed from `packages/Actions/CoreActions/` and all other packages. | "Resolved: `pdf-parse` has been replaced with `pdfjs-dist` in `CoreActions` and removed from the monorepo." |
| **#3534** | 2026-08-06 | Realtime turn detection (VAD sensitivity) is not configurable — provider default fires on room noise | Fixed by PR **#3914** (`fix(elevenlabs): honour the one turn-detection setting the provider can express (#3534)`, commit `91b1640c26` / `eb2fcc081b`). | "Resolved by PR #3914 which added turn detection configuration support for ElevenLabs realtime." |
| **#3645** | 2026-08-08 | `mj codegen manifest --lazy-config` collapses per-module chunk loaders into one | Fixed in commit `f2c8e9bdac` (`fix(explorer): restore per-module lazy chunks`). Verified in `packages/Angular/Explorer/explorer-core/src/lib/lazy-feature-modules.ts`. | "Resolved: per-module lazy chunk loaders restored in Explorer manifest generation." |
| **#3877** | 2026-08-16 | `graph-view`: 3 ui-layers violations + 11 direct UUID comparisons | Fixed by PR **#3879** (commit `8624f1e1b8`: `fix(graph-view): compare record IDs with UUIDsEqual, not ===`) and PR **#3876** (ui-layers manifest updates). | "Resolved by PR #3879 and PR #3876." |
| **#3978** | 2026-08-20 | Numeric and bit IN(...) CHECK constraints produce no value list, so the field loses both its dropdown and its validation | Fixed by PR **#3972** (commit `d0a2a55d14`: `fix(core): validate value-list fields in EntityField.Validate() so an IN(...) CHECK has a runtime guard`). | "Resolved by PR #3972." |
| **#3981** | 2026-08-20 | `remote_operations.ts` is generated unscoped, so it tracks whoever ran CodeGen last | Fixed by PR **#3983** (commit `53d256fcdc`: `chore(core-entities): remove Orders remote operations from the core artifact`). | "Resolved by PR #3983." |
| **#4082** | 2026-08-27 | Explore native tool calling in BaseLLM and the agent framework | Implemented by PR **#4176** (commit `076fa5d842`: `Native tool calling: BaseLLM provider surface, metadata gate, and prompt-eval harness`). | "Resolved by PR #4176." |
| **#4330** | 2026-09-09 | Audit the `first-pk-ok` annotations: at least two document a defect as intentional design | Addressed and closed by PR **#4332** (commit `0ec198093c`: `docs(rules): separate the sanctioned record-id formats from what the estate actually holds`) and PR **#4321`. | "Resolved by PR #4332 and PR #4321." |
| **#4426** | 2026-09-13 | `mj install v6.1.0-edge.6` cannot complete on fresh distribution host: CodeGen emits no EntitySubclasses output when every entity is in excluded schema | Fixed by PR **#4479** / **#4490** (commit `387064d1f5`: `fix(codegen): always emit the default output group so a fresh install gets entity_subclasses.ts`). | "Resolved by PR #4479 / #4490." |
| **#4439** | 2026-09-13 | `DropboxFileStorage.ListObjects` does not paginate — large folders are silently truncated | Fixed by PR **#4411** (`fix(storage,content-autotagging,search-engine): Dropbox refresh-token/team-space support, recursive cloud-storage listing`). | "Resolved by PR #4411 with full cursor pagination." |
| **#4440** | 2026-09-13 | `DropboxFileStorage`: unconditional debug block adds an API call, 13 log lines and logs the account email on every `ListObjects` | Fixed by PR **#4411** (unconditional debug calls and PII logging removed). | "Resolved by PR #4411." |
| **#4441** | 2026-09-13 | PostgreSQL auto-quote: the deliberate-exclusion guard covers 7 of the 17 excluded words | Fixed by PR **#4436** (`fix(sql-dialect): close the PostgreSQL identifier auto-quoting keyword gaps`). | "Resolved by PR #4436." |
| **#4446** | 2026-09-13 | Transaction group: an Update targeting a non-existent row silently becomes a Create | Fixed by PR **#4356** (commit `caefbeba3d`: `fix(server): fail a transaction group whose rows are refused server-side`). | "Resolved by PR #4356." |
| **#4454** | 2026-09-13 | `SQLServerDataProvider`: route commit/rollback through the instance SQL queue to close the post-drain window | Fixed by PR **#4448** (commit `f2f1491a66`: `fix(db): drain the SQL queue before commit/rollback; keep the handle when commit fails`). | "Resolved by PR #4448." |
| **#4475** | 2026-09-14 | Certification: MJ 6.1.0 (lts/6.1) | Resolved: Gate 4 blockers resolved via PR **#4479** and PR **#4489**; 6.1.0 certified and release branch stable. | "Resolved: 6.1.0 certification complete." |

---

### B. Stale Backstop CI Bot Issues (12 Issues)

These issues were generated automatically by the `app/github-actions` bot when the scheduled unit-test backstop failed on `next`. The workflow logs failures but has no auto-close step on recovery. Full test suites on `next` have passed continuously across recent runs.

| Issue | Opened | Title | Target Commit | Status |
|:---|:---|:---|:---|:---|
| **#3821** | 2026-08-14 | 🔴 Unit-test backstop failed on next (cefc302) | `cefc302` | Stale; next is green |
| **#3841** | 2026-08-16 | 🔴 Unit-test backstop failed on next (11e8285) | `11e8285` | Stale; next is green |
| **#3843** | 2026-08-16 | 🔴 Unit-test backstop failed on next (4e41898) | `4e41898` | Stale; next is green |
| **#3845** | 2026-08-16 | 🔴 Unit-test backstop failed on next (81ed559) | `81ed559` | Stale; next is green |
| **#3846** | 2026-08-16 | 🔴 Unit-test backstop failed on next (cbfc330) | `cbfc330` | Stale; next is green |
| **#3849** | 2026-08-16 | 🔴 Unit-test backstop failed on next (cbfc330) | `cbfc330` | Stale; next is green |
| **#3852** | 2026-08-16 | 🔴 Unit-test backstop failed on next (288a091) | `288a091` | Stale; next is green |
| **#3878** | 2026-08-17 | 🔴 Unit-test backstop failed on next (65e0d0e) | `65e0d0e` | Stale; next is green |
| **#3880** | 2026-08-17 | 🔴 Unit-test backstop failed on next (6b2ae8e) | `6b2ae8e` | Stale; next is green |
| **#3888** | 2026-08-17 | 🔴 Unit-test backstop failed on next (3703da6) | `3703da6` | Stale; next is green |
| **#3900** | 2026-08-17 | 🔴 Unit-test backstop failed on next (3703da6) | `3703da6` | Stale; next is green |
| **#3935** | 2026-08-18 | 🔴 Unit-test backstop failed on next (70762b1) | `70762b1` | Stale; next is green |

---

## 3. Recommended Fix for GitHub CI Backstop Bot (Eliminating Issue Pollution)

### Problem Analysis
In `.github/workflows/test.yml` (lines 799–816), the test pipeline runs an automated alert hook calling `.github/scripts/backstop-alarm.mjs`:
```yaml
- name: Alert on backstop failure
  if: failure() && (github.event_name == 'push' || github.event_name == 'schedule')
  run: node .github/scripts/backstop-alarm.mjs red

- name: Resolve backstop alarm on green
  if: success() && (github.event_name == 'push' || github.event_name == 'schedule')
  continue-on-error: true
  run: node .github/scripts/backstop-alarm.mjs green
```

While `.github/scripts/backstop-alarm.mjs` was designed to maintain a single "rolling" issue via label deduplication, **in practice it causes severe issue tracker pollution**:
1. **Interim Red States on `next` are Routine:** During fast-moving development, merges to `next` often temporarily break between interdependent multi-PR updates or version bumping. The build engineering team monitors Actions and resolves these immediately.
2. **Issue Pollution vs. ChatOps:** Filing public GitHub issues for transient pipeline breaks clutters the product backlog, confuses contributors, and inflates issue metrics.
3. **Recovery Failures:** If token permissions or rate limits prevent the green-path cleanup from running, or if a legacy issue was filed under a different title/format, orphan issues accumulate permanently (as evidenced by the 12 open backstop issues above).

### Recommended Solution

#### Option A (Recommended): Remove Issue Creation; Route to Build Engineering Channels
Pipeline health belongs in build-engineering observability and ChatOps (e.g., Slack/Discord webhook or GitHub Actions dashboard), **not** in GitHub issues.

1. **Delete the issue-filing step in `.github/workflows/test.yml`:**
   Remove lines 799–816 calling `node .github/scripts/backstop-alarm.mjs red` and `green`.
2. **Replace with a Slack / Teams / Discord webhook alert:**
   Post backstop failures directly to the internal `#build-engineering` channel:
   ```yaml
   - name: Notify Build Engineering on Backstop Failure
     if: failure() && (github.event_name == 'push' || github.event_name == 'schedule')
     uses: slackapi/slack-github-action@v1.27.0
     with:
       payload: |
         {
           "text": "🚨 *Unit-test backstop failed on `next`*\nCommit: `${{ github.sha }}`\nRun: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
         }
     env:
       SLACK_WEBHOOK_URL: ${{ secrets.BUILD_ENGINEERING_SLACK_WEBHOOK }}
   ```
3. **Retire `.github/scripts/backstop-alarm.mjs`:**
   Decommission the script and associated test file `.github/scripts/__tests__/backstop-alarm.test.mjs`.

#### Option B (Alternative): Restrict Exclusively to Nightly Schedule with Failure Threshold
If GitHub issues must be retained, **never fire on `push` to `next`**:
- Restrict trigger solely to `github.event_name == 'schedule'`.
- Require at least 2 consecutive scheduled failures before opening an issue, ignoring single transient hiccups.

---

## 4. Issues Partially Addressed

The following 14 issues have had significant foundation, partial fixes, or companion PRs merged, but remain open due to specific uncompleted deliverables.

| Issue | Title | What Was Shipped | What Remains | Value | Effort | Rank |
|:---|:---|:---|:---|:---:|:---:|:---:|
| **#3064** | AIPromptRunner does not enforce `AIPrompt.TimeoutMS` on single-model path | PR #3129 shipped `AIPromptParams.timeoutMS`, typed `AIPromptTimeoutError`, and `cancellationToken` wiring across all LLM drivers. | Database column `AIPrompt.TimeoutMS` is not yet created in schema/metadata (#3133) so prompts cannot store default timeouts. | **High** | **Low** | **1** |
| **#632** | Build Utility to Reorder SQL Table Columns via Migration Script | `generateReorderTableColumnsScript` fully implemented in `packages/CodeGenLib/src/Database/reorder-columns.ts`. | Exposing the utility in `mj-cli` command and adding automated CLI integration test. | **High** | **Low** | **2** |
| **#4116** | Sibling controls have no accessible-name inputs (`mj-combobox`, `mj-switch`, etc.) | PR #3860 / #3863 added `AriaLabel`, `InputId`, `AriaDescribedBy` to `MJDropdown`. | Propagating the identical accessible-name input pattern to `mj-combobox`, `mj-switch`, `mj-numeric-input`, `mj-datepicker`. | **High** | **Low** | **3** |
| **#3132** | BaseLLM: absorb duplicated per-driver cancellation plumbing | Cancellation token and timeout support wired through 19 drivers in PR #3129. | Refactoring duplicated driver abort-listening code into `BaseLLM` and adding formal `AIErrorType.Cancelled`. | **Medium** | **Low** | **4** |
| **#3404** | Adopt UI Layering standard across all MJ and Blue Cypress repos | Locked UI layering compliance scanner (`check:ui-layers`) and resolved 96 violations across 85 Angular packages (commit `9e03134be5`). | Relocating `FileBrowserResource` out of `file-storage` into an Explorer package once CodeGen manifests regenerate. | **Medium** | **Low** | **5** |
| **#503** | Add a Dimension column to the VectorDatabase Entity | Added `Dimensions` to `MJ: Vector Indexes` (`vwVectorIndexes.Dimensions` / `metadata/entities/VectorIndex.json`). | Clarifying whether VectorDatabase needs an aggregate/display dimension or closing as completed at Index layer. | **Low** | **Low** | **6** |
| **#2554** | BaseEngine: lazy-load heavy columns with LRU cache to reduce cold-load payload | PR #2566 eliminated 163 MB cold load in `ComponentMetadataEngine` via targeted entity queries. | Generalizing lazy-loaded column caching in `BaseEngine` for arbitrary heavy text/JSON columns. | **High** | **Medium** | **7** |
| **#3451** | Open App install runs all migrations in one transaction (1205 deadlock) | Implemented per-migration execution mode in Open App Engine to avoid long-lived transaction deadlocks. | Comprehensive multi-phase compensation rollback when a multi-migration install fails midway. | **High** | **Medium** | **8** |
| **#3546** | `spDeleteEntityWithCoreDependencies` covers ~18 of ~73 FK references to Entity | Phase 0 retirement and migration 4489 cleaned up retired subsystems (Workflows, Reports, Scheduled Actions). | Expanding `spDeleteEntityWithCoreDependencies` to cover remaining ~55 FK references to `__mj.Entity`. | **High** | **Medium** | **9** |
| **#4252** | Integration framework: rig capability for schema-mutating + DB-tier + browser FLS tests | Tier 3b headless checks and FLS data-layer verification suites implemented. | Full browser-driven FLS UI test rig and automated schema-mutation test runner. | **High** | **Medium** | **10** |
| **#4283** | Developer and Integration hold unfiltered CRUD on ~439 of ~446 entities | Privilege escalation closed on `MJ: Users` (#4260/#4275) and `MJ: Roles`/`MJ: User Roles` (#4282/#4305). | System-wide audit and tightening of Developer/Integration role grants on the remaining ~439 entities. | **High** | **Medium** | **11** |
| **#2568** | Soft composite PK in `additionalSchemaInfo` can leave entity in broken state | PR #3898 rejects records with null soft PK; PR #3905 auto-emits index on soft PK. | Runtime composite-key validation and compound soft primary key updates in data provider. | **Medium** | **Medium** | **12** |
| **#2487** | Architecture: Cross-Application Migration Ordering Across MJ + BAC + BCSaaS | PR #2495 established `PUBLISH_NO_BREAK_POLICY.md` and tolerant SP signatures. | Automated cross-app dependency resolver and migration sequencing engine. | **High** | **High** | **13** |
| **#3604** | CodeGen PostgreSQL identifier auto-quoting keyword denylist | PR #3697 and PR #4436 added case-sensitive matching and excluded keywords. | Migrating to full dialect-aware AST generation to obsolete heuristic quoting completely (#4435). | **High** | **High** | **14** |

---

## 5. Potential Value × Effort Matrix

This matrix categorizes the 14 partially addressed issues by **Potential Value** (business impact, reliability, developer velocity) versus **Effort Level** (implementation size, testing, architectural complexity).

```
  POTENTIAL VALUE
        ▲
        │
   HIGH │  [Quick Wins]                    [Strategic Investments]           [Major Programs]
        │  #3064 AIPrompt.TimeoutMS col    #2554 BaseEngine lazy columns      #2487 Cross-app migration engine
        │  #632  Reorder columns CLI       #3451 OpenApp install compensation #3604 Full AST dialect quoting
        │  #4116 A11y input labels         #3546 Entity FK cascade sweep
        │                                  #4252 Browser FLS test rig
        │                                  #4283 Role CRUD audit
        │
 MEDIUM │  [Easy Improvements]             [Secondary Improvements]
        │  #3132 BaseLLM cancel refactor   #2568 Composite soft PKs
        │  #3404 UI-layers file-browser
        │
    LOW │  [Housekeeping]
        │  #503  VectorDB dimensions
        │
        └───────────────────────────────────────────────────────────────────────────────────►
                     LOW                           MEDIUM                           HIGH
                                                EFFORT LEVEL
```

### Rank-Ordered Attack Plan

#### Wave 1: Immediate Quick Wins (High Value / Low Effort)
1. **#3064 (Rank 1):** Add `TimeoutMS` column to `AIPrompt` via migration + CodeGen. The runner plumbing is already complete; this allows prompts to declare wall-clock bounds.
2. **#632 (Rank 2):** Expose `generateReorderTableColumnsScript` in `mj-cli` command `mj db reorder-columns`. The database logic is already written and tested in `packages/CodeGenLib/src/Database/reorder-columns.ts`.
3. **#4116 (Rank 3):** Replicate the accessible-name pattern implemented on `MJDropdown` (`AriaLabel`, `InputId`, `AriaDescribedBy`) across `mj-combobox`, `mj-switch`, `mj-numeric-input`, and `mj-datepicker`.

#### Wave 2: Low-Hanging Structural Cleanups (Medium Value / Low Effort)
4. **#3132 (Rank 4):** Refactor the per-driver cancellation listener logic into `BaseLLM` and introduce `AIErrorType.Cancelled`.
5. **#3404 (Rank 5):** Move `FileBrowserResource` from `file-storage` into `ng-explorer-core` during the next CodeGen cycle to clear the last standing UI layering exception.
6. **#503 (Rank 6):** Confirm `vwVectorIndexes.Dimensions` satisfies requirements and close #503 with architectural explanation.

#### Wave 3: High-Impact Core Hardening (High Value / Medium Effort)
7. **#2554 (Rank 7):** Generalize column-level lazy-load caching in `BaseEngine` for large text/JSON columns.
8. **#3451 (Rank 8):** Add multi-phase compensation rollback for failed OpenApp multi-migration installs.
9. **#3546 (Rank 9):** Extend `spDeleteEntityWithCoreDependencies` to cover the remaining ~55 FK references to `__mj.Entity`.
10. **#4252 (Rank 10):** Expand the integration test framework with automated browser-driven Field-Level Security verification.
11. **#4283 (Rank 11):** Complete the security audit of Developer/Integration role permissions across all entities following the fixes to Users and Roles.

#### Wave 4: Complex Architectural Evolution (High/Medium Value / High/Medium Effort)
12. **#2568 (Rank 12):** Comprehensive multi-column soft primary key runtime and mutation support.
13. **#2487 (Rank 13):** Multi-application cross-dependency ordering and automated migration sequencer.
14. **#3604 (Rank 14):** Migrate PostgreSQL identifier quoting to dialect-aware AST generation (#4435).

---

## 6. Methodology & Next Steps

1. **GitHub API & Database Cross-Referencing:** All 324 issues were fetched via GitHub GraphQL API with full timeline events, cross-referenced pull requests, and commit logs.
2. **Codebase Verification:** Each candidate resolution was verified against active TypeScript implementations, SQL migrations, metadata files, and unit test suites.
3. **Action Items:**
   - Close the **18 verified resolved issues** on GitHub with references to their merged PRs.
   - Close the **12 stale backstop bot issues** as recovered.
   - Implement **Option A** in `.github/workflows/test.yml` to remove bot backstop issue creation and eliminate future issue pollution.
   - Schedule **Wave 1 Quick Wins** (#3064, #632, #4116) for the current sprint.

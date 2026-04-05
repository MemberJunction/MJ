# Automated Convention Enforcement for MemberJunction

## The Problem

MemberJunction has extensive coding conventions documented in CLAUDE.md — naming patterns, UUID handling, design tokens, entity access, migration formats, and more. Today, enforcement is entirely honor-system: developers (human and AI) read the doc, hopefully follow it, and violations surface in code review if at all.

---

## The Solution: `@memberjunction/eslint-plugin`

A purpose-built linter for MJ conventions. 18 rules across ESLint, Stylelint, and SQL. 119 tests, all passing. Validated against 2,383 files with a very low false positive rate.

**Repository**: [pranavrao-BC/eslint-plugin-memberjunction](https://github.com/pranavrao-BC/eslint-plugin-memberjunction) (public)

### What It Catches

**ESLint — 12 rules, 10,220 violations found across 918 files**

| Rule | Violations | What It Catches |
|------|-----------|----------------|
| `member-naming-convention` | 8,755* | Public members not PascalCase, private not camelCase |
| `use-uuids-equal` | 432 | `===`/`!==` on UUID fields — real cross-platform bugs (SQL Server uppercase vs PostgreSQL lowercase) |
| `no-entity-get-set` | 345 | `.Get('Field')`/`.Set('Field', val)` — bypasses generated type safety |
| `no-ng-on-changes` | 79 | `ngOnChanges`/`ngDoCheck` instead of `@Input()` setters |
| `no-cross-package-reexport` | 16 | Re-exports from `@memberjunction/*` in public-api/index files |
| `no-enum-prefer-union` | 12 | `enum` declarations (should be union types for tree-shaking) |
| `no-fields-with-entity-object` | 4 | `Fields` param with `ResultType: 'entity_object'` (Fields is silently ignored by ProviderBase) |
| `no-router-in-generic` | 4 | `@angular/router` imports in `Angular/Generic/` components |
| `no-static-singleton` | 3 | Manual `static _instance` instead of `BaseSingleton<T>` |
| `no-entity-spread` | 0* | Spread on BaseEntity variables (loses getter properties) |
| `no-kendo-icons` | 0* | `k-icon`/`k-i-*` class strings|
| `no-legacy-template-syntax` | 0* | `*ngIf`/`*ngFor`/`*ngSwitch` in inline templates |

*Zero hits — convention already followed. These prevent regression.

\*The naming rule now supports `excludePaths` to skip packages following external conventions (React, oclif CLI, A2A protocol). The 8,755 count excludes ~545 false positives from those packages. Naming is **off by default** in `recommended` config — enabled only in `strict`/CI.

**Stylelint — 2 rules, 771 violations found**

| Rule | Violations | What It Catches |
|------|-----------|----------------|
| `mj/no-hardcoded-colors` | 643 | Hex/rgb/rgba in CSS instead of `--mj-*` design tokens |
| `mj/no-primitive-tokens` | 128 | `var(--mj-color-neutral-300)` instead of semantic tokens |

**SQL Migration Linter — 4 checks, 5 violations found**

| Check | Violations | What It Catches |
|-------|-----------|----------------|
| `use-flyway-schema` | 5 | Hardcoded `dbo.`/`__mj.` instead of `${flyway:defaultSchema}` |
| `no-mj-timestamps` | 0* | `__mj_CreatedAt`/`__mj_UpdatedAt` in CREATE TABLE (CodeGen handles this) |
| `no-fk-indexes` | 0* | Single-column FK indexes (CodeGen handles this) |
| `no-newid` | 0* | `NEWID()` in INSERT statements (should use hardcoded UUIDs) |

*Zero in current hand-written migrations (baseline files excluded). These prevent regression.

### False Positive Rate

| Rule | False Positives | Rate | Cause |
|------|----------------|------|-------|
| `use-uuids-equal` | 7 out of 432 | 1.6% | Env var names like `AZURE_TENANT_ID` matched the `*ID` pattern |
| `member-naming-convention` | ~545 (now excluded) | — | Packages following React/oclif/A2A conventions. Fixed via `excludePaths`. |
| All other rules | 0 | 0% | — |
| **Overall (after fixes)** | **7 out of ~10,500** | **<0.1%** | |

The `use-uuids-equal` false positives will be addressed with an allowlist. The `member-naming-convention` false positives from external-convention packages are already fixed via `excludePaths` in the `strict` config.

### Why a Linter Complements CLAUDE.md

CLAUDE.md is good at conveying intent, architecture, and judgment calls. It's not good at enforcement. The linter fills that gap:

| | CLAUDE.md | Linter |
|---|-----------|--------|
| Architectural guidance | ✅ Great at this | Can't do this |
| Mechanical rule enforcement | Relies on reader compliance | Automated, instant feedback |
| Works for humans | Only if they read the doc | Fires in editor + CI |
| Works for AI agents | Only if model follows instructions | Catches violations in output |
| Covers existing code | No — only affects new code by convention | Yes — found 10,996 existing violations |
| Verified correctness | "I told it the rules" | "The linter proved it's clean" |

**The linter doesn't replace CLAUDE.md. It enforces the mechanical subset that CLAUDE.md can only describe.**

---

## Proof of Concept: A/B Experiment

We ran a controlled experiment to test the linter as a feedback loop for AI agents.

> **Caveat**: This is a proof of concept, not a rigorous study. n=1 per condition, single feature spec, single model. The conclusions are directional, not definitive.

### Setup

Two isolated git worktrees from the same commit (`3fa8f44`). Each given to a fresh Claude Code session (Opus 4.6). Identical feature spec.

| | Window A (Control) | Window B (Treatment) |
|---|---------|---------|
| CLAUDE.md | Full (1,688 lines, 21.1K tokens) | Slim (57 lines, 776 tokens) |
| Linter | Not available | Available, agent instructed to run it |

### The Prompt (Identical for Both)

```
Create a new file at packages/MJCore/src/generic/NotificationDeliveryTracker.ts

Build a server-side singleton engine that tracks and reports on notification delivery
status. Requirements:

1. Singleton class `NotificationDeliveryTracker`
2. A public method that takes a list of notification IDs and a contextUser, loads the
   corresponding "Notifications" entity records, groups them by status
   (Pending/Sent/Failed/Read), and returns a summary with: total count, count per
   status, list of failed notification IDs, and the user ID that has the most unread
   notifications.
3. A method that checks if a specific notification ID belongs to a given user ID
   (compare IDs to verify ownership).
4. Cache notification metadata to avoid repeated lookups for the same notification IDs
   within a session.
5. Use a type to represent delivery status states.
6. All results should be plain serializable objects.
7. Use RunView for all data loading — this is server-side code.
```

Window B additionally: *"After writing the file, run the MJ linter as described in CLAUDE.md and fix any violations."*

### What Happened

**Window A (full CLAUDE.md, no linter):**
1. Searched for patterns and entity definitions (4 searches, 2 file reads)
2. Wrote 197-line implementation — PascalCase naming correct from the start
3. Ran `tsc` — found a `getInstance` issue, fixed it
4. Never ran a linter — relied entirely on CLAUDE.md for convention compliance

**Window B (slim CLAUDE.md + linter):**
1. Explored codebase more extensively (39 tool uses via sub-agent)
2. Wrote 164-line implementation — initially used camelCase for public methods
3. **Ran linter — caught 3 violations:**
   ```
   L50  member-naming-convention  Public member "getDeliverySummary" should be PascalCase
   L103 member-naming-convention  Public member "belongsToUser" should be PascalCase
   L114 member-naming-convention  Public member "clearCache" should be PascalCase
   ```
4. Fixed all three, ran linter again — clean

### Results

Both final outputs linted after the experiment: **0 violations each.**

**Convention compliance (manual audit):**

| Convention | Window A | Window B |
|-----------|----------|----------|
| `BaseSingleton` | ✅ | ✅ |
| Union type (not enum) | ✅ | ✅ |
| `UUIDsEqual()` for comparison | ✅ | ✅ |
| `ResultType: 'simple'` + `Fields` | ✅ | ✅ |
| `contextUser` passed everywhere | ✅ | ✅ |
| `result.Success` checked | ✅ | ✅ |
| "MJ: " entity name prefix | ✅ | ✅ |
| PascalCase public members | ✅ (first try) | ✅ (after linter fix) |

**Context usage (from Claude Code `/status`):**

```
                        Window A            Window B
Total context:          57.9K (6%)          43K (4%)
Memory files:           22.0K               1.7K
  └ CLAUDE.md:          21.1K               776 tokens
Messages:               20.7K               22.2K
```

### What This Shows

- **The full CLAUDE.md works.** Window A was faster and got naming right on the first try. The quality of the documentation is not in question.
- **The linter works as a feedback loop.** Window B naturally wrote camelCase, the linter caught it, the agent fixed it. Three targeted edits instead of reading 40 lines of naming convention rules.
- **Both reached the same quality.** Different mechanisms, same result.
- **The linter provides verified correctness.** Window A's output happened to be clean — but there was no verification during development. Window B proved its output was clean.
- **Window A used 21.1K tokens on CLAUDE.md vs Window B's 776.** Over long sessions, this means more context available for actual code before compression kicks in. Claude Code itself flagged the full CLAUDE.md: *"⚠ Large CLAUDE.md will imp... 40.0k"*.

### What This Doesn't Show

- Whether removing non-linter CLAUDE.md sections (build commands, architecture docs) causes problems — we didn't test that.
- Long-session behavior where context pressure becomes a real factor.

---

## Design: Opt-In, Non-Disruptive

The linter is designed to **not pollute the dev experience** on existing code:

- **Two configs**: `recommended` (all rules as `warn`) and `strict` (all rules as `error`)
- **Neither enabled by default** — developers opt in explicitly
- **`member-naming-convention` ships as off-by-default** in `recommended` — it's the noisiest rule (9,300 warnings) and would cause warning fatigue. Enabled in `strict` for CI only.
- **Intended workflow**: `npm run lint:mj` for on-demand checks; diff-aware CI on PRs for new code

### The 9,300 Naming Warnings

The `member-naming-convention` rule accounts for the majority of warnings (~8,755 after excluding external-convention packages). These are all real violations, but nobody's renaming them in one pass. The approach:

1. Ship the rule as **off by default** in `recommended`
2. Enable in **`strict` for CI** — flags only violations in files changed by the PR
3. The codebase gradually converges as files are touched
4. No big-bang rename required

---

## Implementation Plan

### Part 1: Integrate the Linter into MJ

| Task | Details |
|------|---------|
| Repo is live | [pranavrao-BC/eslint-plugin-memberjunction](https://github.com/pranavrao-BC/eslint-plugin-memberjunction) |
| Add `lint:mj` script to MJ root `package.json` | On-demand convention check |
| Add Stylelint config for Angular packages | `.stylelintrc.mj.json` |
| Add SQL lint script | `"lint:sql": "mj-lint-sql migrations/v5/"` |
| Add `use-uuids-equal` allowlist | Exclude env var patterns like `AZURE_*_ID` |

### Part 2: CI Integration

| Task | Details |
|------|---------|
| Diff-aware ESLint in CI | Lint only files changed in the PR |
| Stylelint in CI | Same diff-aware approach for CSS |
| SQL lint in CI | Run on PRs touching `migrations/` |
| Use `strict` config in CI | Errors on new code only — existing violations don't block |

### Part 3: Remediation Roadmap

| Priority | Rules | Violations | Approach |
|----------|-------|------------|----------|
| **High** — real bugs | `use-uuids-equal` | 425 | Fix in batches — these are actual cross-platform bugs |
| **Medium** — type safety | `no-entity-get-set`, `no-static-singleton` | 348 | Fix as files are touched |
| **Low** — style | `member-naming-convention` | 8,755 | Converge gradually via CI on new code |
| **CSS** | `no-hardcoded-colors`, `no-primitive-tokens` | 771 | Fix as part of design system work |

### Part 4: CLAUDE.md Cleanup (Optional, Separate Decision)

After the linter is adopted and validated, we can optionally streamline CLAUDE.md by removing the ~465 lines of content the linter now enforces. This is a **separate decision** that doesn't need to be made now. The linter adds value whether CLAUDE.md changes or not.

### Part 5: Ongoing

| Trigger | Action |
|---------|--------|
| New convention proposed | Ask: "Can this be a lint rule?" If yes, add the rule. |
| Convention frequently violated | Migrate to lint rule |
| Quarterly | Review rules for false positives, update for framework changes |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Warning fatigue from naming rule | High | Medium | Off by default in `recommended`. Enabled in `strict`/CI on changed files only. External-convention packages excluded via `excludePaths`. |
| `use-uuids-equal` false positives | Medium | Low | Add allowlist for env var and external service ID patterns. |
| Linter maintenance burden | Low | Medium | 119 tests ensure stability. Rules are simple AST checks. Assign an owner. |
| Team doesn't adopt | Medium | Medium | CI runs automatically — no manual adoption needed for new code enforcement. |

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Convention violations caught before merge | ~0% (code review only) | >90% (CI lint) | Lint pass rate on PRs |
| False positive rate | N/A | <2% | Periodic manual audit |
| UUID comparison bugs | 425 | 0 | Lint count over time |
| New code convention compliance | Unknown | Measurable | Warnings per PR |

---

## Appendix A: Research Context

Gloaguen et al., [*"Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?"*](https://arxiv.org/abs/2602.11988) (February 2026). Evaluated Claude Code (Sonnet 4.5), Codex (GPT-5.2, GPT-5.1 mini), and Qwen Code (Qwen3-30b-coder). Found context files increase agent token usage by 20%+ with marginal quality improvement. Recommends minimal context files. This research informed our thinking but our own experiment showed MJ's CLAUDE.md provides above-average value given the codebase's idiosyncratic conventions. The linter is motivated primarily by the 10,996 violations in merged code, not by this paper.

## Appendix B: Linter Technical Reference

**Repository**: [pranavrao-BC/eslint-plugin-memberjunction](https://github.com/pranavrao-BC/eslint-plugin-memberjunction)

| Entry Point | Technology | Rules |
|-------------|-----------|-------|
| `./dist/index.js` | ESLint v9 flat config | 12 TypeScript rules |
| `./dist/stylelint/index.js` | Stylelint 16 | 2 CSS rules |
| `./dist/sql/lint-migrations.js` | Node CLI | 4 SQL checks |

**Test suite**: 119 tests across 15 test files, all passing (Vitest).

**Configs**:
- `recommended` — all rules warn, naming off-by-default (avoids warning fatigue on local dev)
- `strict` — all rules error, naming on with `excludePaths` for React/AICLI/A2AServer/ComponentRegistryClientSDK (for CI on changed files)

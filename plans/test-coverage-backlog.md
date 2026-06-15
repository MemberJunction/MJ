# Test Coverage Backlog — disabled vitest suites

> **Status:** tracking / backlog (to be addressed later)
> **Created:** 2026-06-15
> **Related:** PR #2847 (enabled the first 17), PR #2839 / #2841 (perf-hardening + their own coverage)

## TL;DR

A repo-wide audit found **64 packages whose `test` script is a no-op** (`echo "No tests configured yet"` / `exit 0`), so CI silently never runs them. Contrary to the first pass (which mis-scored multi-file packages to "0 assertions" due to a shell word-splitting bug), **almost none of these are empty scaffolds** — the overwhelming majority contain **real `it()`/`expect()` assertions** that simply never execute.

- **17** of them were enabled + verified green in **PR #2847**.
- **40** real suites remain **disabled** (this backlog).
- **0** true empty scaffolds were found.

The work here is *not* "write tests" — it's **enable + verify** existing tests (the PR #2847 pattern): flip `"test"` → `"vitest run"`, run it, keep the flip only if green, fix trivial mock gaps, and defer/triage any genuine failures.

## How to action this (per package)

1. `cd packages/<pkg>` → change `"test": "echo ..."` to `"test": "vitest run"`.
2. `npm run build` (turbo builds workspace deps so vitest can resolve `@memberjunction/*` dist), then `npm run test`.
3. **Green** → keep the flip. **Trivial test-only failure** (missing mock export, stale import) → fix the test, re-run. **Real failure** (product bug / nontrivial) → revert the script and triage separately.
4. Never weaken/skip assertions to force green.

Do this in **batches with verification**, exactly as PR #2847 did — do not blind-flip all 40 at once.

---

## Category A1 — high-value suites (≥10 tests) — prioritize

| Package | it() | expect() | Notes |
|---|---:|---:|---|
| `Angular/Generic/conversations` | 528 | 1127 | **Biggest gap by far** — a major chat-stack suite running on nothing. |
| `Templates/engine` | 74 | 128 | Core templating engine. |
| `Communication/base-types` | 60 | 141 | |
| `Angular/Explorer/shared` | 57 | 89 | |
| `Angular/Generic/filter-builder` | 42 | 81 | |
| `Angular/Generic/artifacts` | 38 | 82 | |
| `Angular/Generic/Testing` | 34 | 64 | |
| `Angular/Generic/timeline` | 24 | 29 | |
| `Angular/Generic/trees` | 19 | 70 | |
| `Angular/Generic/markdown` | 18 | 20 | |
| `Angular/Generic/code-editor` | 15 | 24 | |
| `Angular/Generic/base-types` | 12 | 18 | |
| `Angular/Generic/list-management` | 10 | 15 | ⚠️ already being enabled in **PR #2841** — don't double-handle. |
| `Angular/Generic/export-service` | 10 | 17 | |

## Category A2 — small real suites (3–9 tests) — low effort each

| Package | it() | Notes |
|---|---:|---|
| `Angular/Explorer/workspace-initializer` | 9 | ⚠️ **Known FAILURE — real product bug** (see below). Do not enable until resolved. |
| `Angular/Generic/versions` | 6 | |
| `Actions/ScheduledActionsServer` | 6 | |
| `Angular/Generic/ai-test-harness` | 5 | |
| `Angular/Generic/user-avatar` | 3 | The ~24 uniform `it=3` Angular/Generic packages below look like generated smoke suites |
| `Angular/Generic/tab-strip` | 3 | (real + runnable, but minimal coverage). Worth enabling for the smoke value. |
| `Angular/Generic/resource-permissions` | 3 | |
| `Angular/Generic/record-selector` | 3 | |
| `Angular/Generic/query-viewer` | 3 | |
| `Angular/Generic/notifications` | 3 | |
| `Angular/Generic/join-grid` | 3 | |
| `Angular/Generic/generic-dialog` | 3 | |
| `Angular/Generic/flow-editor` | 3 | |
| `Angular/Generic/find-record` | 3 | |
| `Angular/Generic/file-storage` | 3 | |
| `Angular/Generic/entity-communication` | 3 | |
| `Angular/Generic/deep-diff` | 3 | ⚠️ already being enabled in **PR #2841**. |
| `Angular/Generic/data-context` | 3 | |
| `Angular/Generic/dashboard-viewer` | 3 | |
| `Angular/Generic/credentials` | 3 | |
| `Angular/Generic/container-directives` | 3 | |
| `Angular/Generic/chat` | 3 | |
| `Angular/Generic/agents` | 3 | |
| `Angular/Generic/actions` | 3 | |
| `Angular/Generic/action-gallery` | 3 | |
| `Angular/Explorer/entity-permissions` | 1 | ⚠️ already being enabled in **PR #2841**. |

> After PR #2841 merges, the three packages flagged above (`list-management`, `deep-diff`, `entity-permissions`) come off this list, leaving **37** real disabled suites to enable.

---

## Known product bug — `workspace-initializer` (blocks its enablement)

`WorkspaceInitializerService.classifyError` does **not** classify a no-roles user's actual crash symptom as `no_roles`:

- Test (`workspace-initializer.test.ts`): asserts the error `"Cannot read properties of undefined (reading 'ResourceTypes')"` → `type: 'no_roles'`.
- Production (`workspace-initializer.service.ts` → `isNoUserRolesError`): only matches the literal substring `'does not have read permissions on User Roles'`. The `ResourceTypes` `TypeError` doesn't contain it → falls through to `type: 'unknown'`.

**Effect:** a user with no roles sees the generic *"An unexpected error occurred"* instead of the helpful *"Your account has no roles — contact your administrator."*

**Decision needed (one of):**
- **Fix production** — teach `isNoUserRolesError` to also recognize the `ResourceTypes`-undefined symptom as a no-roles condition (caveat: matching a generic `TypeError` string is fragile and may over-classify other undefined-reads). **OR**
- **Fix the test** — if the `ResourceTypes` crash is not reliably a no-roles signal, the test should assert `unknown`.

Leaning toward the production fix (the test encodes a real user-facing symptom), but it needs a product owner's call. Until resolved, `workspace-initializer` stays disabled.

---

## Why this matters

These suites represent thousands of already-written assertions (`conversations` alone: 1127 `expect()`s) providing **zero** regression protection because CI never invokes them. Enabling them is high-leverage: the tests exist, they just need to run. The root cause is a package-scaffold default of `"test": "echo \"No tests configured yet\""` that was never flipped once real tests landed — worth a lint/CI guard so a package with `*.test.ts` files but a no-op `test` script fails the build.

# Pin @foblex/flow to 18.0.0 and Guard @foblex/* Exact Pins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exact-pin `@foblex/flow` to `18.0.0` in `packages/Angular/Generic/flow-editor/package.json`, `packages/MJExplorer/package.json`, and `pnpm-lock.yaml`, and add a CI guard script + workflow that enforces exact version pins matching `pnpm-lock.yaml` for all `@foblex/*` dependencies across `packages/**/package.json`.

**Architecture:** A zero-dependency Node ESM script (`.github/scripts/check-exact-pins.mjs`) walks `packages/**/package.json` and parses the `importers:` block of `pnpm-lock.yaml` to verify that every `@foblex/*` dependency in `dependencies`, `devDependencies`, or `peerDependencies` uses an exact `X.Y.Z` version matching the lockfile's resolved `version:` and `specifier:`. Both manifests that currently declare `"@foblex/flow": "^18.0.0"` are updated to `"18.0.0"` with matching `specifier: 18.0.0` in `pnpm-lock.yaml`, wired into root `package.json`, `CLAUDE.md`, `.github/workflows/ci-exact-pins.yml`, and a `patch` changeset for `@memberjunction/ng-flow-editor`.

**Tech Stack:** Node.js (ESM, `node:fs`, `node:path`, `node:url`), Vitest, GitHub Actions, pnpm lockfile v9.

**Spec:** Issue #5925 brief (`https://github.com/MemberJunction/MJ/issues/5925`).

## Global Constraints

- `PINNED_SCOPES` is `['@foblex/']`; check `dependencies`, `devDependencies`, and `peerDependencies` in every `packages/**/package.json`.
- Skip `node_modules`, `dist`, `.angular`, `.turbo` during directory traversal; cap directory traversal with `MAX_DIRS = 20000`.
- Exact version regex is `/^\d+\.\d+\.\d+$/`.
- Parse `pnpm-lock.yaml` as text with no new dependency: locate the `importers:` entry matching the manifest's relative directory path, read the dependency's `specifier:` and `version:` lines, and strip any peer-suffix starting at the first `(` from `version:`.
- CLI exit codes for `.github/scripts/check-exact-pins.mjs`: `0` when clean, `1` on any violation (printing one line per violation with manifest path, dependency name, declared range, and lockfile version), `2` on bad usage or missing lockfile/packages directory.
- Export pure functions `isExactVersion` and `findPinViolations` from `.github/scripts/check-exact-pins.mjs`.
- Do not change any `.ts`, `.html`, or `.scss` file under `packages/Angular/Generic/flow-editor/src` or `packages/Angular/Generic/task-graph-editor/src`.
- Do not change `check-explorer-external-deps.mjs` or `check-internal-peer-deps.mjs`.

## Review Focus

1. Lockfile version with peer suffix (`18.0.0(@angular/common@21.2.22...)`): must strip everything from the first `(` onward before comparing against the declared version `18.0.0`.
2. Quoted vs unquoted dependency names and specifiers in `pnpm-lock.yaml` (`'@foblex/flow':`, `"@foblex/flow":`, `specifier: '^18.0.0'`): parser must strip optional surrounding single or double quotes on keys and values.
3. Missing dependency or importer in `pnpm-lock.yaml`: if a manifest declares a `@foblex/*` package that is absent from the lockfile importer entry, `findPinViolations` must report it as a violation (`lockfileVersion: null`) rather than crashing or silently passing.
4. Stale lockfile specifier (`package.json` has `18.0.0`, `pnpm-lock.yaml` has `version: 18.0.0` but `specifier: ^18.0.0`): must report a violation when `specifier` is present and differs from `declaredRange`.
5. Bad CLI arguments or missing `pnpm-lock.yaml`: `--root` pointing to a directory without `pnpm-lock.yaml` or unknown CLI flags must exit with code `2`.

---

### Task 1: Guard Script `.github/scripts/check-exact-pins.mjs` and Unit Tests

**Files:**
- Create: `.github/scripts/check-exact-pins.mjs`
- Modify: `.github/scripts/__tests__/check-exact-pins.test.mjs`

**Interfaces:**
- Consumes: none
- Produces:
  - `isExactVersion(range: string): boolean`
  - `findPinViolations(root: string, scopes?: string[]): Array<{ manifestPath: string, dep: string, declaredRange: string, lockfileVersion: string | null, lockfileSpecifier: string | null }>`
  - CLI `node .github/scripts/check-exact-pins.mjs [--root <dir>]`

- [ ] **Step 1: Expand `.github/scripts/__tests__/check-exact-pins.test.mjs` with unit and fixture tests**

Include the repo-level test from the brief plus temp-directory fixture tests covering:
- `isExactVersion` (`18.0.0` true; `^18.0.0`, `~18.0.0`, `18.0.0-edge.1`, `latest` false)
- caret range (`^18.0.0`) fails with exit 1 and reports manifest path, dep name, `^18.0.0`, and `18.0.0`
- tilde range (`~18.0.0`) fails with exit 1
- exact range (`18.0.0`) that differs from lockfile resolved version (`18.6.1`) fails with exit 1
- exact range (`18.0.0`) with stale lockfile specifier (`^18.0.0`) fails with exit 1
- dependency missing from lockfile importer fails with exit 1
- exact range (`18.0.0`) matching lockfile specifier (`18.0.0`) and version (`18.0.0(@angular/core@21.2.22)`) passes with exit 0
- dependency outside `PINNED_SCOPES` with a caret (`rxjs: ^7.8.2`) passes with exit 0
- missing lockfile or unknown flag exits with code 2

- [ ] **Step 2: Run the test suite to verify it fails before implementation**

Run: `npx vitest run --config .github/scripts/vitest.config.mts __tests__/check-exact-pins`
Expected: FAIL because `../check-exact-pins.mjs` does not exist yet.

- [ ] **Step 3: Implement `.github/scripts/check-exact-pins.mjs`**

Implement header comment explaining the full-Ivy `FExternalItemDirective` / `FSelectionAreaComponent` runtime failure (`NG0919`), `PINNED_SCOPES = ['@foblex/']`, `SKIP_DIRS = new Set(['node_modules', 'dist', '.angular', '.turbo'])`, `MAX_DIRS = 20000`, `isExactVersion`, `parseLockfileImporters`, `findPinViolations`, and `main()` CLI entrypoint guarded by `import.meta.url`.

- [ ] **Step 4: Run the test suite to verify fixture tests pass and ONLY the repo-level test fails on unpinned manifests**

Run: `npx vitest run --config .github/scripts/vitest.config.mts __tests__/check-exact-pins`
Expected: All fixture unit tests PASS; the repo-level test `every @foblex/* dependency is an exact version that matches pnpm-lock.yaml` FAILS reporting `packages/Angular/Generic/flow-editor/package.json` and `packages/MJExplorer/package.json`.

- [ ] **Step 5: Commit Task 1**

Stage `.github/scripts/check-exact-pins.mjs` and `.github/scripts/__tests__/check-exact-pins.test.mjs` and commit.

---

### Task 2: Exact-Pin `@foblex/flow` in Manifests and `pnpm-lock.yaml`, Wire Scripts, Workflow, Docs, and Changeset

**Files:**
- Modify: `packages/Angular/Generic/flow-editor/package.json`
- Modify: `packages/MJExplorer/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `package.json`
- Modify: `CLAUDE.md`
- Create: `.github/workflows/ci-exact-pins.yml`
- Create: `.changeset/pin-foblex-flow-18-0-0.md`

**Interfaces:**
- Consumes: `.github/scripts/check-exact-pins.mjs` and `.github/scripts/__tests__/check-exact-pins.test.mjs` from Task 1.
- Produces:
  - Root scripts `check:exact-pins` and `check:exact-pins:test`
  - Workflow `.github/workflows/ci-exact-pins.yml`
  - Changeset `.changeset/pin-foblex-flow-18-0-0.md`

- [ ] **Step 1: Pin `@foblex/flow` to `"18.0.0"` in `packages/Angular/Generic/flow-editor/package.json` and `packages/MJExplorer/package.json`, and update `specifier: 18.0.0` in `pnpm-lock.yaml`**

Change `"@foblex/flow": "^18.0.0"` to `"@foblex/flow": "18.0.0"` in both `package.json` files and update the two `specifier: ^18.0.0` lines for `@foblex/flow` under `importers:` in `pnpm-lock.yaml` to `specifier: 18.0.0`.

- [ ] **Step 2: Wire root `package.json`, `.github/workflows/ci-exact-pins.yml`, `CLAUDE.md`, and `.changeset/pin-foblex-flow-18-0-0.md`**

- In root `package.json`, add `"check:exact-pins": "node .github/scripts/check-exact-pins.mjs"` and `"check:exact-pins:test": "vitest run --config .github/scripts/vitest.config.mts __tests__/check-exact-pins"` next to `check:changeset`.
- Create `.github/workflows/ci-exact-pins.yml` modelled on `.github/workflows/ci-internal-peer-deps.yml` (`pull_request` to `next`, paths `packages/**/package.json`, `pnpm-lock.yaml`, `.github/scripts/check-exact-pins.mjs`, `.github/workflows/ci-exact-pins.yml`; `permissions: contents: read`; Node 24; runs `node .github/scripts/check-exact-pins.mjs`).
- Add `npm run check:exact-pins` to the `### Local CI mirrors` block in `CLAUDE.md` next to `check:guards`.
- Create `.changeset/pin-foblex-flow-18-0-0.md` with `"@memberjunction/ng-flow-editor": patch`.

- [ ] **Step 3: Run verification commands**

Run:
- `pnpm run check:exact-pins`
- `pnpm run check:exact-pins:test`
- `node .github/scripts/check-explorer-external-deps.mjs`
- `npx vitest run --config .github/scripts/vitest.config.mts __tests__/test-workflow-structure`
- `pnpm run check:claude-md`
- `pnpm run check:changeset`
- `cd packages/Angular/Generic/flow-editor && pnpm run build && pnpm test`
Expected: All exit 0.

- [ ] **Step 4: Commit Task 2**

Stage the modified and created files and commit.

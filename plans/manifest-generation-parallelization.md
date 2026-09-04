# Parallelizing class-registration manifest generation

## Status

- **Status**: Analysis complete — **implementation deliberately deferred** (see *Why this is not
  implemented yet*)
- **Created**: 2026-08-23
- **Origin**: the surviving item 2.1 from the DX audit in PR #2837 (closed), re-scoped against the
  current tree
- **Blocked on**: a working environment — `pnpm install && pnpm run build` must succeed before any
  of this can be validated

## Overview

Root `package.json` regenerates **9** class-registration manifests as a serial `&&` chain:

```
"mj:manifest": "pnpm run mj:manifest:server-bootstrap && pnpm run mj:manifest:server-bootstrap-lite
  && pnpm run mj:manifest:ng-bootstrap && pnpm run mj:manifest:ng-bootstrap-lite
  && pnpm run mj:manifest:api && pnpm run mj:manifest:explorer && pnpm run mj:manifest:a2a-server
  && pnpm run mj:manifest:mcp-server && pnpm run mj:manifest:codegen-api"
```

It runs from `postbuild`, so **every full build pays the full serial cost**. Four of the nine have
no ordering relationship with anything, and the remaining five have only two real constraints — so
most of that time is avoidable.

## ⚠️ The finding that matters most: the current order is already wrong

This is not a performance note. **`mj:manifest:server-bootstrap` runs *first*, before
`mj:manifest:server-bootstrap-lite` — and that violates a real ordering constraint.**

The mechanism, from `packages/CodeGenLib/src/.../GenerateClassRegistrationsManifest.ts`:

- Every step runs with `syncDependencies` **on** (none passes `--no-sync-deps`), so
  `reconcileDependencies` **writes `<appDir>/package.json`**.
- Other steps **read** those same files in `walkDependencyTree`.
- `readPackageJson` **swallows a JSON parse error and returns `null`**, and the walker then drops
  that package *and its entire subtree* — **silently**, with `success: true`.

So a torn read produces a **smaller manifest with no error and no warning**. On the `api` and
`explorer` targets — whose outputs are gitignored and therefore *not* covered by the freshness
gate — that surfaces as a class tree-shaken out of a shipped bundle, with nothing in CI to catch it.

`server-bootstrap`'s dependency walk reads `packages/ServerBootstrapLite/package.json`, which the
lite step may rewrite. Running `server-bootstrap` first is exactly the wrong order.

This has presumably not bitten anyone because the steps are serial today, so the write completes
before the next read begins. **It becomes live the moment anything runs them concurrently** — which
is precisely what this plan proposes, and precisely why it must not be done casually.

## Ordering constraints (derived from code, not measured)

| Constraint | Kind | Why |
|---|---|---|
| All 9 run **after** the full build | Hard | `resolveTypesEntryPoint` reads each dependency's `dist/**.d.ts`; `filterToExportedClasses` drops any class it cannot find there. Already guaranteed by `postbuild` — do not move `mj:manifest` earlier. |
| `server-bootstrap-lite` → `server-bootstrap` | Real | `server-bootstrap`'s walk reads `ServerBootstrapLite/package.json`, which the lite step may rewrite. **Currently violated.** |
| `ng-bootstrap` + `ng-bootstrap-lite` → `explorer` | Real | The explorer step's `--lazy-config` pass walks the full tree (`excludePackages=[]`) and reads both Bootstrap `package.json` files. Currently honoured. |
| `api`, `a2a-server`, `mcp-server`, `codegen-api` | None | All pass `--exclude-packages @memberjunction`, so the walker skips the MJ tree entirely and their appDirs appear in no other step's tree. Freely parallel. |

No two steps write the same output file.

**Proposed waves** — wave 1: `server-bootstrap-lite`, `ng-bootstrap`, `ng-bootstrap-lite`;
wave 2: `server-bootstrap`, `api`, `explorer`, `a2a-server`, `mcp-server`, `codegen-api`.

## Recommended approach

A stdlib-only Node runner at `scripts/run-manifests.mjs` that **reads the 9 command strings back
out of root `package.json`** (so the commands and the runner cannot drift), executes them in the
two waves above, and caps concurrency (default 4).

The 9 individual `mj:manifest:*` scripts stay exactly as they are — they are the runner's source of
truth and are referenced individually by `packages/Angular/Bootstrap/CLAUDE.md`,
`packages/Angular/BootstrapLite/CLAUDE.md`, `packages/CodeGenLib/CLAUDE.md`, connector docs, and
~15 files under `plans/`. Only the `mj:manifest` aggregate line changes.

### Alternatives, and why they were rejected

- **Turbo task `codegen:manifest`** — *unsound*, not merely heavier. `mj:manifest:explorer` writes
  `lazy-feature-config.ts` into `@memberjunction/ng-explorer-core`, a **different package** than the
  task would live in, and turbo cannot express `outputs` outside a task's own directory — so that
  write is invisible to hashing in both packages. Separately, the task writes into `src/`, which is
  `build`'s input: declaring it as `outputs` makes turbo delete and restore live source, while
  caching it means a cache hit skips regeneration and the freshness gate passes-while-stale.
- **`pnpm run --parallel`** — does not apply. It runs *one* script name across workspace packages;
  these are nine names in root `package.json`. Making it work means relocating all nine into their
  packages first — all of turbo's cost, none of its ordering.
- **`npm-run-all` / `run-p`** — works mechanically, but adds an unmaintained dependency (last
  published 2018) and expresses waves only as nested quoted strings.
- **A flat capped runner with no waves** — fixes memory, leaves the silent-truncation race
  unaddressed. Rejected as a false middle ground.

## Why this is not implemented yet

**It cannot be validated in the environment this analysis was produced in, and an unvalidated
concurrency change to the build's critical path — whose failure mode is silent — is not worth
shipping on an estimate.**

Specifically, none of the following could be done:

- **Run a single manifest.** There is no `node_modules` and no `dist/` anywhere in the tree, so
  there is no `mj` binary. Even with dependencies restored, `mj codegen manifest` needs a completed
  build: it reads each dependency's `dist/**.d.ts`, and with no `dist` it would drop nearly every
  class and write **near-empty manifests over committed, CI-gated files**.
- **Measure the serial baseline.** Every timing figure available is an estimate from reading code.
  The expected speedup (~3–4×) is unquantified; there is no measurement for even one step.
- **Measure memory.** `codegen manifest` is listed in `light-commands.ts`, but that only skips the
  CLI's explicit bootstrap — the command still imports `@memberjunction/codegen-lib`, whose barrel
  pulls `server-bootstrap-lite/mj-class-registrations` (the same ~1,400-class graph), plus `mssql`,
  `pg`, `ai-provider-bundle`, and the TypeScript compiler. Estimated several hundred MB to ~1.5 GB
  RSS per process. The concurrency cap of 4 exists to make that safe *without* a measurement — but
  the cap itself should be chosen from a real number.
- **Diff parallel output against serial output.** The one test that would actually prove the waves
  are correct.

## Doing this properly — the sequence

1. `pnpm install && pnpm run build` on a machine that can complete it.
2. **Time the serial baseline.** Record per-step wall clock for all 9. Without this there is no way
   to claim a speedup or to choose a concurrency cap.
3. **Fix the ordering bug on its own**, serially: move `server-bootstrap` after
   `server-bootstrap-lite`. Regenerate, and check whether any committed manifest changes — if one
   does, that is evidence the bug was already producing truncated output, and it belongs in its own
   PR with that diff explained.
4. Add `scripts/run-manifests.mjs` with waves + cap, and a `--dry-run` that prints the plan.
5. **Prove equivalence**: run serial, save all 9 outputs, run parallel, `git diff` — byte-identical,
   repeated several times to shake out races.
6. Measure peak RSS at the chosen cap; only then commit to a number.
7. Update `packages/CodeGenLib/CLAUDE.md` and
   `plans/complete/codegen/CLASS_MANIFEST_GUIDE.md:48` (which asserts a "correct order" that nothing
   in the generator actually enforces).

## Out of scope — but file an issue

Eight of the nine target packages have a **`prebuild`** script that runs the *same* manifest
command. Turbo shells out to `pnpm run build`, so those run too — up to 4 heavy manifest processes
already fan out concurrently under turbo's default concurrency of 10, with **no cap and no wave
ordering**. The silent-truncation race described above already exists on that path today, and the
root-level runner proposed here does not fix it. That deserves its own investigation once the root
path is measured.

## Testing strategy

- Byte-identical output vs. the serial chain, over repeated runs (step 5 above).
- The existing freshness gate (`.github/workflows/test.yml`) is the backstop: it diffs the committed
  manifests after a full build, so any regression in *content* fails the merge backstop.
- A `--dry-run` unit test asserting the wave assignment matches the constraint table above.
- Peak-RSS measurement at the chosen cap on an `ubuntu-latest` runner.

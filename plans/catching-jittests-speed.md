# Catching JiTTests: analyzer fix, run speed and the Hydrogen generator

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before the next gate-1 backtest, stop the analyzer from silently dropping its risk notes, cut the Docker time of a run, record where the time goes, and register `gemini-4-hydrogen` as a generator model.

**Architecture:** All changes are inside `packages/TestingFramework/jit-catching` on branch `CB-jit-speed` (worktree `/Users/caelebbalanesi/PROJ2/.wt-jit-speed`), merged `--no-ff` into `CB-jit-catching-design` by the controller. The pipeline order becomes analyze → prepare base (filtered install) → build base → generate → prepare head (filtered install) → build head (shared turbo cache) → run → judge; coverage is measured only when `Settings.Coverage` is true and the backtest turns it off.

**Tech Stack:** TypeScript, vitest, zod schemas, pnpm 10.33, turbo, Docker sandbox (`src/sandbox/Sandbox.ts`), MJ AI providers.

**Spec:** `plans/catching-jittests-design.md` (§5.4 build, §8.1 analyzer, §14.1 gate 1) and the tuning findings in `plans/catching-jittests-spike/GATE1.md` "Tuning". Findings that drive this plan (2026-11-12 diagnostics on the 70 tuning runs): 34 of 70 runs used the analyzer's silent fallback (two attempts, each cut at the 2000 output-token cap, `OutputTokens` exactly 4000) and ran with no risk notes; per-test coverage runs only feed promotions, which gate 1 never uses; a typical run spends ~10 min preparing two revisions and ~14 min in execute, of which the generator is ~4 min.

## Global Constraints

- Failing test first for every behavior change; only tests that fail because of the change (no change-detector tests). Run `pnpm test` in the package; all tests green before the commit.
- Comments describe current behavior only; never what changed or why. JSDoc on important functions.
- Strong typing: no `any`, no `as any`, no `unknown` shortcuts (`.claude/rules/typescript-style.md`).
- Record schemas (`src/schemas.ts`) must keep reading every existing `generation.json` / `execution.json` under `.jit-catch/runs`: every new field is optional with a default.
- Secrets: never print or log key values; the sandbox stays `--network none`.
- Stage explicitly (`git add <file>`), never `git add -A`/`.`; commit on `CB-jit-speed` only; never push to `next`/`main`. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Package gates before each commit: `pnpm test`, `pnpm run build` (package), and from the repo root `npm run check:guards`.
- `README.md` of the package documents current behavior; update the lines a task changes.

---

### Task 1: Analyzer reply cap and loud fallback

**Files:**
- Modify: `src/analyzer/ChangeAnalyzer.ts` (`ask`, `Analyze`)
- Modify: `src/types.ts` (`ChangeAnalysis`), `src/schemas.ts` (`ChangeAnalysisSchema`)
- Modify: `src/report/Report.ts` (one line in the per-model section)
- Test: `src/__tests__/ChangeAnalyzer.test.ts`, `src/__tests__/Report.test.ts`

**Interfaces:**
- Consumes: `ChangeAnalyzerOptions.LLM.ChatCompletion` (MJ `BaseLLM`), `AnswerSchema`.
- Produces: `ChangeAnalysis.Fallback: boolean` (true when both attempts failed and the analysis carries no risks and `packages_to_test` from the fallback). Schema: `Fallback: z.boolean().default(false)`.

- [ ] **Step 1: Failing tests.** In `ChangeAnalyzer.test.ts`, with the existing fake LLM: (a) the first `ChatCompletion` call passes `maxOutputTokens: 8000` (today 2000); (b) when the first reply is cut mid-JSON, the second call's system prompt contains the sentence `At most 6 risks; keep each field under 300 characters.` and the first call's does not; (c) when both replies are invalid, `Analyze` returns `Fallback: true`, `Risks: []`, and writes one stderr line matching `/analyzer reply was not valid JSON twice; continuing with no risk notes/`; (d) a valid reply returns `Fallback: false`. In `Report.test.ts`: a ledger whose runs have one `Fallback: true` analysis renders the line `- Analyzer fallbacks (no risk notes): 1 of 2 runs` in that model's section. Run them; all must fail for the right reason (missing field, wrong cap, no stderr line, no report line).
- [ ] **Step 2: Implement.** `maxOutputTokens: 8000` on both attempts. The second attempt appends the sentence from (b) to the system prompt. After two failures: `process.stderr.write(\`run ${run.ID}: analyzer reply was not valid JSON twice; continuing with no risk notes\n\`)` from `Analyze` (which knows the run), and `Fallback: true` in the returned analysis; otherwise `Fallback: false`. Report: count runs with `Analysis.Fallback` per model and render the line after "Session end reasons". Old records read as `Fallback: false`.
- [ ] **Step 3: Gates and commit.** `pnpm test`, `pnpm run build`, `npm run check:guards` (repo root). README: the analyzer paragraph states the 8000-token cap, the second attempt's shorter format, and the fallback line. Commit `fix(jit-catching): analyzer keeps its risk notes; the fallback is recorded and reported`.

### Task 2: Register `gemini-4-hydrogen`

**Files:**
- Modify: `src/settings.ts` (`DEFAULT_SETTINGS.Prices`)
- Modify: `README.md` (model list, if one exists)
- Test: `src/__tests__/settings.test.ts` or `src/__tests__/Backtest.test.ts` (`UnpricedModel`)

- [ ] **Step 1: Failing test.** `UnpricedModel(DEFAULT_SETTINGS.Prices, 'gemini-4-hydrogen')` returns `null`; today it returns the model name.
- [ ] **Step 2: Implement.** Add `'gemini-4-hydrogen': { Input: 1.5, Output: 7.5, CachedInput: 0.075 }` (USD per million tokens, Google AI Studio pricing page, Standard tier, 2026-11-12; output price includes thinking tokens). `GeneratorVendor` already maps `gemini-*` to the Gemini runner; no other change.
- [ ] **Step 3: Gates and commit.** Commit `feat(jit-catching): price gemini-4-hydrogen`.

### Task 3: Coverage only when wanted; off in backtests

**Files:**
- Modify: `src/settings.ts` (`SettingsSchema`, `DEFAULT_SETTINGS`: `Coverage: z.boolean()`, default `true`)
- Modify: `src/pipeline/Execute.ts` (`executeOn` takes the flag), `src/backtest/Backtest.ts` (runs with `{ ...o.Settings, Coverage: false }`)
- Test: `src/__tests__/Execute.test.ts`, `src/__tests__/Backtest.test.ts`

- [ ] **Step 1: Failing tests.** Execute: with `Coverage: false` the fake target's `Coverage` is never called and `execution.json` has `Coverage: []` even when tests pass on both; with `Coverage: true` it is called (existing behavior; only add the assertion if no test covers it). Backtest: the settings handed to `RunAll` have `Coverage: false` even when the loaded settings say `true`, and stdout of the backtest start carries `coverage off (backtest)` once.
- [ ] **Step 2: Implement.** Thread `Settings.Coverage` into `executeOn`; `const coverage = settings.Coverage && passing.length ? await target.Coverage(...) : [];`. Backtest overrides the flag and prints the line once per `backtest` invocation. README: backtests never measure coverage because promotions are not a gate-1 input.
- [ ] **Step 3: Gates and commit.** Commit `perf(jit-catching): coverage is a setting and backtests turn it off`.

### Task 4: Stage timings in the run records

**Files:**
- Modify: `src/types.ts`, `src/schemas.ts` (`GenerationFile.Timings`, `ExecutionFile.Timings`, both optional objects of integer milliseconds)
- Modify: `src/pipeline/Generate.ts`, `src/pipeline/Execute.ts` (measure and write), `src/report/Report.ts` (median per stage per model)
- Test: `src/__tests__/Generate.test.ts`, `src/__tests__/Execute.test.ts`, `src/__tests__/Report.test.ts`, `src/__tests__/schemas.test.ts`

**Interfaces:**
- Produces: `GenerationFile.Timings?: { AnalyzeMs, PrepareBaseMs, BuildBaseMs, GenerateMs }`, `ExecutionFile.Timings?: { PrepareHeadMs, BuildHeadMs, TypeCheckMs, RunMs, CoverageMs }`. Schema: `z.object({...}).partial().optional()` with `z.number().int().nonnegative()` fields.

- [ ] **Step 1: Failing tests.** With a fake clock (inject `Now: () => number` through the existing deps objects, default `Date.now`), `generation.json` carries the four numbers and `execution.json` the five; one stdout line per step `run <id>: stages analyze 1s, prepare base 2s, build base 3s, generate 4s` and `run <id>: stages prepare head 1s, build head 2s, type-check 3s, run 4s, coverage 5s`. Old records without `Timings` still parse (schemas test). Report: a `#### Stage time (median minutes)` block per model listing each stage with its median over the ledger's runs, `n/a` when no run has it.
- [ ] **Step 2: Implement** with a small helper `Timed(now, fn)` in `src/pipeline/Timing.ts` returning `{ Result, Ms }`.
- [ ] **Step 3: Gates and commit.** Commit `feat(jit-catching): per-stage timings in the run records and the report`.

### Task 5: One turbo cache per run, shared by base and head

**Files:**
- Modify: `src/target/VitestCatchTarget.ts` (`BuildPackages`, `inSandbox`), `src/target/VitestCatchTarget.ts` (`RemoveStore` also removes the cache folder)
- Test: `src/__tests__/VitestCatchTarget.test.ts`

- [ ] **Step 1: Failing tests.** With the fake sandbox runner: a build mounts `<WorkRoot>/turbo-cache` read-write at `/turbo-cache` and sets `TURBO_CACHE_DIR=/turbo-cache` (today `<worktree>/.turbo/cache`); the folder exists on the host before the build; `RemoveStore` removes it.
- [ ] **Step 2: Implement.** `BuildPackages` passes an extra mount through `inSandbox` (an optional `extraMounts` argument, used in 'rw' mode only). The `--cache=local:rw,remote:r` flag stays. README: base and head share the run's turbo cache, so the head build recompiles only packages whose inputs changed.
- [ ] **Step 3: Gates and commit.** Commit `perf(jit-catching): base and head builds share one turbo cache per run`.

### Task 6: Analyze first, then a filtered install

**Files:**
- Modify: `src/pipeline/Generate.ts` (`GenerateStep`: analyze before `Prepare`), `src/pipeline/Execute.ts`, `src/backtest/Match.ts` (pass the packages under test to `Prepare`)
- Modify: `src/target/VitestCatchTarget.ts` (`Prepare(revision, packages?: string[])`, `installInSandbox`), `src/pipeline/Deps.ts` (`PipelineTarget`), `src/contracts/BaseCatchTarget.ts`
- Test: `src/__tests__/Generate.test.ts`, `src/__tests__/Execute.test.ts`, `src/__tests__/Match.test.ts`, `src/__tests__/VitestCatchTarget.test.ts`

**Interfaces:**
- Produces: `Prepare(revision: RevisionRef, packages?: string[]): Promise<PreparedRevision>`. When `packages` is given, the worktree is added, the names present at the revision are kept (`PackagesAt`), and the install runs `pnpm install --offline <lockfile flag> --ignore-scripts --store-dir … --filter . --filter <name>... [--filter <name>...] && pnpm rebuild …`; with no name present, or `packages` absent, the full install runs as today. `--filter .` keeps the root project (its devDependencies hold vitest and turbo).

- [ ] **Step 1: Measure first (no code change).** On a prepared worktree of one tuning head (for example #3831's head `373f180`, package `@memberjunction/core`), time in the sandbox: (a) the full install as today; (b) `--filter . --filter @memberjunction/core...`; (c) (b) plus `--config.dedupe-peer-dependents=false`. Then from `packages/MJCore`, `npx vitest --version` and `npx turbo --version` must work after (b) or (c). Record the three times and the chosen flags in the report file. If neither (b) nor (c) is at least 2× faster than (a), stop and report `BLOCKED` with the numbers.
- [ ] **Step 2: Failing tests.** Generate: `Analyzer.Analyze` is called before `Target.Prepare`, and `Prepare` receives `found.PackagesToTest`. Execute and Match: `Prepare` for head receives the packages of the tests. Target: with the fake runner, `Prepare(rev, ['@memberjunction/core', '@memberjunction/missing'])` where only `core` has a `package.json` in the worktree runs the install with `--filter . --filter @memberjunction/core...` (and the dedupe flag when Step 1 chose it); `Prepare(rev)` and `Prepare(rev, [])` run the unfiltered install.
- [ ] **Step 3: Implement.** Keep the `ERR_PNPM_OUTDATED_LOCKFILE` retry and the cleanup-on-throw. README: the install covers the root project and the packages under test with their dependencies.
- [ ] **Step 4: Gates and commit.** Commit `perf(jit-catching): analyze first, then install only the packages under test`.

---

## Self-review

- Spec coverage: analyzer §8.1 (Task 1); §5.4 build and cache (Task 5); gate-1 inputs unchanged (Task 3 removes only promotions from backtests); cost table (Task 2); measurement (Task 4) for the speed claims.
- Type consistency: `Settings.Coverage` (Task 3) is read in `Execute.ts`; `Prepare(revision, packages?)` (Task 6) is the only signature change and every caller is listed; `Timings` names are the same in types, schemas and report.
- Order: Tasks 1–4 are independent of each other; Task 5 and Task 6 both touch `VitestCatchTarget.ts` and run last, Task 5 before Task 6.

---

## Follow-up found by the first Hydrogen run (2026-11-13)

The sandbox build used `turbo run build --filter=<pkg>...`. Turbo treats the workspace root as a dependency of every package, and the root's `package.json` depends on `@memberjunction/cli`, `integration-test-suite` and `server-bootstrap-lite`. So `@memberjunction/core...` at `373f180` selected 157 packages, not 3. With the full install the build passed but compiled half of the workspace. With the filtered install (Task 6) it failed on packages that had no `node_modules` (#3831, base build).

A first fix (`95ef909f8a`, `--filter=...<pkg>`) was wrong: that form is the package and its dependents, 311 packages. The correct filter is the exact name, `--filter=<pkg>`: turbo then runs the package's build and the builds it depends on through `^build` (3 tasks for core), which is the closure the filtered install covers.

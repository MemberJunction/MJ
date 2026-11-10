# Catching JiTTests — Phase 2 Implementation Plan (Gate 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pass gate 1 (design §14.1): build the backtest corpus, add the `corpus`, `backtest`, `label`, `report` and `clean` commands to `@memberjunction/jit-catching`, fix what the phase 1 runs exposed, run the three-model comparison on the tuning slice, and decide the generator model (D24) with a held-out run.

**Architecture:** Phase 1's pipeline is kept as it is. Phase 2 adds a thin layer around it: a corpus file names the PRs, a backtest ledger drives `RunAll` once per PR and records cost and status so a stopped backtest resumes, a match step re-runs weak catches on head plus the fix PR's diff, labels go through the store as `Feedback`, and the report is a pure function over ledgers, corpus and store that renders markdown. Every real-model step is a stop point (spend).

**Tech Stack:** as phase 1 (TypeScript 5.9 ESM, vitest 4, zod 4, `gh` and `git` via `child_process`, Docker sandbox), plus `GetAgreement` from `@memberjunction/rubrics` for judge calibration.

**Spec:** [`plans/catching-jittests-design.md`](catching-jittests-design.md) §14.1, §13.2, §9.3, D24, D26, D33, and the phase 2 decisions D42–D49 added with this plan. Phase 1 results and the twelve items this plan answers: [`plans/catching-jittests-spike/PHASE1-E2E.md`](catching-jittests-spike/PHASE1-E2E.md) "Design items for phase 2". Execution rules (models, worktrees, merge, gate): [`plans/catching-jittests-execution.md`](catching-jittests-execution.md) §1–§3, with the branch names below.

## Global Constraints

Copied from the spec and the repo rules. Every task's requirements include this section.

- Package: `packages/TestingFramework/jit-catching` (`@memberjunction/jit-catching`, private, ESM). No new package. Corpus files live in the package at `corpus/`; backtest ledgers under `<repo>/.jit-catch/backtests/` (already git-ignored with `.jit-catch/`).
- Integration branch `CB-jit-catching-p2`, cut from `CB-jit-catching-design` (head `841285a10a` or later) with `--no-track`; tracking set to the same-named remote at first push. Task branches `CB-jit-p2-t<N>` (dot removed: `t21`, `t214`), worktrees `PROJ2/.wt-jit-p2-t<N>`. Never `git add -A` or `git add .`. Push only when the user asks.
- Never `npm install`; pnpm only (`pnpm@10.33.0`), `pnpm install` from the repo root after a `package.json` edit. Build: `cd packages/TestingFramework/jit-catching && pnpm run build && pnpm test`; the integration gate also runs `npm run check:guards`, `node .github/scripts/check-esm-imports.mjs packages/TestingFramework/jit-catching` and `node scripts/check-spec-antipatterns.mjs packages/TestingFramework/jit-catching` at the repo root.
- No `any`, no `as any`, no `unknown` as a shortcut. Public members PascalCase, private members camelCase, exported functions and types PascalCase. UUIDs compared with `UUIDsEqual`, never `===`.
- Tests: `src/__tests__/*.test.ts`, vitest, no database, no network, deterministic, < 5 s per file. **Write the failing test first and run it to see it fail; write only tests that fail because of the behaviour the task adds or fixes.** No `it.skip`; no vacuous assertions.
- Comments describe what the code does now, never what changed or why it changed.
- Untrusted code (PR code, install and build scripts, generated tests) runs only in the Docker sandbox (D28). On the host the backtest runs only `git` and `gh`; the match step's `git apply` runs on the host inside the run's head worktree with a diff taken from the repository's own history (D48).
- Keys only in the orchestrating process; never in a brief, report, ledger line, commit or message. Real runs use `env -u CLAUDECODE` and the three keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`); `PreflightEnv` refuses otherwise.
- Every file written under a run folder, the store and a ledger passes the redaction check (D32). Ledgers go through `RedactionCheck.AssertClean` before writing.
- Base and head for a corpus PR: `HeadSHA = M` (the commit that landed the PR on `next`, `mergeCommit.oid` from `gh`), `BaseSHA = M^1` (D33). About 45% of landings on `next` are squash commits with one parent; the same formula holds.
- Stop points (SDD skill, execution plan §5): the corpus curation (2.9, human judgement), every stage that spends money (2.16; 2.17 stages A, B, C; 2.19), and labels from PR authors (2.18). Every real backtest runs with `--max-usd` set to the approved figure.

---

## Decisions this plan adds to the spec (recorded as D42–D49 in `catching-jittests-design.md` §4)

| # | Phase 1 item | Decision |
|---|---|---|
| D42 | 1. Token budget hit by 5 of 12 Opus sessions | `TokensPerSession` default 2,000,000; cache tokens still count (D37); `UsdPerSession` (3) is the cap that acts first |
| — | 2. Cost of a stopped session runs low | `UsageCounter` keeps the largest output count each message id reports (no spec change) |
| D49 | 3. GPT-5.1 judge says High on intended changes; 4. TP Prob uncalibrated | No judge change before gate 1; `report` gives each judge's agreement with the labels and TP Prob by label; §9.3 calibration decides |
| D43 | 5. `PrivateAccess` drops protected-extension subclasses | A subclass the test declares may call a protected member; casts and index access to private or protected members still drop |
| — | 6. Abstract `BaseEntity` makes tests Invalid | One prompt rule: never construct an abstract class; the pipeline type-checks (no spec change) |
| D45 | 7. Re-running a step after `run` | Base source snapshot `<run>/base-src/` written before the base worktree is removed; `assess` uses it when the worktree is gone |
| — | 8. Vitest versions differ per package | No change; the report counts packages whose coverage was not measured |
| D46 | 9. 4 GB store per run stays | Store and fetch folders removed at the end of a run; `jit-catch clean` for work folders |
| D44 | 10. Session details not stored | `Session` record per generation session; `TokenUsage.Role` (Generator, Analyzer, Judge) |
| — | 11. Haiku cache-read price | `claude-haiku-5-5` `CachedInput` 0.01; the report compares table cost with the SDK's recorded cost per model |
| — | 12. Log noise | A host `warning` listener (`FilterProcessWarnings`, installed from the bin entry) drops the `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` process warning; the SDK emits it with `process.emitWarning`, not on the child's stderr |
| D47 | — | Backtest ledger per corpus slice, set and model; resumable; `--max-usd` spend stop |
| D48 | — | Match check: the fix PR's diff is applied with `git apply --3way` in a host-only scratch worktree and committed on top of the head before `Prepare`; host git never runs inside a sandbox-mounted worktree; rebuild, re-run the weak catches |

---

## File structure

New or changed files, all under `packages/TestingFramework/jit-catching/` unless stated.

```
corpus/
  gate1.json                      # the curated corpus (task 2.9): bug pairs and clean PRs with slices
  smoke.json                      # 2 bug + 2 clean PRs from the tuning slice (task 2.16)
src/
  types.ts                        # TokenRole, TokenUsage.Role, SessionRecord, GenerationResult.EndReason/Turns
  schemas.ts                      # the same; GenerationFile.Sessions and BaseSourceDir (both default for old files)
  settings.ts                     # TokensPerSession 2_000_000; Haiku CachedInput 0.01
  cli.ts                          # corpus | backtest | label | report | clean dispatch and options
  contracts/BaseCatchStore.ts     # SaveSessions, ListSessions
  store/FileCatchStore.ts         # sessions.jsonl
  generator/UsageCounter.ts       # largest output snapshot per message id
  generator/ClaudeAgentGenerator.ts  # EndReason and Turns on GenerationResult; `FilterProcessWarnings` for the SDK shadow warning
  generator/prompts.ts            # abstract-class rule
  rules/TestAst.ts                # ReceiverDeclaredInTest
  rules/drop/PrivateAccess.ts     # D43
  pipeline/Generate.ts            # explicit base/head with --pr; Sessions; Role tags
  pipeline/Assess.ts              # rules root: worktree or snapshot; Role 'Judge'
  pipeline/Run.ts                 # FinishRun: snapshot, cleanup base, remove store
  pipeline/BaseSnapshot.ts        # SnapshotBaseSources, CheckedBaseSourceDir
  pipeline/Clean.ts               # CleanRun, FinishedRunIDs
  pipeline/Label.ts               # LabelCatch, LabelPacket
  target/VitestCatchTarget.ts     # RemoveStore, ApplyPatch
  git/GitRepo.ts                  # LaterCommitsTouching, BlameFirstParent, ApplyPatch
  git/GitHub.ts                   # ListMergedPullRequests, GetMergedPullRequest
  corpus/Corpus.ts                # schemas, LoadCorpus, AssignSlices, RevisionsOf
  corpus/Miner.ts                 # MineClean, MineBugs, PullRequestNumberOf
  backtest/Ledger.ts              # BacktestLedger schema, LedgerFile (read/write, atomic)
  backtest/Backtest.ts            # BacktestStep
  backtest/Match.ts               # MatchStep
  report/Stats.ts                 # WilsonInterval
  report/Report.ts                # BuildGateReport, RenderMarkdown
src/__tests__/                    # one test file per new module; existing files extended
plans/catching-jittests-spike/GATE1.md   # smoke, tuning, labels, held-out results (tasks 2.16–2.19)
```

---

## Wave plan (for the controller)

| Wave | Tasks | Notes |
|---|---|---|
| 1 | 2.1, 2.3, 2.4, 2.6, 2.7 | independent; no shared files |
| 2 | 2.2, 2.5, 2.10 | 2.2 and 2.10 both edit `Generate.ts`: run 2.2 first, then 2.10 |
| 3 | 2.8, 2.11, 2.13 | 2.8 needs 2.6 + 2.7; 2.11 needs 2.7 + 2.10 |
| 4 | 2.12, 2.14, 2.15 | 2.12 needs 2.11; 2.14 needs 2.11 + 2.13 |
| 5 | 2.9 (human), 2.16 (spend) | corpus, then smoke |
| 6 | 2.17 (spend, staged A→B→C), 2.18 (human), 2.19 (spend) | serial; expected total ≈ 200 USD, ≈ 110 USD when the Opus sample is skipped |

---

# Phase 2 — Gate 1

### Task 2.1: Usage counter keeps the largest output snapshot; budget and price defaults

**Files:**
- Modify: `src/generator/UsageCounter.ts`
- Modify: `src/settings.ts`
- Test: `src/__tests__/UsageCounter.test.ts`

**Interfaces:**
- Produces: `UsageCounter.Add(messageId, usage)` now updates `OutputTokens` when a later snapshot of the same id reports more output tokens. `DEFAULT_SETTINGS.Limits.TokensPerSession === 2_000_000`; `DEFAULT_SETTINGS.Prices['claude-haiku-5-5'].CachedInput === 0.01`.

- [ ] **Step 1: Failing test**

```ts
it('keeps the largest output count a message id reports, and still counts the id once', () => {
  const c = new UsageCounter();
  c.Add('m1', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 });
  c.Add('m1', { input_tokens: 10, output_tokens: 420, cache_read_input_tokens: 100 });
  c.Add('m1', { input_tokens: 10, output_tokens: 400, cache_read_input_tokens: 100 });
  expect(c.OutputTokens).toBe(420); expect(c.InputTokens).toBe(10); expect(c.CacheReadTokens).toBe(100); expect(c.Turns).toBe(1);
});
```

Run `pnpm exec vitest run src/__tests__/UsageCounter.test.ts` → FAIL (`OutputTokens` is 5).

- [ ] **Step 2: Implementation**

```ts
/** Host-side token count for one agent session. Each API message id counts once for input; output is the largest count the id reports. */
export class UsageCounter {
    private readonly outputByID = new Map<string, number>();
    ...
    public Add(messageId: string, u: ApiUsage | undefined): void {
        const output = u?.output_tokens ?? 0;
        const previous = this.outputByID.get(messageId);
        if (previous !== undefined) {
            if (output > previous) { this.OutputTokens += output - previous; this.outputByID.set(messageId, output); }
            return;
        }
        this.outputByID.set(messageId, output);
        this.InputTokens += (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0);
        this.CacheReadTokens += u?.cache_read_input_tokens ?? 0;
        this.OutputTokens += output;
    }
    public get Turns(): number { return this.outputByID.size; }
```

Remove the `seen` set (the map replaces it). Update the `BudgetTokens` doc comment: "Output is the largest snapshot per message, so it runs close to the final figure."

- [ ] **Step 3: Settings defaults** (no test; a default value is not behaviour a failing test can pin)

In `DEFAULT_SETTINGS`: `TokensPerSession: 2_000_000` and `'claude-haiku-5-5': { Input: 0.1, Output: 0.5, CachedInput: 0.01 }`. Add to the `Limits` schema comment: `/** TokensPerSession counts input, cache reads and output (D37); UsdPerSession is the cap that acts first on a normal session (D42). */`.

- [ ] **Step 4: Run tests** → PASS. **Commit:** `fix(jit-catching): usage counter keeps the largest output snapshot per message; token budget and Haiku cache price defaults (D42)`.

### Task 2.2: Token roles and session records (D44)

**Files:**
- Modify: `src/types.ts`, `src/schemas.ts`
- Modify: `src/contracts/BaseCatchStore.ts`, `src/store/FileCatchStore.ts`
- Modify: `src/generator/ClaudeAgentGenerator.ts`, `src/pipeline/Generate.ts`, `src/pipeline/Assess.ts`, `src/analyzer/ChangeAnalyzer.ts`
- Test: `src/__tests__/Generate.test.ts`, `src/__tests__/ClaudeAgentGenerator.test.ts`, `src/__tests__/FileCatchStore.test.ts`, `src/__tests__/schemas.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type TokenRole = 'Generator' | 'Analyzer' | 'Judge';
  export interface TokenUsage { Model: string; Role?: TokenRole; InputTokens: number; OutputTokens: number; CacheReadTokens: number; CostUSD: number; }
  export interface SessionRecord { RunID: string; Package: string; Method: GenerationMethod; RiskID: string | null; EndReason: string; Turns: number; Tokens: TokenUsage; TranscriptURL: string | null; Produced: number; Failed: number; }
  export interface GenerationResult { Tests: CandidateTest[]; Tokens: TokenUsage; TranscriptPath: string | null; EndReason: string; Turns: number; }
  ```
  `GenerationFileSchema` gains `Sessions: z.array(SessionRecordSchema).default([])`. `SumTokens` groups by `Role` and `Model`. `BaseCatchStore.SaveSessions(sessions: SessionRecord[])`, `ListSessions(runId: string): Promise<SessionRecord[]>` (file `sessions.jsonl`, key `${RunID}|${Package}|${Method}|${RiskID ?? ''}`).
- Consumes: `AgentMessage` of type `result` already carries `Subtype` and `Turns`.

- [ ] **Step 1: Failing tests**

`Generate.test.ts`:
```ts
it('keeps one model\'s generator and analyzer usage apart by role, and records one session per request with its end reason', async () => {
  // same tools as the first test, but Analyzer.Usage.Model === 'm' (the generator model) and the generator returns
  // { ..., EndReason: r.Method === 'DodgyDiff' ? 'success' : 'aborted_token_budget', Turns: 7 }
  ...
  const g = new RunDir(root, RunID, redaction).ReadGeneration();
  expect(g.Run.TokensByModel.map((u) => [u.Model, u.Role])).toEqual([['m', 'Analyzer'], ['m', 'Generator']]);
  expect(g.Sessions.map((s) => [s.Method, s.RiskID, s.EndReason, s.Turns, s.Produced])).toEqual([['DodgyDiff', null, 'success', 7, 1], ['IntentAware', 'R1', 'aborted_token_budget', 7, 0], ['IntentAware', 'R3', 'aborted_token_budget', 7, 0]]);
});
```
Extend the existing "records a session that throws" test: `expect(g.Sessions[0]).toMatchObject({ EndReason: 'error', Turns: 0, Failed: 1 })`.

`ClaudeAgentGenerator.test.ts`: in the test that drives a fake runner to a `result` message with `Subtype: 'error_max_turns', Turns: 31`, add `expect(result.EndReason).toBe('error_max_turns'); expect(result.Turns).toBe(31);`.

`FileCatchStore.test.ts`: `it('saves sessions and lists them by run', ...)` → `SaveSessions([s1 (run A), s2 (run B)])`; `ListSessions('A')` has one.

`schemas.test.ts`: `it('reads a generation file without Sessions as an empty list', ...)`.

Run → FAIL (fields do not exist).

- [ ] **Step 2: Types and schemas**

Add `TokenRole`, `Role?` on `TokenUsage` (`TokenUsageSchema`: `Role: z.enum(['Generator', 'Analyzer', 'Judge']).optional()`), `SessionRecord` + `SessionRecordSchema`, `EndReason`/`Turns` on `GenerationResult`, `Sessions` on `GenerationFileSchema` with `.default([])`.

- [ ] **Step 3: Generator and steps**

`ClaudeAgentGenerator.Generate`: keep `turns` from the `result` message (`m.Turns`), return `{ Tests, Tokens: { ...usage, Role: 'Generator' }, TranscriptPath, EndReason: subtype, Turns: turns }`.

`Generate.ts`: `generateOrFail` catch path returns `EndReason: 'error', Turns: 0`; after the sessions run build
```ts
const sessions: SessionRecord[] = requests.map((r, i) => ({ RunID: run.ID, Package: r.Package, Method: r.Method, RiskID: r.Risk?.ID ?? null, EndReason: results[i].EndReason, Turns: results[i].Turns,
    Tokens: results[i].Tokens, TranscriptURL: results[i].TranscriptPath, Produced: results[i].Tests.filter((t) => t.GenerationOutcome === 'Produced').length, Failed: results[i].Tests.filter((t) => t.GenerationOutcome === 'Failed').length }));
run.TokensByModel = SumTokens([{ ...t.Analyzer.Usage, Role: 'Analyzer' }, ...results.map((r) => ({ ...r.Tokens, Role: 'Generator' as const }))]);
dir.WriteGeneration({ Run: run, Analysis: analysis, Tests: tests, BaseRootDir: base.RootDir, Sessions: sessions });
```
`SumTokens`: key `${u.Role ?? ''}|${u.Model}`; the summed record keeps `Role` when set.

`Assess.ts`: `judgeUsage.push(...panel.Usage.map((u) => ({ ...u, Role: 'Judge' as const })))`; `save` also calls `store.SaveSessions(gen.Sessions)`.

- [ ] **Step 4: Store** — `SaveSessions`/`ListSessions` in the contract and `FileCatchStore` (`sessions.jsonl`).

- [ ] **Step 5: Run tests** → PASS. Fix the fakes in other tests that build a `GenerationResult` (add `EndReason`, `Turns`). **Commit:** `feat(jit-catching): session records and token roles (D44)`.

### Task 2.3: `PrivateAccess` allows a protected extension point called from a subclass the test declares (D43)

**Files:**
- Modify: `src/rules/TestAst.ts`, `src/rules/drop/PrivateAccess.ts`
- Test: `src/__tests__/PrivateAccess.test.ts`

**Interfaces:**
- Produces: `TestAst.ReceiverDeclaredInTest(receiver: ts.Expression): boolean` — true when every declaration of the innermost receiver's type symbol is in the test source file.

- [ ] **Step 1: Failing tests**

Extend the fixture class the test file writes to base (`SVC` in the test's `ctx` helper) with `protected Hook(): number { return 1; }`. Then:
```ts
it('does not fire when a subclass the test declares calls a protected extension point', () => {
  const src = `import { Svc } from '../../svc'; class Sub extends Svc { public Run(): number { return this.Hook(); } } expect(new Sub().Run()).toBe(1);`;
  expect(rule.Evaluate(ctx(src)).Fired).toBe(false);
});
it('fires on a protected member reached by a cast', () => {
  const src = `import { Svc } from '../../svc'; expect((new Svc() as unknown as { Hook(): number }).Hook()).toBe(1);`;
  expect(rule.Evaluate(ctx(src))).toMatchObject({ Fired: true, Reason: expect.stringMatching(/protected member Hook/) });
});
```
Run → the first FAILS (fires today), the second passes already; keep it only if it fails — it does not, so drop it (the existing cast test covers the private case; the protected-by-cast case is covered by the first test's inverse in step 2's reasoning, not by a new test).

- [ ] **Step 2: Implementation**

`TestAst`:
```ts
/** True when the innermost receiver's type is declared only in the test file (a class the test declares). */
public ReceiverDeclaredInTest(receiver: ts.Expression): boolean {
    const type = this.Checker.getTypeAtLocation(this.InnermostExpression(receiver));
    const declarations = type.getSymbol()?.declarations ?? [];
    return declarations.length > 0 && declarations.every((d) => d.getSourceFile() === this.SourceFile);
}
```
`PrivateAccess.Evaluate`: `if (v === 'private' || (v === 'protected' && !ast.ReceiverDeclaredInTest(m.Receiver))) return { Fired: true, ... }`. Class doc: `/** §9.1, D43: drops a catch whose test reaches a private member, or a protected member from outside a subclass the test declares. */`

- [ ] **Step 3: Run tests** → PASS. **Commit:** `fix(jit-catching): PrivateAccess allows a test subclass to call a protected extension point (D43)`.

### Task 2.4: Prompt rule against abstract classes

**Files:**
- Modify: `src/generator/prompts.ts`
- Test: `src/__tests__/prompts.test.ts`

- [ ] **Step 1: Failing test**

```ts
it('system prompt tells the agent that files are type-checked and abstract classes must not be constructed', () => {
  expect(BuildSystemPrompt(ctx)).toMatch(/abstract class/); expect(BuildSystemPrompt(ctx)).toMatch(/type-check/);
});
```

- [ ] **Step 2: Add one line to the "Never" list in `BuildSystemPrompt`:**

```
  - construct an abstract class (BaseEntity, BaseEngine, ...) or call a constructor with missing arguments: the pipeline type-checks every file with tsc and a type error makes the test Invalid, even when run_test passes; extend the class in the test or use the stubs
```

- [ ] **Step 3: Run tests** → PASS. **Commit:** `fix(jit-catching): prompt names the type-check and abstract classes`.

### Task 2.5: Base source snapshot, store removal and `clean` (D45, D46)

**Files:**
- Create: `src/pipeline/BaseSnapshot.ts`, `src/pipeline/Clean.ts`
- Modify: `src/pipeline/Run.ts`, `src/pipeline/Assess.ts`, `src/schemas.ts`, `src/target/VitestCatchTarget.ts`, `src/cli.ts`, `src/index.ts`
- Test: `src/__tests__/BaseSnapshot.test.ts`, `src/__tests__/Clean.test.ts`, `src/__tests__/Assess.test.ts`, `src/__tests__/Run.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** Copies each package's src/ (without src/__tests__/jit), tsconfig.json and package.json from baseRoot to dest; regular files only, never through a symlink. Returns the copied file count. */
  export function SnapshotBaseSources(baseRoot: string, packageDirs: string[], dest: string): number;
  /** dest's real path must be <run>/base-src; throws otherwise (same contract as CheckedBaseRootDir). */
  export function CheckedBaseSourceDir(dir: RunDir, recorded: string): string;
  /** Snapshot, record BaseSourceDir in generation.json, remove the base worktree, remove the store and fetch folders. */
  export async function FinishRun(dir: RunDir, target: Pick<VitestCatchTarget, 'Cleanup' | 'RemoveStore'>, packageDirs: string[]): Promise<void>;
  /** Removes work/, pnpm-store/ and scratch/ of one run; keeps the JSON files, transcripts and base-src. Worktrees go through git first. */
  export async function CleanRun(repoRoot: string, runID: string, repo: Pick<GitRepo, 'RemoveWorktree'>): Promise<void>;
  /** Run IDs under .jit-catch/runs that have an assessment.json. */
  export function FinishedRunIDs(repoRoot: string): string[];
  ```
  `VitestCatchTarget.RemoveStore(): Promise<void>` removes `StoreDir` and `<WorkRoot>/*-fetch`, `<WorkRoot>/*-pnpm-version`. `GenerationFileSchema.BaseSourceDir: z.string().nullable().default(null)`. CLI: `clean --run <id>` or `clean --all-finished`.
- Consumes: `CheckedBaseRootDir` (RunDir.ts), `CleanupBase` (Run.ts).

- [ ] **Step 1: Failing tests**

`BaseSnapshot.test.ts`: builds a fake base root with `packages/X/src/a.ts`, `packages/X/src/__tests__/jit/t.jit.test.ts`, a symlink `packages/X/src/link.ts → /etc/hosts`, `packages/X/tsconfig.json`; `SnapshotBaseSources(root, ['packages/X'], dest)` copies `a.ts` and `tsconfig.json`, not the jit test and not the symlink. `CheckedBaseSourceDir` rejects a folder outside the run.

`Assess.test.ts`: `it('assesses from the base source snapshot when the base worktree is gone', ...)`: write generation with `BaseRootDir` = a folder that does not exist and `BaseSourceDir` = `<run>/base-src` holding `packages/X/src/svc.ts`; `AssessStep` runs and PrivateAccess still drops test C. Today → FAIL (`CheckedBaseRootDir` throws).

`Run.test.ts`: `it('FinishRun snapshots the tested packages, records BaseSourceDir, removes the base worktree and the store', ...)` with a fake target recording calls.

`Clean.test.ts`: `CleanRun` removes `work`, `pnpm-store`, `scratch`, calls `RemoveWorktree` for `work/base` and `work/head` when present, keeps `generation.json`; rejects an invalid run ID. `FinishedRunIDs` lists only runs with `assessment.json`.

`cli.test.ts`: `clean --run <id>` calls `deps.CleanRun`; `clean` without a selector returns 2.

- [ ] **Step 2: Implementation** — `BaseSnapshot.ts` walks with `readdirSync(..., { withFileTypes: true })`, copies `isFile()` entries only, skips `isSymbolicLink()`, skips `src/__tests__/jit`. `FinishRun` in `Run.ts`: `const gen = dir.ReadGeneration(); const dest = join(dir.Path, 'base-src'); SnapshotBaseSources(CheckedBaseRootDir(dir, gen.BaseRootDir), packageDirs, dest); dir.WriteGeneration({ ...gen, BaseSourceDir: dest }); await CleanupBase(dir, gen, (r) => target.Cleanup(r)); await target.RemoveStore();`. `RunAll` calls `FinishRun` with `gen.Analysis.PackagesToTest.map(dir of package)`. `AssessStep`: `const rulesRoot = existsSync(join(dir.Path, 'work', 'base')) ? CheckedBaseRootDir(dir, gen.BaseRootDir) : CheckedBaseSourceDir(dir, gen.BaseSourceDir ?? '')` and `ctx.BaseRootDir = rulesRoot`. CLI adds `clean` to the implemented set with a `CleanRun` dep.

- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): base source snapshot, store removal and clean command (D45, D46)`.

### Task 2.6: GitHub: merged PRs and merge commits

**Files:**
- Modify: `src/git/GitHub.ts`
- Test: `src/__tests__/GitHub.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface MergedPullRequest { Number: number; Title: string; MergedAt: string; MergeSHA: string; Author: string; HeadRef: string; }
  export interface MergedPullRequestDetail extends MergedPullRequest { Body: string; Files: string[]; }
  /** gh pr list --state merged --base next --search "merged:<Since>..<Until>" --limit 1000; throws when 1000 come back (window too wide). */
  public async ListMergedPullRequests(o: { Since: string; Until: string }): Promise<MergedPullRequest[]>;
  /** gh pr view <n> --json number,title,body,mergedAt,mergeCommit,author,files,headRefName; throws when the PR is not merged. */
  public async GetMergedPullRequest(n: number): Promise<MergedPullRequestDetail>;
  ```

- [ ] **Step 1: Failing tests** with a fake runner: maps the JSON (`mergeCommit.oid` → `MergeSHA`, `files[].path` → `Files`); throws on 1000 results; throws on `mergeCommit: null`.
- [ ] **Step 2: Implementation** with zod schemas, same style as `GetPullRequest`.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): list merged PRs and read merge commits through gh`.

### Task 2.7: Corpus schema, slices and revision pairs (D33)

**Files:**
- Create: `src/corpus/Corpus.ts`
- Test: `src/__tests__/Corpus.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const SliceSchema = z.enum(['Tuning', 'HeldOut']);
  export const BugPairSchema = z.object({ BugPR: z.number().int().positive(), FixPR: z.number().int().positive(), BugMergeSHA: sha, FixMergeSHA: sha, Description: z.string().min(1), Slice: SliceSchema });
  export const CleanEntrySchema = z.object({ PR: z.number().int().positive(), MergeSHA: sha, Slice: SliceSchema });
  export const CorpusSchema = z.object({ Version: z.literal(1), Seed: z.number().int(), Bug: z.array(BugPairSchema), Clean: z.array(CleanEntrySchema) });
  export type Corpus = z.infer<typeof CorpusSchema>; export type Slice = z.infer<typeof SliceSchema>;
  export function LoadCorpus(path: string): Corpus;
  /** Deterministic: seeded Fisher–Yates (mulberry32). Held-out size = min(n, max(10, round(n / 3))); the rest is Tuning. */
  export function AssignSlices<T extends { Slice?: Slice }>(entries: T[], seed: number): (T & { Slice: Slice })[];
  /** Base is the landing commit's first parent, head the landing commit (D33). */
  export async function RevisionsOf(mergeSHA: string, repo: Pick<GitRepo, 'FirstParent'>): Promise<{ BaseSHA: string; HeadSHA: string }>;
  ```

- [ ] **Step 1: Failing tests** — same seed gives the same assignment; 45 entries → 15 held out; 12 entries → 10 held out; 6 entries → all held out; `RevisionsOf` uses `FirstParent`; `LoadCorpus` rejects a bug PR number that appears again as a bug, fix or clean PR; a fix PR may also be a clean PR (refine).
- [ ] **Step 2: Implementation.** mulberry32:
  ```ts
  function random(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  ```
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): corpus schema, seeded slices and merge-commit revisions (D33)`.

### Task 2.8: Corpus miner (`corpus mine`)

**Files:**
- Create: `src/corpus/Miner.ts`
- Modify: `src/git/GitRepo.ts`, `src/cli.ts`
- Test: `src/__tests__/Miner.test.ts`, `src/__tests__/GitRepo.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Consumes: `GitHub.ListMergedPullRequests`, `GetMergedPullRequest` (2.6); `PackageMap.PackageForPath(...).HasVitest`; `DiffParser` (`src/git/DiffParser.ts`) for the removed-line ranges of the fix diff.
- Produces:
  ```ts
  // GitRepo
  /** SHAs of landing commits after `sha` on origin/next that touch any of `paths` (git log --first-parent --format=%H <sha>..origin/next -- <paths>). */
  public async LaterCommitsTouching(sha: string, paths: string[]): Promise<string[]>;
  /** For each line range, the first-parent landing commit that last changed each line (git blame -l --first-parent -L a,b <sha> -- <path>); one SHA per line. */
  public async BlameFirstParent(sha: string, path: string, ranges: { Start: number; End: number }[]): Promise<string[]>;
  // Miner
  export interface CleanCandidate { PR: number; MergeSHA: string; MergedAt: string; Title: string; Files: string[]; }
  export interface BugCandidate { FixPR: number; FixMergeSHA: string; FixTitle: string; BugPR: number; BugMergeSHA: string; BugTitle: string; BlamedLines: number; Files: string[]; }
  export interface MinerDeps { GitHub: Pick<GitHub, 'ListMergedPullRequests' | 'GetMergedPullRequest'>; Repo: Pick<GitRepo, 'LaterCommitsTouching' | 'BlameFirstParent' | 'Diff' | 'FirstParent' | 'Subject'>; PackageMap: Pick<PackageMap, 'PackageForPath'>; }
  /** True for packages/<X>/src/**.ts that is not a test file and whose package has vitest. */
  export function IsEligibleSource(path: string, map: Pick<PackageMap, 'PackageForPath'>): boolean;
  /** PR number from a landing commit subject: "Merge pull request #n from …" or a trailing "(#n)"; null otherwise. */
  export function PullRequestNumberOf(subject: string): number | null;
  /** Merged PRs in the window that changed eligible source and none of whose lines a later fix PR's landing commit on origin/next removed. */
  export async function MineClean(d: MinerDeps, window: { Since: string; Until: string }): Promise<CleanCandidate[]>;
  /** For each fix PR (title /^fix[(:!]/i) in the window: blame the lines its diff removed at the fix's parent, map the landing commits to PRs, keep the PR with the most blamed lines when it changed eligible source. */
  export async function MineBugs(d: MinerDeps, window: { Since: string; Until: string }): Promise<BugCandidate[]>;
  ```
  CLI: `corpus mine --since <YYYY-MM-DD> --until <YYYY-MM-DD> --out <file>` writes `{ Clean, Bug }` and prints the counts; the miner splits the window into calendar months for `ListMergedPullRequests`.

- [ ] **Step 1: Failing tests** with fake deps: `PullRequestNumberOf` on both subject forms and on a plain subject; `MineClean` drops a PR whose line a later fix landing commit removed (the removed line first-parent-blames to the PR's landing commit) and a PR with only `.md` changes, and keeps a PR whose file only a later non-fix commit, or a fix whose removed lines blame to another PR, touched; `MineBugs` blames two removed ranges, picks the landing commit with more lines, skips a self-blame (introducer = fix), and maps a squash subject `(#123)`; `BlameFirstParent` parses `git blame -l` output (first 40 hex chars per line); `cli` dispatches `corpus mine`.
- [ ] **Step 2: Implementation.** Removed-line ranges: from each hunk, old-side lines (`-` and context) numbered from `OldStart`; keep runs of `-` lines as `{ Start, End }`. Blame at `FixM^1` (`FirstParent(FixMergeSHA)`). Map each blamed SHA to a PR with `PullRequestNumberOf(await Subject(sha))`; a SHA with no number is counted under `null` and ignored. Eligibility of the bug PR is checked with `GetMergedPullRequest(BugPR).Files`. Clean rule: for each landing commit from `LaterCommitsTouching`, read the PR number from its subject and the title from `GetMergedPullRequest`; when the title matches the fix pattern, run the same blame as the bug side on that commit, and drop the candidate when its PR number has blamed lines. PR lookups and blame results are cached per mine run.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): corpus miner (clean set and SZZ bug pairs)`.

### Task 2.9: Curate the gate-1 corpus (human gate)

**Files:**
- Create: `corpus/gate1.candidates.md`, `corpus/gate1.json`

- [ ] **Step 1:** In a checkout with `gh` logged in, run `jit-catch corpus mine --since 2025-05-01 --until 2026-05-01 --out /tmp/clean.json` (clean window: landed at least 6 months before the backtest) and `jit-catch corpus mine --since 2025-11-01 --until 2026-11-01 --out /tmp/bugs.json` (bug window). Both read only; no model calls, no Docker.
- [ ] **Step 2:** Write `corpus/gate1.candidates.md`: a table of up to 70 bug candidates (fix PR and title, bug PR and title, blamed lines, files, a one-line note on whether a unit test could show the bug) and up to 70 clean candidates (PR, title, merged date, files), ordered by blamed lines and by date. Report `DONE_WITH_CONCERNS` listing the pairs the implementer could not judge.
- [ ] **Step 3 (controller + user):** the user picks ~45 of each (or accepts the implementer's ranking), writes the one-line `Description` for each bug pair, and the controller writes `corpus/gate1.json` with `AssignSlices(…, Seed: 1)` applied to each set. Commit: `docs(jit-catching): gate-1 corpus`.

### Task 2.10: Generate on an explicit base and head with the PR's text

**Files:**
- Modify: `src/pipeline/Generate.ts`, `src/cli.ts`
- Test: `src/__tests__/Generate.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Produces: `GenerateStep` with `PR` set **and** `HeadSHA` set uses the given `HeadSHA` (and `BaseSHA` when given), fetches `next`, and takes title and body from the PR. CLI `generate|run --pr <n> --base <sha> --head <sha>` passes both through (already parsed; the dispatch passes them already — verify, add a test).

- [ ] **Step 1: Failing test** — `GenerateStep({ PR: 12, BaseSHA, HeadSHA, Trigger: 'Backtest', ... })` with `GitHub.GetPullRequest` returning `HeadSHA: 'c'.repeat(40)`: `order` shows `prepare Base <BASE_SHA>` and the generation's `Run.HeadSHA === HEAD_SHA` (not `c…`), `pr` text is the PR's title and body.
- [ ] **Step 2:** `resolveRevisions`: `const head = o.HeadSHA ?? pr?.HeadSHA;` fetch `next` when `o.HeadSHA` is set (the landing commit is on `next`); otherwise as today.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): generate on an explicit landing commit with the PR's text`.

### Task 2.11: `backtest` command and ledger (D47)

**Files:**
- Create: `src/backtest/Ledger.ts`, `src/backtest/Backtest.ts`
- Modify: `src/cli.ts`, `src/index.ts`
- Test: `src/__tests__/Ledger.test.ts`, `src/__tests__/Backtest.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Consumes: `LoadCorpus`, `RevisionsOf` (2.7); `RunAll` (Run.ts); `FileCatchStore.GetRun` for the run's cost.
- Produces:
  ```ts
  export const LedgerEntrySchema = z.object({ PR: z.number().int().positive(), Set: z.enum(['Bug', 'Clean']), BaseSHA: sha, HeadSHA: sha, RunID: z.string().nullable(), Status: z.enum(['Pending', 'Assessed', 'Failed']), Error: z.string().nullable(), CostUSD: z.number().nonnegative(), StartedAt: iso.nullable(), EndedAt: iso.nullable(), Match: MatchRecordSchema.nullable() });
  export const BacktestLedgerSchema = z.object({ ID: z.string(), CorpusPath: z.string(), Slice: SliceSchema, Set: z.enum(['Bug', 'Clean', 'Both']), Model: z.string(), CreatedAt: iso, Entries: z.array(LedgerEntrySchema) });
  export class LedgerFile { constructor(repoRoot: string, id: string, redaction: RedactionCheck); public readonly Path: string; public Exists(): boolean; public Read(): BacktestLedger; public Write(l: BacktestLedger): void /* validate, redaction, write to .tmp then rename */; }
  /** `<corpus basename>-<slice>-<set>-<model>` with every non [A-Za-z0-9_-] replaced by '_'. */
  export function LedgerID(corpusPath: string, slice: Slice, set: 'Bug' | 'Clean' | 'Both', model: string): string;
  export interface BacktestOptions { CorpusPath: string; Slice: Slice; Set: 'Bug' | 'Clean' | 'Both'; Model: string; MaxUsd: number; Only?: number[]; RepoRoot: string; Settings: Settings; StoreDir: string; Deps?: BacktestDeps; }
  export interface BacktestDeps { RunAll: typeof RunAll; Repo: Pick<GitRepo, 'FirstParent' | 'Fetch'>; Store: Pick<BaseCatchStore, 'GetRun'>; Redaction: RedactionCheck; }
  /** Creates or resumes the ledger; runs each Pending entry serially with Settings.GeneratorModel = Model and Trigger 'Backtest'; records cost from the stored run; stops with a message when the ledger's cost reaches MaxUsd. Returns the ledger. */
  export async function BacktestStep(o: BacktestOptions): Promise<BacktestLedger>;
  ```
  `MatchRecordSchema` is defined here as a placeholder for 2.12: `z.object({ Status: z.enum(['Matched', 'NotMatched', 'ApplyFailed', 'NoCatch']), ReportedMatched: z.boolean(), Tests: z.record(z.string(), z.boolean()), At: iso })`.
  CLI: `backtest --corpus <file> --slice Tuning|HeldOut --set Bug|Clean|Both --model <generator> --max-usd <n> [--only <n,n>]` (`--max-usd` is required; the command exits 3 when the cap or the failure limit stops it; a model without a price in `Settings.Prices` is refused`.

- [ ] **Step 1: Failing tests** with a fake `RunAll` that records its options and a fake store that returns a run with `TokensByModel` costs: creates the ledger with one entry per corpus PR of the slice and set; passes `Trigger: 'Backtest'`, `Settings.GeneratorModel === Model`, `BaseSHA = FirstParent(MergeSHA)`; a `RunAll` that throws marks the entry `Failed` with the redacted first line and continues; a second call skips `Assessed` and `Failed` entries (only `Pending` run); stops when accumulated cost ≥ `MaxUsd` and leaves the rest `Pending`; `--only` limits the entries. `LedgerFile.Write` refuses a ledger holding a secret.
- [ ] **Step 2: Implementation.** `Fetch('next')` once before the loop. After `RunAll` returns `{ RunID }`, `CostUSD = (await Store.GetRun(RunID))?.TokensByModel.reduce((s, u) => s + u.CostUSD, 0) ?? 0`. Write the ledger after every entry. Print one line per PR: `backtest <ledger ID>: PR #n → run <id> (<cost> USD, total <sum>)`.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): backtest command with a resumable ledger (D47)`.

### Task 2.12: Match check (`backtest match`, D48)

**Files:**
- Create: `src/backtest/Match.ts`
- Modify: `src/target/VitestCatchTarget.ts`, `src/git/GitRepo.ts`, `src/cli.ts`
- Test: `src/__tests__/Match.test.ts`, `src/__tests__/GitRepo.test.ts`, `src/__tests__/VitestCatchTarget.test.ts`

**Interfaces:**
- Consumes: `LedgerFile` (2.11), `FileCatchStore.ListCatches`, `RunDir.ReadGeneration/ReadExecution`, `DefaultRunTarget`.
- Produces:
  ```ts
  // GitRepo
  /** git -C <dir> apply --3way --whitespace=nowarn <patchFile>; returns false when git exits non-zero (conflict). */
  public async ApplyPatch(dir: string, patchFile: string): Promise<boolean>;
  /** Commit of baseSHA plus the patch, built in a host-only scratch worktree that is removed before this returns; null when the patch does not apply. MatchStep calls it before Prepare. */
  public async CommitWithPatch(baseSHA: string, patchFile: string, scratchDir: string): Promise<string | null>;
  // Match
  export interface MatchDeps { Target: Pick<VitestCatchTarget, 'Prepare' | 'ApplyPatch' | 'BuildPackages' | 'WriteTests' | 'Run' | 'Cleanup'>; Repo: Pick<GitRepo, 'Diff' | 'FirstParent'>; Store: Pick<BaseCatchStore, 'ListCatches'>; }
  /** For every Bug entry that is Assessed and has no Match: the weak, non-dropped catches of its run; none → NoCatch. Else prepare head, apply the fix PR's diff (ApplyFailed when it does not apply), build the tested packages, write and run those tests Repeats times; a test that passes every time matches. ReportedMatched is true when a Reported catch matched. */
  export async function MatchStep(o: { LedgerID: string; CorpusPath: string; RepoRoot: string; Settings: Settings; StoreDir: string; Deps?: MatchDeps }): Promise<BacktestLedger>;
  ```
  CLI: `backtest match --ledger <id> --corpus <file>`.

- [ ] **Step 1: Failing tests** with fakes: `NoCatch` when the run has no weak catch; `ApplyFailed` when `ApplyPatch` returns false (no build, no run, head cleaned up); `Matched` with `ReportedMatched` true when the reported catch passes 3/3 on the fixed head; `NotMatched` when it still fails; entries already matched are skipped; `GitRepo.ApplyPatch` returns false when the runner throws with exit code 1.
- [ ] **Step 2: Implementation.** Fix diff: `Repo.Diff(await Repo.FirstParent(FixMergeSHA), FixMergeSHA)`. Tests to run: the `CandidateTest`s of the catches (from `execution.json`). `Cleanup(head)` in `finally`. Ledger written after every entry.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): match check re-runs weak catches on head plus the fix (D48)`.

### Task 2.13: `label` command

**Files:**
- Create: `src/pipeline/Label.ts`
- Modify: `src/cli.ts`, `src/index.ts`
- Test: `src/__tests__/Label.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** Appends Feedback { CatchID, User, Answer, Source: 'Label', At: now }. Answer must be Bug, Intended or TestFault. Throws when the catch is not in the store. */
  export async function LabelCatch(o: { StoreDir: string; CatchID: string; Answer: FeedbackAnswer; User: string; Redaction: RedactionCheck; Now?: () => Date }): Promise<void>;
  /** Markdown for one run: for each weak, non-dropped catch — PR, test file and source, head failure (message, expected, actual), judges' buckets and reasons, and the exact `jit-catch label` command for each answer. */
  export function LabelPacket(o: { StoreDir: string; RepoRoot: string; RunID: string; Redaction: RedactionCheck }): string;
  ```
  CLI: `label --catch <uuid> --answer Bug|Intended|TestFault --user <login>`; `label --run <id>` prints the packet.

- [ ] **Step 1: Failing tests** — saves feedback with Source `Label`; rejects `AuthorChangedPR`; rejects an unknown catch; the packet names each catch once with its label commands; `cli` dispatch and usage errors (`label` without `--catch` or `--run` → 2; bad `--answer` → 2).
- [ ] **Step 2: Implementation.** Catch lookup via `FileCatchStore.ListCatches` over all runs (`ListRuns` then `ListCatches`) — fine at this scale.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): label command and label packets`.

### Task 2.14: `report` command

**Files:**
- Create: `src/report/Stats.ts`, `src/report/Report.ts`
- Modify: `src/cli.ts`, `src/index.ts`
- Test: `src/__tests__/Stats.test.ts`, `src/__tests__/Report.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Consumes: `BacktestLedger` (2.11, with `Match` from 2.12), `Corpus`, `BaseCatchStore.ListRuns/ListCatches/ListFeedback/ListSessions`, `GetAgreement` from `@memberjunction/rubrics`, `BUCKET_SCORE` (JudgePanel.ts).
- Produces:
  ```ts
  /** Wilson score interval for k successes in n trials (z = 1.96); { Low: 0, High: 0 } when n = 0. */
  export function WilsonInterval(k: number, n: number): { Low: number; High: number };
  export interface RateWithInterval { K: number; N: number; Rate: number | null; Low: number; High: number; }
  export interface ModelReport {
      Model: string; Ledgers: string[];
      BugSet: { PRs: number; Run: number; Failed: number; Caught: RateWithInterval /* reported & matched */; AnyWeakMatched: number; NoCatch: number; ApplyFailed: number };
      CleanSet: { PRs: number; Run: number; Failed: number; Reported: number; Labeled: number; Pending: number; FalseAlarms: RateWithInterval /* PRs with ≥1 reported catch labeled Intended or TestFault ÷ run PRs */; RealBugs: number };
      Cost: { TotalUSD: number; PerPR: number | null; PerMatchedCatch: number | null; RecordedUSD: number; TableUSD: number };
      Sessions: Record<string, number>;           // end reason → count
      Drops: Record<string, number>;              // rule → count
      Judges: { Model: string; Agreement: AgreementResult; HighOnIntended: number; LowOnBug: number }[];
      TPProb: Record<'Bug' | 'Intended' | 'TestFault', { N: number; Mean: number | null }>;
      CoverageNotMeasured: number;                // tests with PassesBoth and no coverage row
  }
  export interface GateReport { GeneratedAt: string; Models: ModelReport[]; }
  export async function BuildGateReport(o: { Ledgers: BacktestLedger[]; Corpus: Corpus; Store: BaseCatchStore; RunDirOf: (runID: string) => RunDir }): Promise<GateReport>;
  export function RenderMarkdown(r: GateReport): string;
  ```
  Human label per catch: the latest `Feedback` (by `At`). Score for agreement: Bug → 1, Intended or TestFault → −1 (bug-set catches use the match: Matched → 1, NotMatched → −1); judge score `BUCKET_SCORE[bucket]`, errored judges (null bucket) left out. `TableUSD` is recomputed from tokens and `Settings.Prices`; `RecordedUSD` is the stored `CostUSD`.
  CLI: `report --ledger <id>[,<id>…] --corpus <file> [--out <file.md>]` (prints to stdout without `--out`).

- [ ] **Step 1: Failing tests** — `WilsonInterval(4, 15)` ≈ `{ Low: 0.109, High: 0.520 }` and `(1, 15)` ≈ `{ Low: 0.012, High: 0.298 }` (±0.005; the spec's §14.1 figures); `BuildGateReport` over an in-memory store and two small ledgers: caught rate counts only Reported ∧ Matched, false alarms count only labeled Intended/TestFault, pending labels are reported apart, judge agreement pairs are built per labeled catch, costs sum; `RenderMarkdown` has one section per model and the interval next to each rate; `cli` dispatch.
- [ ] **Step 2: Implementation.** Pure functions over loaded data; the store is read once per run ID.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): gate-1 report with intervals, costs and judge calibration`.

### Task 2.15: README, log noise

**Files:**
- Modify: `README.md` (package), `src/generator/ClaudeAgentGenerator.ts`
- Test: `src/__tests__/ClaudeAgentGenerator.test.ts`

- [ ] **Step 1: Failing test** — `FilterProcessWarnings(codes, sink)` replaces the default process `warning` listeners with one that drops a warning whose `code` is in `codes` and writes every other warning as one line in Node's format to `sink` (default `process.stderr.write`); it writes nothing under `--no-warnings` (command line or `NODE_OPTIONS`) or `NODE_NO_WARNINGS=1`. The SDK shadow notice is a host `process.emitWarning` with code `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`, not child stderr. `bin/jit-catch.js` installs the filter so vitest workers that call `Main` keep their listeners.
- [ ] **Step 2:** Implement; README: a "Commands" section listing `run`, `generate`, `execute`, `assess`, `corpus mine`, `backtest`, `backtest match`, `label`, `report`, `clean` with one line each and the gate-1 procedure (§14.1) in five steps.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `docs(jit-catching): commands and gate-1 procedure; drop the SDK shadow notice`.

### Task 2.16: Smoke backtest (stop point: spend, about 2 USD)

**Files:**
- Create: `corpus/smoke.json`, `plans/catching-jittests-spike/GATE1.md`

- [ ] **Step 1:** `corpus/smoke.json`: 2 bug pairs and 2 clean PRs copied from the tuning slice of `gate1.json`.
- [ ] **Step 2:** With keys exported and `env -u CLAUDECODE`, settings file `{ "GeneratorModel": "claude-haiku-5-5" }`: `backtest --corpus corpus/smoke.json --slice Tuning --set Both --model claude-haiku-5-5 --max-usd 5`, then `backtest match`, then `label --run <id>` for a clean run and one `label --catch` with the user's login, then `report --ledger <id> --corpus corpus/smoke.json --out plans/catching-jittests-spike/GATE1.md`.
- [ ] **Step 3:** Fix what breaks (each fix: failing test first). Record wall time per PR, disk after `clean --all-finished`, and the report in `GATE1.md` under "Smoke". **Commit.**

### Task 2.17: Tuning slice, cheapest generator first (stop point: spend)

The comparison is staged (D24: keep the cheapest model that passes). Each stage is its own spend approval, with the figure re-estimated from the measured cost per PR of the stage before it.

- [ ] **Step 1 (controller):** from the smoke run, compute Haiku's cost per PR and wall time per PR. Ask the user for stage A with the figures (estimate: 60 PRs × ~0.3 USD ≈ 18 USD; phase 1 wall time 10–19 minutes per PR, serial because of Docker CPU).
- [ ] **Step 2, stage A:** `backtest --corpus corpus/gate1.json --slice Tuning --set Both --model claude-haiku-5-5 --max-usd <approved>` in the background (`run_in_background`, log under the scratchpad), then `backtest match`, then `clean --all-finished`. `report` → `GATE1.md` "Tuning / Haiku".
- [ ] **Step 3, stage B (unless Haiku passes both gate-1 rates on the tuning slice):** ask the user (estimate: 60 × ~1.5 USD ≈ 90 USD), then the same commands with `claude-sonnet-5-5`. `report` with both ledgers → "Tuning / Sonnet".
- [ ] **Step 4, stage C:** when Sonnet passes, ask the user for an Opus **sample** of 15 tuning PRs (5 bug + 10 clean, the first of each set in corpus order; `--only <n,n,…>`; estimate 15 × ~3 USD ≈ 45 USD) so the design keeps a three-way comparison; the user may skip it. When Sonnet fails, ask for Opus on the full slice (estimate 60 × ~3 USD ≈ 180 USD). Same commands with `claude-opus-5-5`.
- [ ] **Step 5:** `report` with every ledger → `GATE1.md` "Tuning". Record infrastructure failures and their causes, and the measured cost per PR per model.

### Task 2.18: Clean-set labels (human)

- [ ] `label --run <id>` for every clean-set run with a reported catch (expected: a handful); the user sends each packet to the original PR author (D26), records answers with `label --catch … --user <login>`. A reviewer of the PR labels after a week of silence. Re-run `report`.

### Task 2.19: Tune, decide the model, run the held-out slice (stop point: spend)

- [ ] **Step 1:** From the tuning report: thresholds (§9.3), judge set (drop a judge with no agreement, D49), rule changes (each with a failing test); re-assess the tuning runs with `assess --run <id>` (snapshot, D45) and re-run `report`. No generation spend here; judge calls only.
- [ ] **Step 2:** Choose the generator: the cheapest model that passes both gate-1 rates on the tuning slice (D24). Record the choice and the reasons in `GATE1.md` and in design §15 (phase 2 row).
- [ ] **Step 3:** Ask the user with the measured cost per PR of the chosen model × 30 held-out PRs (≈ 45 USD for Sonnet, ≈ 9 USD for Haiku, ≈ 90 USD for Opus). `backtest --slice HeldOut --set Both --model <chosen>`, `backtest match`, labels for held-out clean catches (as 2.18), `report`. Gate 1 passes when the held-out slice meets ≥ 25% caught and ≤ 10% false alarms (§14.1). Write the final `GATE1.md`, set `DEFAULT_SETTINGS.GeneratorModel` to the chosen model, update the design (§15 row "2 Gate 1": done or not, with the numbers), and hand over with superpowers:finishing-a-development-branch.

---

## Self-review notes

- Spec coverage: §14.1 bug set and clean set (2.8, 2.9), slices (2.7), base/head (2.7, 2.10), match check (2.12), clean-set labels (2.13, 2.18), the three measures with intervals (2.14), three-model comparison (2.17), D24 decision (2.19). The twelve phase 1 items each map to a row in the decisions table above.
- Type consistency: `MatchRecordSchema` is defined in 2.11 and filled in 2.12; `SessionRecord` (2.2) is read by the report (2.14) through `ListSessions`; `BaseSourceDir` (2.5) is read by `AssessStep` and therefore by 2.19's re-assess.
- Out of scope (phase 3): workflows, PR comment, promotion commits, data branch, `recheck`, `feedback`.

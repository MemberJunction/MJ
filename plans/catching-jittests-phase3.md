# Catching JiTTests — Phase 3 Implementation Plan (Gate 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything gate 2 (design §14.2) needs, ready to run on GitHub Actions: PR selection, the three catching jobs and their hand-offs, the recheck and feedback paths, the PR comment, promotion commits, the `jit-catch-data` store branch, and the gate 2 report. All of it is built and tested on a developer machine. Nothing in this plan posts to a real PR, pushes a branch, or dispatches a workflow; the live 4 to 8 weeks of gate 2 start after the checklist in "Not possible before live runs".

**Architecture:** The phase 1 and 2 pipeline (`GenerateStep`, `ExecuteStep`, `AssessStep`, `FileCatchStore`, `RunDir`, `Ranker`, `Label`, `Report`) stays as it is. Phase 3 adds thin, separately testable parts around it: a selector that turns a GitHub event into a list of PRs to run; a run bundle that moves allowlisted parts of a run folder between jobs; a data-branch wrapper that opens the store on an orphan branch and publishes appended JSONL lines with a replay on a rejected push; a pure comment renderer and a publisher that finds the one marked comment; a recheck path that reuses Execute with earlier catching tests; a feedback reader that compares a comment's ticked boxes with the store; a promotion step that commits one stored test with git plumbing; and the workflow YAML that only calls these commands. Every GitHub and git write goes through an injected runner, so tests use fakes and local bare repositories.

**Tech Stack:** as phases 1 and 2 (TypeScript 5.9 ESM, vitest 4, zod 4, `gh` and `git` via `child_process`, Docker sandbox), plus the `yaml` package (2.8.2, already in `pnpm-lock.yaml`) as a dev dependency for the workflow policy test, and system `tar` with gzip for the run bundles. GitHub Actions YAML for the workflows.

**Spec:** [`plans/catching-jittests-design.md`](catching-jittests-design.md) §15 row "3 Gate 2", §5 (jobs, sandbox, mount phases, cache rule, base hand-off), §6 (triggers, risk score), §9.3 (thresholds), §10 (comment, answers, promotion), §11 (store, redaction), §12 (security), §14.2 (gate 2), and decisions D2, D10, D19–D23, D27–D32, D34. The phase 3 decisions below are recorded as D50–D57 in the design by task 3.14. Execution rules (models, worktrees, merge, gate): [`plans/catching-jittests-execution.md`](catching-jittests-execution.md) §1–§3, with the branch names below. Model plan for format and detail: [`plans/catching-jittests-phase2.md`](catching-jittests-phase2.md).

## Global Constraints

Copied from the spec, the repo rules and the user's instructions. Every task's requirements include this section.

- **Local only.** The user runs everything on a developer machine and does not run this on GitHub Actions yet. Every task is verified locally: unit tests with fakes for `gh`, `git` and the sandbox, and local bare repositories for git pushes. Workflow YAML files are written and checked statically (YAML parse, `actionlint` when it is installed, and unit tests of every command they call); they are never dispatched. No task posts a comment on a real PR, pushes a branch, or creates the data branch on the remote. Code that does those things is tested only against fakes and a local bare repository.
- Package: `packages/TestingFramework/jit-catching` (`@memberjunction/jit-catching`, private, ESM). No new package. Workflows live in `.github/workflows/`. Run folders stay under `<repo>/.jit-catch/` (git-ignored).
- Integration branch `CB-jit-catching-p3`, cut from `CB-jit-catching-design` (head `3f3d35306d` or later) with `--no-track`. Task branches `CB-jit-p3-t<N>` (dot removed: `t31`, `t310`), worktrees `PROJ2/.wt-jit-p3-t<N>`. Never `git add -A` or `git add .`; stage each file by name. **Never push**, not even at the end; the user pushes.
- Never `npm install`; pnpm only (`pnpm@10.33.0`), `pnpm install` from the repo root after a `package.json` edit. Build and test: `cd packages/TestingFramework/jit-catching && pnpm run build && pnpm test`. The integration gate also runs, at the repo root, `npm run check:guards`, `node .github/scripts/check-esm-imports.mjs packages/TestingFramework/jit-catching`, `node scripts/check-spec-antipatterns.mjs packages/TestingFramework/jit-catching`, and from task 3.12 on `node .github/scripts/check-app-token-no-merge.mjs`.
- **TDD.** Each code task writes its failing tests first and runs them to see them fail. Write only tests that fail because the behaviour is missing or wrong. No test that only pins a string for its own sake, no `it.skip`, no vacuous assertion. Tests: `src/__tests__/*.test.ts`, vitest, no network, deterministic, < 5 s per file; tests that need git create repositories in a temp folder.
- TypeScript strict. No `any`, no `as any`, no `unknown` as a shortcut. Public members PascalCase, private members camelCase, exported functions and types PascalCase. UUIDs compared with `UUIDsEqual`, never `===`. Functional style as in the package: small exported functions, dependencies injected as `Pick<...>` interfaces.
- Comments describe what the code does now, never what changed or why it changed.
- Untrusted code (PR code, install and build scripts, generated tests) runs only in the Docker sandbox (D28). No new code runs a PR file on the host, reads a PR file as configuration, or checks out PR files where a tool would read them (task 3.10 commits with git plumbing for this reason).
- Secrets never appear in a file, a log line, a brief, a report, a commit or a command-line argument. Tokens reach `git` only through the child process environment (`GIT_CONFIG_*`, task 3.5). Every text written to a bundle, the store, a comment, a summary or a report passes `RedactionCheck.AssertClean` (D32).
- Sub agents never start other agents.
- Stop point (spend): task 3.13 only. It runs the real pipeline once with model keys and needs the user's approval of the figure first.

---

## Decisions this plan makes where the design leaves room (recorded as D50–D57 by task 3.14)

| # | Topic | Options | Pros / cons | Choice |
|---|---|---|---|---|
| D50 | How a job's output reaches the next job | (a) `actions/upload-artifact` of the run folder; (b) a gzip tar of allowlisted parts, uploaded as one file; (c) job 2 rebuilds base itself | (a) drops symlinks and file modes, which breaks pnpm's `node_modules`; (b) keeps them, and the unpack step can check every entry; (c) no big artifact, but adds an install and a cold build to job 2 and departs from D31 | (b). Three bundle kinds: `Meta` (job 1 → jobs 2 and 3: `generation.json`, `base-src/`), `Base` (job 1 → job 2: `work/base/` without `.git`, `work/turbo-cache/`), `Execution` (job 2 → job 3: `execution.json`). Unpack extracts into an empty folder, checks every entry with `lstat`, then moves it in, and rewrites `BaseRootDir` to the new run folder. (c) stays the fallback if hosted-runner upload time is too long |
| D51 | Concurrent writes to `jit-catch-data` | (a) one concurrency group for all writers (design §11); (b) optimistic: publish the appended lines, and on a rejected push re-open the new tip, append them again and retry | (a) GitHub keeps one pending run per group and cancels the older pending one, so a third quick checkbox edit would drop an answer; (b) loses nothing, needs append-only files, which the store already is | (b), up to `DataBranch.PushAttempts` (5) with a short random wait. No shared concurrency group across workflows |
| D52 | What the feedback reader compares | (a) the event's `changes.body.from` against the new body; (b) the ticked boxes against the answers already in the store | (a) misses a tick when an event is dropped or two edits arrive close together; (b) any later event records every tick not yet recorded; the cost is that a tick is credited to the sender of the event that records it | (b). A catch with more than one new tick is not recorded; the comment is re-rendered so it shows one box per catch |
| D53 | How a promotion is committed | (a) check out the PR branch in a worktree and `git commit`; (b) git plumbing: `hash-object`, a temporary index from the PR head tree, `update-index`, `write-tree`, `commit-tree`, push the commit | (a) writes PR files to disk and runs `git` in a PR worktree (hooks path, attributes); (b) no PR file is ever on disk and no worktree is created | (b). Push is a plain fast-forward to `refs/heads/<head branch>`; on rejection it rebuilds on the new head, up to 3 times |
| D54 | Promoted file name | (a) `<uuid>.test.ts` in `__tests__/jit/`; (b) `src/__tests__/<slug>.test.ts`, slug from the first `describe`/`it` title, `jit-<id8>` when there is none, `-<id8>` added when the path exists at the PR head | (a) unreadable, and lives in the throwaway folder that `PurgeNonRegularEntries` cleans; (b) reads like a hand-written test | (b), slug in kebab case, at most 48 characters |
| D55 | Recheck scope | Which earlier catches; which base; what counts as "fixed" | Rechecking catches the author already called intended wastes runner time and can contradict the answer | Catches of this PR that were `Reported`, whose latest human answer is not `Intended` or `TestFault`, and that have no `AuthorChangedPR` yet. Base is the merge base of the new head. A test whose verdict is `PassesBoth` on the new pair records `AuthorChangedPR` (Source `Recheck`, with `HeadSHA`). No analyzer, no agent, no judges |
| D56 | Answer that counts for gate 2 precision | (a) latest answer of any source; (b) the latest human answer (Comment or Label), else the recheck answer | (a) a recheck can overwrite "Intended"; (b) people decide, the recheck signal fills in only when nobody answered | (b) |
| D57 | Monthly spend limit before Q3 is answered | (a) no limit until set; (b) nightly selects nothing until a limit is set | (a) risks an open-ended bill; (b) safe, and the summary says why | (b). `Spend.MonthlyUsd` defaults to `null`; label and recheck runs are not blocked by it |
| — | Where the PR comment is posted | (a) inside `assess`; (b) a separate `comment` command step in job 3 | (b) keeps `assess` free of GitHub writes and gives a `--out <file>` dry run for local use | (b) |
| — | Per-PR job chain in the nightly | (a) three matrix jobs; (b) one reusable workflow `jit-catch-pr.yml` (jobs 1–3) called from a matrix | (a) job 2 of PR 1 waits for job 1 of every PR; (b) each PR runs its own chain, `max-parallel: 2` limits PRs in flight (D27) | (b) |
| — | Git credentials in jobs | (a) checkout's persisted credentials; (b) no persisted credentials anywhere; tokens passed to one `git push` through `GIT_CONFIG_COUNT/KEY/VALUE` environment variables | (a) leaves a token in `.git/config` and allows only one token per checkout; (b) the data push uses `GITHUB_TOKEN` and the promotion push uses the App token in the same job | (b) |
| — | Base build cache (D31) | (a) build base on the host with read-only remote turbo cache; (b) keep phase 1's sandbox build with the local cache only | (a) needs `TURBO_TOKEN` next to a build, a change to the target and a new security review; (b) works today, may be slower on a cold runner | (b) in phase 3; hosted-runner timing decides later (open question) |

---

## File structure

New or changed files, under `packages/TestingFramework/jit-catching/` unless stated.

```
jit-catch.ci.settings.json         # settings the workflows pass (task 3.12): gate 2 selection, spend limit placeholder
package.json                       # devDependency yaml 2.8.2 (task 3.12)
src/
  settings.ts                      # Selection, Spend, Reporting, DataBranch (3.1)
  types.ts, schemas.ts             # Feedback.HeadSHA, PromotionCandidate.PromotedPath/CommitSHA, Run.IntentType, GenerationFile.Rechecks (3.1)
  contracts/BaseCatchStore.ts      # ListCandidateTests, ListExecutionResults, ListPromotionCandidates (3.1)
  store/FileCatchStore.ts          # the same (3.1)
  ranking/Ranker.ts                # ReportingThreshold (3.1)
  pipeline/Assess.ts               # threshold by trigger (3.1); promotion check and path (3.10)
  pipeline/Execute.ts              # no coverage for Recheck runs (3.8)
  git/GitHub.ts                    # open PRs, file stats, permission, issue comments (3.2)
  git/GitRepo.ts                   # runner env (3.5); CommitFileOnto, PushCommit (3.10)
  select/Select.ts                 # SelectNightly, SelectLabel, SelectRecheck, SelectFromEvent, MonthSpend (3.3)
  select/Recheckable.ts            # RecheckableCatches (3.3)
  bundle/Bundle.ts                 # PackBundle, UnpackBundle (3.4)
  store/DataBranch.ts              # DataBranch, InitDataBranch, TokenPushEnv (3.5)
  comment/Render.ts                # CommentModel, RenderComment, ParseCommentBoxes, SafeText, NewFilePatch (3.6)
  comment/Model.ts                 # BuildCommentModel (3.6)
  comment/Publish.ts               # PublishComment (3.7)
  pipeline/Recheck.ts              # RecheckGenerateStep, RecheckAssessStep, RecheckAll (3.8)
  feedback/Feedback.ts             # ParseCommentEvent, FeedbackStep (3.9)
  promotion/Promote.ts             # PromotedPath, SpecAntipatternFindings, PromoteTest (3.10)
  report/Gate2.ts                  # BuildGate2Report, RenderGate2Markdown, EffectiveAnswer (3.11)
  report/Summary.ts                # NightlySummary (3.11)
  sandbox/Redaction.ts             # JIT_PROMOTION_TOKEN in SecretsFromEnvironment (3.10)
  cli.ts, index.ts                 # select | bundle | data | comment | recheck | feedback | summary | report --gate 2 (every code task)
src/__tests__/                     # one test file per new module; existing files extended
.github/workflows/jit-catch.yml            # nightly + label + push; select, matrix, summary (3.12)
.github/workflows/jit-catch-pr.yml         # reusable: jobs 1–3 for one PR (3.12)
.github/workflows/jit-catch-feedback.yml   # issue_comment edited → feedback, promotion (3.12)
src/__tests__/WorkflowPolicy.test.ts       # static security checks over the three files (3.12)
plans/catching-jittests-spike/GATE2-REHEARSAL.md   # local rehearsal record (3.13)
```

---

## Wave plan (for the controller)

| Wave | Tasks | Notes |
|---|---|---|
| 1 | 3.1, 3.2, 3.4, 3.5 | Independent. 3.1 owns `settings.ts`, `types.ts`, `schemas.ts`, the store and `Ranker.ts`; 3.2 owns `GitHub.ts`; 3.5 owns the `GitRunner` type in `GitRepo.ts`. 3.4 and 3.5 both add a command to `cli.ts`, `cli.test.ts` and `index.ts` (additive; the controller merges them one after the other) |
| 2 | 3.3, 3.6 | 3.3 needs 3.1 + 3.2; 3.6 needs 3.1. Both add lines to `cli.ts` / `index.ts` |
| 3 | 3.7, 3.8, 3.10, 3.11 | 3.7 needs 3.2 + 3.6; 3.8 needs 3.3 (`RecheckableCatches`); 3.10 needs 3.1 + 3.5 (edits `GitRepo.ts`, `Assess.ts`, `Redaction.ts`); 3.11 needs 3.1 + 3.3 (`SelectResult`). No two of them edit the same source file apart from `cli.ts`, `cli.test.ts`, `index.ts` |
| 4 | 3.9, 3.12 | 3.9 needs 3.6, 3.7, 3.10; 3.12 needs every command (3.3–3.11) and runs last among code tasks |
| 5 | 3.13 (stop point: spend, Docker), 3.14 | 3.13 is serial; 3.14 after 3.13 so the README holds the measured figures |

At most one Docker task at a time (only 3.13 uses Docker).

---

# Phase 3 — Gate 2

### Task 3.1: Settings, record fields and the reporting threshold by trigger

**Files:**
- Modify: `src/settings.ts`, `src/types.ts`, `src/schemas.ts`
- Modify: `src/contracts/BaseCatchStore.ts`, `src/store/FileCatchStore.ts`
- Modify: `src/ranking/Ranker.ts`, `src/pipeline/Assess.ts`
- Test: `src/__tests__/settings.test.ts`, `src/__tests__/schemas.test.ts`, `src/__tests__/FileCatchStore.test.ts`, `src/__tests__/Ranker.test.ts`, `src/__tests__/Assess.test.ts`

**Interfaces:**
- Consumes: `SelectReported`, `RankCatches` (Ranker.ts); `AssessStep` (Assess.ts).
- Produces:
  ```ts
  // settings.ts — added to SettingsSchema and DEFAULT_SETTINGS
  Selection: z.object({ Label: z.string().min(1), NightlyMaxPRs: z.number().int().positive(), NightlyIncludeMerged: z.boolean(), LabelRunsPerDay: z.number().int().positive() }),
  Spend: z.object({ MonthlyUsd: z.number().positive().nullable(), FallbackUsdPerPR: z.number().positive() }),
  Reporting: z.object({ NightlyComments: z.boolean(), BotLogin: z.string().min(1), MaxCommentChars: z.number().int().positive() }),
  DataBranch: z.object({ Name: z.string().regex(/^[A-Za-z0-9._\/-]+$/), PushAttempts: z.number().int().positive() }),
  // defaults: { Label: 'jit-catch', NightlyMaxPRs: 10, NightlyIncludeMerged: false, LabelRunsPerDay: 10 },
  //           { MonthlyUsd: null, FallbackUsdPerPR: 1 }, { NightlyComments: false, BotLogin: 'github-actions[bot]', MaxCommentChars: 60000 },
  //           { Name: 'jit-catch-data', PushAttempts: 5 }

  // types.ts
  export interface Feedback { CatchID: string; User: string; Answer: FeedbackAnswer; Source: 'Comment' | 'Label' | 'Recheck'; At: string; HeadSHA?: string | null; }
  export interface PromotionCandidate { CandidateTestID: string; RunID: string; NewlyCoveredLines: number; State: 'Offered' | 'Added'; PromotedPath?: string | null; CommitSHA?: string | null; }
  export interface Run { /* as today */ IntentType?: IntentType | null; }
  /** A recheck run's test and the catch whose test it re-runs. */
  export interface RecheckLink { CandidateTestID: string; OriginalCatchID: string; }
  // schemas.ts: the optional fields above; GenerationFileSchema gains Rechecks: z.array(RecheckLinkSchema).default([])

  // BaseCatchStore / FileCatchStore
  public abstract ListCandidateTests(runId: string): Promise<CandidateTest[]>;
  /** Latest record per (CandidateTestID, Revision, RunIndex) for the given test IDs. */
  public abstract ListExecutionResults(candidateTestIds: string[]): Promise<ExecutionResult[]>;
  public abstract ListPromotionCandidates(runId: string): Promise<PromotionCandidate[]>;

  // Ranker.ts
  /** The threshold a run's catches are reported at: Label for Label, Backtest and Local runs; for Nightly runs the Label threshold while Reporting.NightlyComments is false (gate 2, §9.3) and the Nightly threshold after; null for Recheck. */
  export function ReportingThreshold(trigger: Trigger, s: Settings): { Kind: 'Label'; Threshold: Settings['Thresholds']['Label'] } | { Kind: 'Nightly'; Threshold: Settings['Thresholds']['Nightly'] } | null;
  ```
  `AssessStep` selects with `ReportingThreshold(gen.Run.Trigger, settings)` and saves `IntentType: gen.Analysis.IntentType` on the run.

- [ ] **Step 1: Failing tests**

`Ranker.test.ts`:
```ts
it('reports a nightly run at the label threshold while nightly comments are off, and at the nightly threshold after', () => {
  const s = structuredClone(DEFAULT_SETTINGS);
  expect(ReportingThreshold('Nightly', s)?.Kind).toBe('Label');
  s.Reporting.NightlyComments = true;
  expect(ReportingThreshold('Nightly', s)?.Kind).toBe('Nightly');
  expect(ReportingThreshold('Recheck', s)).toBeNull();
});
```
`Assess.test.ts`: `it('reports a Medium catch on a nightly run after gate 2 only when it has a listed boost', ...)` — a nightly run with two Medium catches, one with `AccessChange`; with `NightlyComments: true` only that one is `Reported`. Today both are reported (Label threshold) → FAIL. Second case: the saved run carries `IntentType` from the analysis.

`FileCatchStore.test.ts`: `ListCandidateTests('A')` returns only run A's tests; `ListExecutionResults([t1])` returns the latest record per revision and run index; `ListPromotionCandidates` returns the latest state per test (an `Added` record after `Offered` wins).

`schemas.test.ts`: a generation file without `Rechecks` reads as `[]`; a feedback line without `HeadSHA` still parses (old store lines).

`settings.test.ts`: a settings file that sets `Spend.MonthlyUsd: 0` is rejected; defaults pass the schema.

Run `pnpm exec vitest run src/__tests__/Ranker.test.ts src/__tests__/Assess.test.ts src/__tests__/FileCatchStore.test.ts src/__tests__/schemas.test.ts src/__tests__/settings.test.ts` → FAIL.

- [ ] **Step 2: Implementation.** Schemas: optional fields use `.nullable().optional()`; `PromotionCandidate` key in the store stays `CandidateTestID`, so a later `Added` record replaces `Offered`. `ExecutionResult` key `${CandidateTestID}|${Revision}|${RunIndex}`. In `AssessStep`: `const t = ReportingThreshold(gen.Run.Trigger, o.Settings); const catches = t === null ? RankCatches(assessed) : SelectReported(RankCatches(assessed), t.Threshold, t.Kind);` (remove the `as` casts in `SelectReported` by taking the union type above).
- [ ] **Step 3: Run tests** → PASS; fix fakes in other tests that build `Settings` or a `BaseCatchStore`. **Commit:** `feat(jit-catching): gate 2 settings, record fields and reporting threshold by trigger`.

### Task 3.2: GitHub client: open PRs, file stats, permission and issue comments

**Files:**
- Modify: `src/git/GitHub.ts`
- Test: `src/__tests__/GitHub.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface FileStat { Path: string; Additions: number; Deletions: number; }
  export interface OpenPullRequest { Number: number; Title: string; HeadSHA: string; HeadRef: string; Author: string; HeadRepo: string; IsDraft: boolean; Labels: string[]; Files: FileStat[]; }
  export interface IssueComment { ID: number; Author: string; Body: string; }
  export type RepoPermission = 'admin' | 'write' | 'read' | 'none';
  /** gh pr list --state open --base next --limit 300 --json number,title,headRefOid,headRefName,author,headRepository,headRepositoryOwner,isDraft,labels,files; throws when 300 come back. */
  public async ListOpenPullRequests(): Promise<OpenPullRequest[]>;
  /** gh pr view <n> --json files; the per-file additions and deletions. */
  public async GetFileStats(n: number): Promise<FileStat[]>;
  /** gh api repos/MemberJunction/MJ/collaborators/<login>/permission → .permission; 'none' on HTTP 404. */
  public async GetPermission(login: string): Promise<RepoPermission>;
  /** gh api --paginate --slurp repos/MemberJunction/MJ/issues/<n>/comments. */
  public async ListIssueComments(n: number): Promise<IssueComment[]>;
  /** gh api -X POST …/issues/<n>/comments -F body=@<file>; the body goes through a 0600 temp file that is removed after the call. Returns the new comment ID. */
  public async CreateIssueComment(n: number, body: string): Promise<number>;
  /** gh api -X PATCH …/issues/comments/<id> -F body=@<file>. */
  public async UpdateIssueComment(id: number, body: string): Promise<void>;
  ```

- [ ] **Step 1: Failing tests** with a fake runner that records args and returns canned JSON: open PR list maps `headRepositoryOwner.login/headRepository.name` to `HeadRepo` and `labels[].name` to `Labels`; throws at 300 results; `GetPermission` returns `'none'` when the runner throws an error whose stderr holds `HTTP 404` and does not retry it; `CreateIssueComment` passes `-F body=@<path>` (never the body text in an argument), the file held the body while the call ran, and it is gone afterwards; `ListIssueComments` flattens the `--slurp` pages and reads `user.login`; `UpdateIssueComment` uses `-X PATCH` and the comment path.
- [ ] **Step 2: Implementation.** zod schemas as in the existing methods; reuse `exec` (retry). Temp file under `mkdtempSync(join(tmpdir(), 'jit-gh-'))`, mode `0o600`, removed in `finally`.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): gh client for open PRs, permissions and issue comments`.

### Task 3.3: PR selection (`select`)

**Files:**
- Create: `src/select/Select.ts`, `src/select/Recheckable.ts`
- Modify: `src/cli.ts`, `src/index.ts`
- Test: `src/__tests__/Select.test.ts`, `src/__tests__/Recheckable.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Consumes: `GitHub.ListOpenPullRequests`, `GetPullRequest`, `GetFileStats`, `ListMergedPullRequests`, `GetMergedPullRequest` (3.2); `ComputeRiskScore` (RiskScore.ts); `IsEligibleSource` (Miner.ts); `RevisionsOf` (Corpus.ts); `LatestLabel` (Report.ts); store reads (3.1); `Settings.Selection`, `Settings.Spend` (3.1).
- Produces:
  ```ts
  export interface Selection { PR: number; Trigger: 'Nightly' | 'Label' | 'Recheck'; BaseSHA: string | null; HeadSHA: string; RiskScore: number; Reason: string; }
  export interface SelectResult { Selected: Selection[]; Skipped: { PR: number; Reason: string }[]; Stopped: string | null; MonthSpendUSD: number; }
  export interface SelectDeps {
      GitHub: Pick<GitHub, 'ListOpenPullRequests' | 'GetPullRequest' | 'GetFileStats' | 'ListMergedPullRequests' | 'GetMergedPullRequest'>;
      Repo: Pick<GitRepo, 'FirstParent' | 'Fetch'>; Store: Pick<BaseCatchStore, 'ListRuns' | 'ListCatches' | 'ListFeedback' | 'ListCandidateTests'>;
      PackageMap: Pick<PackageMap, 'PackageForPath'>; Now: () => Date;
  }
  /** Open, non-draft, same-repo PRs to next whose head has no run and that change eligible source; ordered by risk score (title prefix as intent), at most NightlyMaxPRs and at most what the remaining monthly spend pays for at the mean cost of the last 20 runs (FallbackUsdPerPR when there are none). With NightlyIncludeMerged, also PRs merged since the last nightly run, with base M^1 and head M. Stops with a reason when Spend.MonthlyUsd is null or spent. */
  export async function SelectNightly(s: Settings, d: SelectDeps): Promise<SelectResult>;
  /** One Label selection for a same-repo PR that changes eligible source, unless LabelRunsPerDay Label runs started today (UTC). */
  export async function SelectLabel(pr: number, s: Settings, d: SelectDeps): Promise<SelectResult>;
  /** One Recheck selection when the PR has recheckable catches (D55); none otherwise. */
  export async function SelectRecheck(pr: number, s: Settings, d: SelectDeps): Promise<SelectResult>;
  /** Dispatches on the GitHub event: schedule → nightly; pull_request labeled with Selection.Label → label; pull_request synchronize on a PR that has the label → recheck; anything else → empty with a reason. */
  export async function SelectFromEvent(eventName: string, payload: unknown, s: Settings, d: SelectDeps): Promise<SelectResult>;
  /** Sum of CostUSD over runs started in `now`'s UTC month, Backtest and Local runs left out. */
  export function MonthSpend(runs: Run[], now: Date): number;
  /** `matrix={"include":[…]}` and `count=<n>` lines for $GITHUB_OUTPUT. */
  export function GitHubOutputLines(r: SelectResult): string;
  // Recheckable.ts
  /** Reported catches of the PR's runs whose latest human answer is not Intended or TestFault and that have no AuthorChangedPR, each with its candidate test. */
  export async function RecheckableCatches(pr: number, store: Pick<BaseCatchStore, 'ListRuns' | 'ListCatches' | 'ListFeedback' | 'ListCandidateTests'>): Promise<{ Catch: Catch; Test: CandidateTest }[]>;
  ```
  CLI: `select --event <name> --payload <file> [--store <dir>] [--settings <file>] [--github-output <file>] [--out <file.json>]` prints one line per selected and skipped PR and writes the `SelectResult` JSON to `--out`.

- [ ] **Step 1: Failing tests** with fake deps and an in-memory store:
  - `SelectNightly`: skips a draft, a fork, a PR whose head already has a run, a PR that changes only `.md`; orders by risk score (a `refactor:` title touching `packages/MJServer/` first); caps at `NightlyMaxPRs`; with `MonthlyUsd: null` selects nothing and `Stopped` names the setting; with 10 USD spent of 12 and a 1 USD mean cost selects 2; `NightlyIncludeMerged` adds a PR merged after the last nightly run's `StartedAt` with `BaseSHA = FirstParent(M)` and `HeadSHA = M`, and skips one whose `M` already has a run.
  - `SelectLabel`: refuses a fork (Skipped with reason); refuses the 11th Label run of the UTC day; selects with `BaseSHA: null` (merge base later).
  - `SelectRecheck` / `RecheckableCatches`: a reported catch answered `Intended` is left out; one with `AuthorChangedPR` is left out; an unreported catch is left out; a reported catch answered `Bug` stays.
  - `SelectFromEvent`: a `labeled` event with another label name selects nothing; `synchronize` on an unlabeled PR selects nothing.
  - `MonthSpend` leaves out last month's runs and Backtest runs.
  - `cli`: `select` without `--event` → 2; with a fake `SelectFromEvent` writes the two `GITHUB_OUTPUT` lines.
- [ ] **Step 2: Implementation.** Risk score input: `ChangedPaths` from `Files`, `IntentType: 'other'`, `CommitPrefix` from the title (`/^(\w+)(\(.+\))?!?:/`), `ChangedSourceLines` = additions + deletions of eligible files, `PackageCount` = distinct packages of eligible files, `RiskPaths` from settings. Eligibility through `IsEligibleSource`. Event payload parsed with zod (`pull_request.number`, `pull_request.head.repo.full_name`, `pull_request.labels[].name`, `label.name`, `action`); an unknown shape returns an empty result with a reason, never throws. The matrix entry is `{ pr, trigger, base, head }` with `base` `''` when null.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): select PRs for nightly, label and recheck runs`.

### Task 3.4: Run bundles between jobs (`bundle pack|unpack`, D50)

**Files:**
- Create: `src/bundle/Bundle.ts`
- Modify: `src/cli.ts`, `src/index.ts`
- Test: `src/__tests__/Bundle.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Consumes: `RunDir`, `IsValidRunID`, `CheckedBaseRootDir` (RunDir.ts); `SnapshotBaseSources` (BaseSnapshot.ts); `RedactionCheck`.
- Produces:
  ```ts
  export type BundleKind = 'Meta' | 'Base' | 'Execution';
  /** Runs `tar` with the given arguments in `cwd`; injected so a test can fail it. */
  export type TarRunner = (args: string[], cwd: string) => Promise<void>;
  /**
   * Writes a gzip tar of one run's parts: Meta = generation.json and base-src/ (written first from the base worktree with
   * SnapshotBaseSources when missing); Base = work/base/ without its .git file, and work/turbo-cache/; Execution = execution.json.
   * Every regular file of Meta and Execution passes the redaction check first.
   */
  export async function PackBundle(o: { RepoRoot: string; RunID: string; Kind: BundleKind; Out: string; Redaction: RedactionCheck; PackageDirs?: string[]; Tar?: TarRunner }): Promise<void>;
  /**
   * Extracts into an empty staging folder next to the run folder, checks every entry with lstat (no absolute path, no `..`, only the
   * kind's allowlisted paths, regular files and folders only, symlinks only in Base, relative and resolving inside work/base),
   * then moves the entries into the run folder. Meta rewrites generation.json's BaseRootDir to <run>/work/base and validates it.
   * Throws without touching the run folder when any check fails.
   */
  export async function UnpackBundle(o: { RepoRoot: string; RunID: string; Kind: BundleKind; File: string; Redaction: RedactionCheck; Tar?: TarRunner }): Promise<void>;
  ```
  CLI: `bundle pack --run <id> --kind Meta|Base|Execution --out <file>`; `bundle unpack --run <id> --kind … --file <file>`.

- [ ] **Step 1: Failing tests** (real `tar` in temp folders):
  - Meta round trip into a second repo root: `generation.json` reads back with `BaseRootDir` equal to the new `<run>/work/base`, and `base-src/` files match.
  - Base round trip keeps a relative symlink inside `work/base/node_modules` as a symlink, and leaves out `work/base/.git`.
  - Unpack rejects a tar holding `../evil`, an absolute path, a symlink to `/etc`, a file outside the kind's allowlist (`work/base/x` in a Meta bundle), and a hard link; in each case the run folder is unchanged.
  - Pack of a Meta bundle refuses when a transcript-free `generation.json` holds a secret.
  - Unpack of `Execution` validates `execution.json` with its schema (a file with a result naming an unknown test throws).
  - `cli`: `bundle pack` without `--kind` → 2.
- [ ] **Step 2: Implementation.** `tar -czf <out> -C <run dir> <paths> --exclude=work/base/.git` (both GNU tar and bsdtar accept these). Unpack: `tar -xzf <file> -C <staging>` with `--no-same-owner`; walk with `readdirSync(..., { withFileTypes: true })` and `lstatSync`; `readlinkSync` for symlinks, resolved with `path.resolve(dirname(entry), target)` and checked against `<staging>/work/base`. Move with `renameSync` per top-level allowlisted entry after removing an existing one. Meta: `dir.WriteGeneration({ ...dir.ReadGeneration(), BaseRootDir: join(dir.Path, 'work', 'base') })` — written through `RunDir`, so it is validated and redaction-checked. Note: the transcripts folder is uploaded by the workflow as its own artifact after the same redaction scan (`PackBundle` exports `AssertFolderClean(dir, redaction)` for it).
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): run bundles for the job hand-offs (D50)`.

### Task 3.5: Store on the `jit-catch-data` branch (`data open|publish|init`, D51)

**Files:**
- Create: `src/store/DataBranch.ts`
- Modify: `src/git/GitRepo.ts` (runner environment only), `src/cli.ts`, `src/index.ts`
- Test: `src/__tests__/DataBranch.test.ts`, `src/__tests__/GitRepo.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // GitRepo.ts
  /** Runs `git` with the given arguments in `cwd`, with `env` added to the process environment; returns stdout. */
  export type GitRunner = (args: string[], cwd: string, env?: Record<string, string>) => Promise<string>;
  // DataBranch.ts
  /** Git config passed through the environment so a token reaches one git process without an argument or a .git/config line. */
  export function TokenPushEnv(token: string, host?: string /* 'github.com' */): Record<string, string>;
  export interface DataBranchOptions { RepoRoot: string; Dir: string; Branch: string; Remote?: string; Attempts: number; PushEnv?: Record<string, string>; Runner?: GitRunner; Sleep?: (ms: number) => Promise<void>; }
  export class DataBranch {
      constructor(o: DataBranchOptions);
      /** Fetches the branch and adds a detached worktree at its tip in Dir (replacing one left there). 'Missing' when the remote has no such branch; Dir is then not created. */
      public Open(): Promise<'Opened' | 'Missing'>;
      /** Commits the lines appended to Dir's *.jsonl files since Open and pushes them. On a rejected push: re-open at the new tip, append the same lines again, retry, up to Attempts. Throws when a file other than a root *.jsonl changed or a committed line changed. Returns the pushed commit, or null when nothing was appended. */
      public Publish(message: string): Promise<string | null>;
  }
  /** Creates the orphan branch with one README.md commit in the local repository (never pushes). */
  export async function InitDataBranch(o: { RepoRoot: string; Branch: string; Runner?: GitRunner }): Promise<string>;
  ```
  CLI: `data open --dir <dir>`; `data publish --dir <dir> --message <text>` (reads the token from `GH_TOKEN` or `GITHUB_TOKEN` when set, into `TokenPushEnv`); `data init` (local only). Commit identity `jit-catch <jit-catch@users.noreply.github.com>`, set with `-c user.name/-c user.email`.

- [ ] **Step 1: Failing tests** (real git, temp folders, a local bare repository as `origin`):
  - `Open` on a remote without the branch returns `'Missing'`; after `InitDataBranch` and a push of that branch to the bare repo (done by the test itself, not by the code), `Open` returns `'Opened'` and the worktree holds `README.md`.
  - Two `DataBranch` instances on two clones open the same tip; both append a line to `catches.jsonl`; the first `Publish` pushes; the second is rejected, replays and pushes; the bare repo's `catches.jsonl` has both lines, each once.
  - `Publish` refuses when a committed line was edited, and when `notes.txt` was added.
  - `Publish` with nothing appended returns null and creates no commit.
  - With a remote hook that always rejects, `Publish` throws after `Attempts` tries and says how many.
  - `GitRepo.test.ts`: the default runner passes `env` to the child (a `git var GIT_AUTHOR_IDENT` call with `GIT_AUTHOR_NAME` set returns that name).
  - `TokenPushEnv('t0ken-value')` holds no argument form; the header value is `AUTHORIZATION: basic <base64 of x-access-token:t0ken-value>`.
- [ ] **Step 2: Implementation.** `Open`: `git fetch --no-tags <remote> +refs/heads/<branch>:refs/remotes/<remote>/<branch>` (a "couldn't find remote ref" failure → `'Missing'`), then `worktree add --detach <Dir> <remote>/<branch>`; remember the tip SHA and each root `*.jsonl` byte length. `Publish`: `git -C Dir status --porcelain` must list only root `*.jsonl`; for each, `git show <tip>:<file>` must be a prefix of the working file; collect the appended tails; `add`, `commit`, `push <remote> HEAD:refs/heads/<branch>` with `PushEnv`. A rejection whose stderr says `fetch first`, `non-fast-forward` or `rejected` → wait 500–2000 ms, `Open()` again, append the tails, retry. The token never appears in a thrown message (pass errors through `RedactTail`).
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): catch store on the jit-catch-data branch with replayed pushes (D51)`.

### Task 3.6: PR comment model and renderer

**Files:**
- Create: `src/comment/Render.ts`, `src/comment/Model.ts`
- Modify: `src/index.ts`
- Test: `src/__tests__/CommentRender.test.ts`, `src/__tests__/CommentModel.test.ts`

**Interfaces:**
- Consumes: store reads (3.1); `LatestLabel` (Report.ts); `IsWeakUndropped` (Label.ts).
- Produces:
  ```ts
  export const COMMENT_MARKER = '<!-- jit-catch -->';
  export type BoxAnswer = 'Bug' | 'Intended' | 'TestFault' | 'Add';
  export interface CommentCatch {
      CatchID: string; Rank: number; Title: string; Median: Bucket; Boosts: string[]; Package: string; Expected: string | null; Actual: string | null;
      Message: string; RiskText: string | null; IntentType: IntentType | null; Judges: JudgeBucket[]; TestSource: string; MutantPatch: string | null;
      Answer: 'Bug' | 'Intended' | 'TestFault' | null; FixedIn: string | null;
  }
  export interface CommentPromotion { CandidateTestID: string; Path: string; NewlyCoveredLines: number; Added: boolean; CommitSHA: string | null; Source: string; }
  export interface CommentModel { PR: number; RunID: string; HeadSHA: string; Status: 'Done' | 'Failed'; Packages: number; Tests: number; Catches: CommentCatch[]; Promotions: CommentPromotion[]; }
  /** The model of the PR's latest Label run (or Nightly run while Reporting.NightlyComments is on): its reported catches in rank order with their latest human answer and recheck fix, and its offered promotions. Null when the PR has no such run. */
  export async function BuildCommentModel(store: BaseCatchStore, pr: number, s: Settings): Promise<CommentModel | null>;
  /** The comment body: marker, header line, one section per catch (3 answer boxes, one ticked per Answer), promotion boxes, details blocks. Bodies longer than maxChars drop test source, then mutant, then judge reasons, in that order. */
  export function RenderComment(m: CommentModel, maxChars: number): string;
  /** Every answer box in a body: `- [x]` or `- [ ]` followed by text and `<!-- jit:<c|p>:<uuid>:<answer> -->` at the end of the line. */
  export function ParseCommentBoxes(body: string): { Kind: 'Catch' | 'Promotion'; ID: string; Answer: BoxAnswer; Checked: boolean }[];
  /** One line of untrusted text for markdown: & < > escaped, markdown punctuation backslash-escaped, `@` followed by U+200B, `://` broken with U+200B, newlines to spaces, at most 300 characters. */
  export function SafeText(text: string): string;
  /** A `git apply` patch that adds one file. */
  export function NewFilePatch(path: string, content: string): string;
  ```

- [ ] **Step 1: Failing tests**
  - `RenderComment` of a model with one catch answered `Bug`: the body starts with the marker; the `Bug` box is `[x]`, the others `[ ]`; `ParseCommentBoxes(body)` returns the three catch boxes with the right IDs and answers (round trip).
  - A catch whose `Actual` is `<img src=x onerror=…> @octocat https://evil.example` renders with no `<img`, no `@octocat` that GitHub would link (the `@` is followed by U+200B), and no `https://` run; untrusted multi-line values (test source, message, mutant) are inside fenced blocks whose fence is longer than any backtick run in them.
  - Untrusted text that contains `<!-- jit:c:<id>:Bug -->` does not add a box to `ParseCommentBoxes` output.
  - A model with no catches renders one "nothing found" line with the head SHA, packages and tests counts.
  - A catch with `FixedIn` shows "fixed in `abc1234`"; a promotion with `Added` shows a ticked box and the commit; an offered one shows an unticked box and a `<details>` block with `git apply` and `NewFilePatch` content.
  - With `maxChars` 2000 and a long test source, the body is ≤ 2000 characters and still parses to the same boxes.
  - `BuildCommentModel` over an in-memory store: picks the latest Label run of the PR, not a Backtest run of the same PR; restores the latest human answer (a later `Intended` after `Bug` wins); shows `FixedIn` from an `AuthorChangedPR` feedback's `HeadSHA`; returns null for a PR with only Nightly runs while `NightlyComments` is false.
- [ ] **Step 2: Implementation.** Title: the head failure's `TestName` (or the file name) through `SafeText`. Expected/Actual through `SafeText` in inline code. Use the `fenced` helper from `Label.ts` (export it as `Fenced`). Box line: `- [${checked ? 'x' : ' '}] No, it is a bug (I will fix it) <!-- jit:c:${id}:Bug -->`. Promotion box text says a commit dismisses existing approvals (§10.3).
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): PR comment model and renderer with escaped external text`.

### Task 3.7: Comment publisher (`comment`)

**Files:**
- Create: `src/comment/Publish.ts`
- Modify: `src/cli.ts`, `src/index.ts`
- Test: `src/__tests__/CommentPublish.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Consumes: `BuildCommentModel`, `RenderComment`, `COMMENT_MARKER` (3.6); `GitHub.ListIssueComments`, `CreateIssueComment`, `UpdateIssueComment` (3.2); `Settings.Reporting` (3.1).
- Produces:
  ```ts
  export interface PublishDeps { GitHub: Pick<GitHub, 'ListIssueComments' | 'CreateIssueComment' | 'UpdateIssueComment'>; Store: BaseCatchStore; Redaction: RedactionCheck; }
  /**
   * Renders the PR's comment and writes it: to `Out` when given (no GitHub call), else updates the comment whose author is
   * Reporting.BotLogin and whose body starts with the marker, or creates one when `Mode` is 'CreateOrUpdate'. 'UpdateOnly'
   * writes nothing when no comment exists (recheck). Saves the reported catches again with CommentID set. Returns the body and comment ID.
   */
  export async function PublishComment(o: { PR: number; Mode: 'CreateOrUpdate' | 'UpdateOnly'; Settings: Settings; Deps: PublishDeps; Out?: string }): Promise<{ CommentID: number | null; Body: string | null }>;
  /** The mode for a run's trigger: Label → CreateOrUpdate; Recheck → UpdateOnly; Nightly → CreateOrUpdate only while Reporting.NightlyComments is on, else null; Backtest and Local → null. */
  export function CommentMode(trigger: Trigger, s: Settings): 'CreateOrUpdate' | 'UpdateOnly' | null;
  ```
  CLI: `comment --run <id> [--store <dir>] [--out <file.md>] [--settings <file>]` reads the run from the store for PR and trigger; prints `comment: skipped (<reason>)` when the mode is null.

- [ ] **Step 1: Failing tests** with a fake GitHub that keeps comments in memory:
  - First call creates one comment; a second call updates it (one comment in total).
  - A comment with the marker written by another user is not updated; the bot's own comment without the marker is not updated.
  - `UpdateOnly` with no comment calls neither create nor update.
  - The saved catches carry the comment ID.
  - A body that contains a known secret is refused before any GitHub call.
  - `Out` writes the file and makes no GitHub call.
  - `CommentMode('Nightly', defaults)` is null; with `NightlyComments: true` it is `CreateOrUpdate`.
  - `cli`: `comment --run <id>` for a Backtest run prints the skip line and returns 0.
- [ ] **Step 2: Implementation.** As specified; `ListIssueComments` once per call.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): find-or-create PR comment with a dry-run file`.

### Task 3.8: Recheck after a push to a labeled PR (`recheck`, D55)

**Files:**
- Create: `src/pipeline/Recheck.ts`
- Modify: `src/pipeline/Execute.ts`, `src/cli.ts`, `src/index.ts`
- Test: `src/__tests__/Recheck.test.ts`, `src/__tests__/Execute.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Consumes: `RecheckableCatches` (3.3); `GenerationFile.Rechecks`, `Feedback.HeadSHA`, `ListCandidateTests` (3.1); `ExecuteStep`; `AllRunsAgreeVerdict`; `DefaultRunTarget`; `GitHub.GetPullRequest`; `GitRepo.Fetch`, `MergeBase`.
- Produces:
  ```ts
  export interface RecheckDeps {
      GitHub: Pick<GitHub, 'GetPullRequest'>; Repo: Pick<GitRepo, 'Fetch' | 'MergeBase'>; Store: BaseCatchStore; Redaction: RedactionCheck;
      ForRun: (dir: RunDir) => { Target: Pick<PipelineTarget, 'Prepare' | 'BuildPackages' | 'PackagesAt'>; EnsureImage: () => Promise<void> };
  }
  /** Job 1 in build-only mode: no keys, no analyzer, no agent. Copies each recheckable catch's test under a new ID into a Recheck run, prepares and builds base (merge base of the PR's current head), and writes generation.json with Rechecks links. Returns null RunID when nothing is recheckable. */
  export async function RecheckGenerateStep(o: { PR: number; RepoRoot: string; Settings: Settings; StoreDir: string; Deps?: RecheckDeps }): Promise<{ RunID: string | null }>;
  /** Job 3 for a Recheck run: verdicts only; each linked test whose verdict is PassesBoth records Feedback { CatchID: original, Answer: 'AuthorChangedPR', Source: 'Recheck', User: 'jit-catch', HeadSHA }. Saves the run. No judges, no keys. */
  export async function RecheckAssessStep(o: { RunID: string; RepoRoot: string; StoreDir: string; Deps?: { Store: BaseCatchStore; Redaction: RedactionCheck; Now?: () => Date } }): Promise<{ Fixed: string[] }>;
  /** Local `recheck --pr`: RecheckGenerateStep, ExecuteStep, RecheckAssessStep, FinishRun. */
  export async function RecheckAll(o: { PR: number; RepoRoot: string; Settings: Settings; StoreDir: string }): Promise<{ RunID: string | null; Fixed: string[] }>;
  ```
  CLI: `recheck --pr <n>` runs `RecheckAll`; `generate --pr <n> --trigger Recheck` runs `RecheckGenerateStep` (prints `recheck: nothing to recheck` and exits 0 with no run when empty, and writes `run_id=` to `--github-output` when given); `assess --run <id>` routes to `RecheckAssessStep` when the run's trigger is `Recheck` (no `PreflightEnv`).

- [ ] **Step 1: Failing tests** with fakes and an in-memory store:
  - Two recheckable catches → one Recheck run whose `generation.json` has two tests with new IDs, `FilePath` using the new ID, the original `Source`, and two `Rechecks` links; `Run.Trigger === 'Recheck'`; base is `MergeBase('origin/next', head)`; no `PreflightEnv` error without any key in `Env`.
  - Nothing recheckable → `{ RunID: null }` and no run folder.
  - `RecheckAssessStep`: base 3/3 pass and head 3/3 pass → `AuthorChangedPR` with the original catch ID and `HeadSHA`; base pass and head fail → nothing; base fail → nothing (Invalid).
  - `Execute.test.ts`: a Recheck run never calls `Coverage`, even with `Settings.Coverage` on.
  - `cli`: `generate --trigger Recheck` without `--pr` → 2; `assess` on a Recheck run calls `RecheckAssessStep`, not `AssessStep`.
- [ ] **Step 2: Implementation.** Analysis for the run: `{ RunID, IntentType: 'other', Summary: 'recheck', Risks: [], PackagesToTest: <distinct test packages>, ChangedFiles: [], CommitPrefix: null, RiskScore: 0, Title: pr.Title, Body: '', Fallback: null }`. `Sessions: []`, `TokensByModel: []`. Execute: `const coverage = o.Settings.Coverage && gen.Run.Trigger !== 'Recheck';`.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): recheck earlier catches on a new head (D55)`.

### Task 3.9: Feedback reader (`feedback --event`, D52)

**Files:**
- Create: `src/feedback/Feedback.ts`
- Modify: `src/cli.ts`, `src/index.ts`
- Test: `src/__tests__/Feedback.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Consumes: `ParseCommentBoxes`, `COMMENT_MARKER` (3.6); `PublishComment` (3.7); `PromoteTest` (3.10); `GitHub.GetPullRequest`, `GetPermission` (3.2); store reads and `SaveFeedback`.
- Produces:
  ```ts
  export interface CommentEvent { PR: number; CommentID: number; CommentAuthor: string; Body: string; Sender: string; SenderType: string; }
  /** The fields of an issue_comment `edited` event on a PR; null for any other event shape. */
  export function ParseCommentEvent(payload: unknown): CommentEvent | null;
  export interface FeedbackDeps {
      GitHub: Pick<GitHub, 'GetPullRequest' | 'GetPermission' | 'ListIssueComments' | 'CreateIssueComment' | 'UpdateIssueComment'>;
      Store: BaseCatchStore; Redaction: RedactionCheck; Now?: () => Date;
      Promote: (o: { PR: number; CandidateTestID: string }) => Promise<PromotionOutcome>;
  }
  /**
   * Ignores the event (with a reason) unless the comment is the bot's marked comment, the sender is a User other than the bot,
   * and the sender is the PR author or has write or admin permission. Records each catch box that is ticked, belongs to a run
   * of this PR, and differs from the catch's latest human answer, as Feedback { Source: 'Comment', User: sender }; a catch with
   * more than one such box is skipped. Promotes each ticked Add box whose candidate is Offered. Re-renders the comment.
   */
  export async function FeedbackStep(o: { EventFile: string; Settings: Settings; Deps: FeedbackDeps }): Promise<{ Recorded: Feedback[]; Promoted: PromotionOutcome[]; Ignored: string | null }>;
  ```
  CLI: `feedback --event <file> [--store <dir>] [--settings <file>]`.

- [ ] **Step 1: Failing tests** with fake GitHub, a fake `Promote` and an in-memory store; the event body is built with `RenderComment` and then edited by the test:
  - PR author ticks `Bug` → one `Comment` feedback with the author's login.
  - A user with `read` permission who is not the author ticks a box → nothing recorded, `Ignored` says not authorized, and the comment is re-rendered (the tick is cleared).
  - A box already recorded (`Bug` in the store, still ticked) records nothing new; ticking `Intended` as well records nothing for that catch (two ticks), and the re-render shows only `Bug`.
  - A box whose catch ID belongs to another PR's run is ignored.
  - A comment by another author with the marker → ignored; the bot as sender → ignored; a non-edited event → ignored.
  - A ticked `Add` box on an `Offered` candidate calls `Promote` once; on an `Added` candidate it does not.
  - A recorded answer survives the next comment render: after `FeedbackStep`, `RenderComment(await BuildCommentModel(...))` has that box ticked.
- [ ] **Step 2: Implementation.** zod event schema: `action === 'edited'`, `issue.pull_request` present, `issue.number`, `comment.id`, `comment.user.login`, `comment.body`, `sender.login`, `sender.type`. Answer lookup: the latest `Comment` or `Label` feedback of the catch (`LatestLabel`). Re-render through `PublishComment({ Mode: 'UpdateOnly' })`.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): record checkbox answers from comment edits (D52)`.

### Task 3.10: Promotion of a passing test (D53, D54)

**Files:**
- Create: `src/promotion/Promote.ts`
- Modify: `src/git/GitRepo.ts`, `src/pipeline/Assess.ts`, `src/sandbox/Redaction.ts`, `src/index.ts`
- Test: `src/__tests__/Promote.test.ts`, `src/__tests__/GitRepo.test.ts`, `src/__tests__/Assess.test.ts`, `src/__tests__/Redaction.test.ts`

**Interfaces:**
- Consumes: `GitRunner` with `env` (3.5); `TokenPushEnv` (3.5); `PromotionCandidate.PromotedPath/CommitSHA`, `ListCandidateTests`, `ListPromotionCandidates` (3.1); `TestAst` (for the first `describe`/`it` title); `GitHub.GetPullRequest`.
- Produces:
  ```ts
  // GitRepo
  /** A commit whose parent is ParentSHA and whose tree is ParentSHA's tree plus one file, built with hash-object, a temporary index (GIT_INDEX_FILE), update-index, write-tree and commit-tree; no worktree. */
  public async CommitFileOnto(o: { ParentSHA: string; Path: string; Content: string; Message: string; Author: { Name: string; Email: string } }): Promise<string>;
  /** git push <remote> <sha>:refs/heads/<branch> with env; 'Rejected' when the remote refuses a non-fast-forward. */
  public async PushCommit(sha: string, branch: string, env?: Record<string, string>, remote?: string): Promise<'Pushed' | 'Rejected'>;
  public async PathExists(sha: string, path: string): Promise<boolean>;
  // Promote.ts
  /** packages/<X>/src/__tests__/<slug>.test.ts (D54); `exists` reports a path already at the PR head. */
  export function PromotedPath(test: CandidateTest, packageDir: string, exists: (path: string) => boolean): string;
  /** Findings of scripts/check-spec-antipatterns.mjs (from the tool's own checkout) over the source written to a temp root under the promoted path; [] when clean. */
  export async function SpecAntipatternFindings(source: string, promotedPath: string, repoRoot: string, run?: HostRunner): Promise<string[]>;
  export type PromotionOutcome = { CandidateTestID: string; State: 'Added'; CommitSHA: string } | { CandidateTestID: string; State: 'Failed'; Reason: string };
  /** Commits the stored test at its PromotedPath onto the PR's current head and pushes it to the head branch, rebuilding on the new head up to 3 times; saves the candidate as Added with CommitSHA. */
  export async function PromoteTest(o: { PR: number; CandidateTestID: string; Store: BaseCatchStore; GitHub: Pick<GitHub, 'GetPullRequest'>; Repo: Pick<GitRepo, 'Fetch' | 'CommitFileOnto' | 'PushCommit' | 'PathExists'>; PushEnv: Record<string, string>; HeadRef: string }): Promise<PromotionOutcome>;
  ```
  `AssessStep` keeps a promotion candidate only when `SpecAntipatternFindings` is empty, and records its `PromotedPath` (injected as `AssessDeps.SpecCheck` so tests do not run node). `SecretsFromEnvironment` adds `JIT_PROMOTION_TOKEN`.

- [ ] **Step 1: Failing tests**
  - `PromotedPath`: a test whose first `describe` is `'canRead cache'` → `…/src/__tests__/can-read-cache.test.ts`; no title → `jit-<id8>.test.ts`; existing path → `-<id8>` added; a title of 200 characters → slug ≤ 48.
  - `GitRepo.CommitFileOnto` (real git, temp repo): the new commit's parent is the given SHA, its tree has the new file with the content and every parent file unchanged, the worktree and the real index are untouched (`git status --porcelain` empty before and after).
  - `PushCommit` against a local bare repo: a fast-forward returns `'Pushed'`; after another clone pushes first, `'Rejected'`.
  - `PromoteTest` with a bare repo as origin and a fake GitHub: the PR branch tip is the promoted commit, the file holds the stored source; with a competing push in between, it rebuilds on the new head and still pushes; after 3 rejections it returns `Failed` and the store still says `Offered`.
  - `Assess.test.ts`: a candidate whose fake `SpecCheck` returns a finding is not offered; a clean one is offered with its `PromotedPath`.
  - `SpecAntipatternFindings` with a fake runner: exit code 1 with findings on stdout returns them; exit 0 returns [].
  - `Redaction.test.ts`: `SecretsFromEnvironment({ JIT_PROMOTION_TOKEN: 'x'.repeat(20) })` includes it.
- [ ] **Step 2: Implementation.** `CommitFileOnto`: `hash-object -w --stdin` (content through a temp file, `--path` for attributes off: use `--no-filters`), `read-tree <parent>` with `GIT_INDEX_FILE=<tmp>/index`, `update-index --add --cacheinfo 100644,<blob>,<path>`, `write-tree`, `commit-tree <tree> -p <parent> -m <message>` with `GIT_AUTHOR_*`/`GIT_COMMITTER_*` in `env`; temp folder removed in `finally`. Commit message: `test(<package>): add JiT test <slug>` + a blank line + `Promoted from a jit-catch PR comment by request.`. Author: `jit-catch <jit-catch@users.noreply.github.com>`.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): promote a passing test with a plumbing commit (D53, D54)`.

### Task 3.11: Gate 2 report and nightly summary (`report --gate 2`, `summary`, D56)

**Files:**
- Create: `src/report/Gate2.ts`, `src/report/Summary.ts`
- Modify: `src/cli.ts`, `src/index.ts`
- Test: `src/__tests__/Gate2.test.ts`, `src/__tests__/Summary.test.ts`, `src/__tests__/cli.test.ts`

**Interfaces:**
- Consumes: `WilsonInterval`, `RateOf` (Stats.ts); `TableCostOf`, `MarkdownText` (Report.ts); `SelectResult`, `MonthSpend` (3.3); store reads.
- Produces:
  ```ts
  /** The answer that counts for a catch (D56): the latest Comment or Label answer, else the latest Recheck answer, else null. */
  export function EffectiveAnswer(feedback: Feedback[]): FeedbackAnswer | null;
  export interface Gate2Report {
      Since: string; Until: string; Weeks: number;
      Runs: { Label: number; Nightly: number; Recheck: number; Failed: number };
      Reported: number; Answered: number;
      Precision: RateWithInterval;      // Bug + AuthorChangedPR ÷ answered
      AnswerRate: RateWithInterval;     // answered ÷ reported
      ByAnswer: Record<FeedbackAnswer, number>;
      Volume: { Answered: number; Needed: 15; Met: boolean };
      Outcome: 'TooEarly' | 'Pass' | 'Extend' | 'NotPassed';
      Cost: { TotalUSD: number; PerRun: number | null; PerReportedCatch: number | null };
  }
  /** Over Label and Nightly runs started in [Since, Until). Outcome: < 4 weeks → TooEarly; ≥ 4 weeks with ≥ 15 answered → Pass when precision ≥ 40%, else NotPassed; ≥ 4 and < 8 weeks with < 15 answered → Extend; ≥ 8 weeks with < 15 → NotPassed. */
  export async function BuildGate2Report(o: { Store: BaseCatchStore; Since: Date; Until: Date }): Promise<Gate2Report>;
  export function RenderGate2Markdown(r: Gate2Report): string;
  /** Workflow summary markdown: month spend and limit, why the selection stopped, one line per selected PR with its run's tests, weak catches, reported catches and cost, one line per skipped PR. */
  export function NightlySummary(o: { Selection: SelectResult; Runs: Run[]; CatchesByRun: Map<string, Catch[]>; Settings: Settings }): string;
  ```
  CLI: `report --gate 2 --since <YYYY-MM-DD> [--until <YYYY-MM-DD>] [--out <file.md>] [--store <dir>]` (the phase 2 `report --ledger` form stays); `summary --selection <file.json> [--out <file>] [--store <dir>]`. Both pass the redaction check before writing.

- [ ] **Step 1: Failing tests** over an in-memory store:
  - `EffectiveAnswer`: `[Recheck AuthorChangedPR (later), Comment Intended (earlier)]` → `Intended`; only a Recheck answer → `AuthorChangedPR`; none → null.
  - Report: 20 reported catches, 16 answered (7 Bug, 2 AuthorChangedPR, 7 Intended) over 5 weeks → precision 9/16 with its Wilson interval, answer rate 16/20, `Pass`; with 10 answered at 5 weeks → `Extend`; at 9 weeks → `NotPassed`; at 3 weeks → `TooEarly`; Backtest runs in the window are not counted.
  - `NightlySummary`: a `Stopped` reason appears; a skipped PR line names its reason; costs sum per run.
  - `cli`: `report --gate 2` without `--since` → 2; `report` with both `--gate` and `--ledger` → 2.
- [ ] **Step 2: Implementation.** Weeks = `(Until − Since) / 7 days`, one decimal. Costs from `Run.TokensByModel[].CostUSD`.
- [ ] **Step 3: Run tests** → PASS. **Commit:** `feat(jit-catching): gate 2 report and nightly summary (D56)`.

### Task 3.12: Workflows and their policy test

**Files:**
- Create: `.github/workflows/jit-catch.yml`, `.github/workflows/jit-catch-pr.yml`, `.github/workflows/jit-catch-feedback.yml`
- Create: `jit-catch.ci.settings.json`
- Create: `src/__tests__/WorkflowPolicy.test.ts`
- Modify: `package.json` (devDependency `yaml: 2.8.2`; then `pnpm install` at the repo root)

**Interfaces:**
- Consumes: every CLI command: `select` (3.3), `bundle` (3.4), `data` (3.5), `comment` (3.7), `generate --trigger Recheck` and `assess` routing (3.8), `feedback` (3.9), `summary` (3.11).
- Produces: the three workflow files below; `jit-catch.ci.settings.json` = `{ "Selection": { "NightlyIncludeMerged": true, "NightlyMaxPRs": 30 }, "Spend": { "MonthlyUsd": null } }` (the team sets the figure when Q3 is answered; until then nightly selects nothing, D57).

- [ ] **Step 1: Failing test** `WorkflowPolicy.test.ts` parses the three files with `yaml` and checks the security rules (each is a rule from the design that a later edit could break; the test fails today because the files do not exist):
  - Workflow-level `permissions: {}` in all three.
  - `jit-catch.yml` triggers: `schedule` cron `45 7 * * *` (D27) and `pull_request` with `types: [labeled, synchronize]` and `branches: [next]`; no workflow named `jit-catch*` has an `issue_comment` `created` trigger or `workflow_dispatch` (D30). The feedback workflow has `issue_comment` with `types: [edited]` only.
  - The select job's `if` requires `github.event.pull_request.head.repo.full_name == github.repository` for PR events (§12).
  - The catch job calls `./.github/workflows/jit-catch-pr.yml` with `strategy.max-parallel: 2` and `fail-fast: false`.
  - In `jit-catch-pr.yml`, the `execute` job has `permissions` exactly `{ contents: read }` and no string `secrets.` anywhere in the job (D10); `generate` references only `secrets.ANTHROPIC_API_KEY` and `secrets.TURBO_TOKEN`, and only in the `env` of the step that runs `jit-catch generate`; the recheck path runs without `ANTHROPIC_API_KEY` (the env value is empty when `inputs.trigger == 'Recheck'`).
  - Every `actions/checkout` step in all three files has `persist-credentials: false`, `filter: blob:none`, and `ref: next` (the tool comes from `next`, §12).
  - No step uses `actions/cache@`, `actions/cache/save@`, or `./.github/actions/mj-setup`, and no `actions/setup-node` step has a `cache` input (D29). Cache steps, when present, use `actions/cache/restore@`.
  - Every `actions/upload-artifact` step for a transcripts artifact has `retention-days: 90`; bundle artifacts have `retention-days: 1`.
  - Every `run:` that holds `${{ github.event.` or `${{ inputs.` passes it through `env:` instead of inline (script injection).
  - When `actionlint` is on `PATH`, `actionlint <file>` exits 0 for each file (`it.skipIf(!hasActionlint)` with a `// KNOWN LIMITATION: actionlint is optional on developer machines` comment).
- [ ] **Step 2: Write the workflows.** Shape (the implementer fills in the steps; every logic decision is in the CLI):
  - `jit-catch.yml`: jobs `select` (checkout `next`; pnpm and node without cache save; `actions/cache/restore` of the pnpm store; `pnpm install --frozen-lockfile --filter @memberjunction/jit-catching...`; `npx turbo run build --filter=@memberjunction/jit-catching...`; `jit-catch data open --dir $RUNNER_TEMP/data`; `jit-catch select --event "$EVENT_NAME" --payload "$GITHUB_EVENT_PATH" --store "$RUNNER_TEMP/data" --settings packages/TestingFramework/jit-catching/jit-catch.ci.settings.json --github-output "$GITHUB_OUTPUT" --out selection.json`; upload `selection.json`), `catch` (needs select, `if: needs.select.outputs.count != '0'`, matrix from `fromJSON(needs.select.outputs.matrix)`, `max-parallel: 2`, `uses: ./.github/workflows/jit-catch-pr.yml`, explicit `secrets:` ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, TURBO_TOKEN; `permissions: { contents: write, pull-requests: write }`), `summary` (`if: always()`, reads the data branch and `selection.json`, `jit-catch summary … --out "$GITHUB_STEP_SUMMARY"`). Concurrency `group: jit-catch-${{ github.event.pull_request.number || 'nightly' }}`, `cancel-in-progress: false`.
  - `jit-catch-pr.yml` (`on: workflow_call` with inputs `pr`, `trigger`, `base`, `head` and the four secrets): `generate` (contents read, pull-requests read; fetch `refs/pull/<n>/head`; build the sandbox image; `jit-catch generate`, or `generate --trigger Recheck`; outputs `run_id`; `bundle pack` Meta and Base; upload bundles (1 day) and transcripts after `AssertFolderClean` (90 days)), `execute` (needs generate; contents read; no secrets; download and `bundle unpack` Meta and Base; `jit-catch execute --run`; `bundle pack Execution`; upload), `assess` (needs execute; contents write, pull-requests write; download Meta and Execution; `data open`; `jit-catch assess --run --store`; `jit-catch comment --run --store`; `jit-catch data publish --dir … --message "jit-catch: run <id>"` with `GH_TOKEN: ${{ github.token }}`).
  - `jit-catch-feedback.yml`: one job, `if: github.event.issue.pull_request && github.event.comment.user.login == 'github-actions[bot]' && startsWith(github.event.comment.body, '<!-- jit-catch -->') && github.event.sender.type == 'User'`; `permissions: { contents: write, pull-requests: write }`; mint the App token with `actions/create-github-app-token@v2` (`app-id: ${{ vars.APP_CLIENT_ID }}`, `private-key: ${{ secrets.APP_PRIVATE_KEY }}`, as `publish.yml` does; Q1 decides whether this App may be used); `data open`; `jit-catch feedback --event "$GITHUB_EVENT_PATH" --store …` with `JIT_PROMOTION_TOKEN` from the App step; `data publish`.
  Comments at the top of each file name the design sections (§5.4, §6, §10, §12) and say that the workflow is not yet enabled for live runs.
- [ ] **Step 3: Static checks.** `pnpm exec vitest run src/__tests__/WorkflowPolicy.test.ts` → PASS; at the repo root `node .github/scripts/check-app-token-no-merge.mjs` → exit 0; `actionlint .github/workflows/jit-catch*.yml` when installed. Never `gh workflow run`, never push. **Commit:** `ci(jit-catching): nightly, label, recheck and feedback workflows (not enabled)`.

### Task 3.13: Local rehearsal of the three jobs (stop point: spend, about 1–3 USD, Docker)

**Files:**
- Create: `plans/catching-jittests-spike/GATE2-REHEARSAL.md`

Ask the user for approval of the figure first (one Sonnet run of one PR, plus judges). Keys are exported by the user with `env -u CLAUDECODE`; nothing goes to GitHub.

- [ ] **Step 1: Local data branch.** In a scratch folder: `git init --bare data-origin.git`; in a second worktree of the integration branch (`PROJ2/.wt-jit-p3-rehearsal`), add `data-origin.git` as remote `rehearsal`, `jit-catch data init`, push the branch to `rehearsal` (a local bare repo, not GitHub). `data open --dir <tmp>/data` with `Remote: rehearsal` (add `--remote` to `data open|publish` if 3.5 did not; failing test first).
- [ ] **Step 2: Select.** Hand-write a `labeled` event payload for one small open PR (or a merged PR with `--base M^1 --head M` and `--trigger Label`), run `select --event pull_request --payload <file> --out selection.json`.
- [ ] **Step 3: Job 1 → 2 → 3 with bundles.** In worktree A: `generate`, `bundle pack Meta`, `bundle pack Base`. In worktree B (another path, to prove the `BaseRootDir` rewrite): `bundle unpack Meta`, `bundle unpack Base`, `execute`, `bundle pack Execution`, with no model key in the environment (`env -i PATH=$PATH HOME=$HOME`). In worktree C: `bundle unpack Meta`, `bundle unpack Execution`, `data open`, `assess --store`, `comment --run <id> --out comment.md`, `data publish` to `rehearsal`.
- [ ] **Step 4: Feedback and recheck.** Build an `issue_comment` `edited` payload from `comment.md` with one box ticked and the sender set to the PR author; run `feedback --event` with a fake `gh` (a `PATH` shim script that answers `GetPermission`, `ListIssueComments` and `UpdateIssueComment` from files and refuses everything else); check the store holds the answer. Run `recheck --pr <n>` on the same head and record whether any catch is marked fixed (expected: none).
- [ ] **Step 5: Record** wall time per job, bundle sizes (Meta, Base, Execution), disk use, the rendered comment, and every fix (each fix with a failing test first) in `GATE2-REHEARSAL.md`. `clean --all-finished`. **Commit:** `docs(jit-catching): local rehearsal of the gate 2 jobs`.

### Task 3.14: README, design rows and the live checklist

**Files:**
- Modify: `packages/TestingFramework/jit-catching/README.md`
- Modify: `plans/catching-jittests-design.md` (§4 rows D50–D57, §11 sentence on concurrency, §15 row "3 Gate 2", §18 Q1–Q3 owners unchanged)

- [ ] **Step 1: README.** Commands section: one line each for `select`, `bundle pack|unpack`, `data open|publish|init`, `comment`, `recheck`, `feedback`, `summary`, `report --gate 2`. A "CI workflows" section: the three files, which job holds which secret, the hand-off bundles, how to rehearse locally (task 3.13 in five steps), and the checklist below by link. The rehearsal's measured times and sizes.
- [ ] **Step 2: Design.** Add D50–D57 to §4 as worded in this plan's table; in §11 replace "a concurrency group serializes writes, and a rejected push rebases and retries" with the replay rule (D51); §15 row "3 Gate 2" → "Built and rehearsed locally (plan: [`catching-jittests-phase3.md`](catching-jittests-phase3.md)); live runs wait for gate 1 and the checklist in that plan". No test. **Commit:** `docs(jit-catching): phase 3 commands, workflows and design decisions D50–D57`. Hand over with superpowers:finishing-a-development-branch (no push).

---

## Not possible before live runs (checklist for the user)

Phase 3's exit is "gate 2 passes". These items need GitHub, repo admins, secrets or calendar time, so no task above does them.

- [ ] **Gate 1 passes first.** GATE1.md (2026-11-12) shows the tuning slice did not pass (Sonnet 0/30, Gemini 1/30). Gate 2 starts only after task 2.19 passes the held-out slice; until then the workflows stay unmerged or disabled.
- [ ] **Q1 — promotion token.** Repo admins decide whether the feedback workflow may mint the existing App token (`APP_CLIENT_ID` / `APP_PRIVATE_KEY`, today used only by `publish.yml`) or need a new App with `contents: write` on PR branches. Until then, keep the `Add` boxes off or rely on the patch fallback.
- [ ] **Q2 — OpenAI key.** Confirm `OPENAI_API_KEY` (or `INTEGRATION_LIVE_MODEL_KEYS`) is available to these workflows; add the secret if not. Also confirm `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and `TURBO_TOKEN` are available to `pull_request` and `schedule` runs.
- [ ] **Q3 — monthly spend limit.** Set `Spend.MonthlyUsd` in `jit-catch.ci.settings.json` from gate 1's measured cost per PR × ~14 PRs a working day (§13.2); nightly selects nothing until then (D57).
- [ ] **Repo setup.** Create the `jit-catch` label (triage access to add it). Create and push the orphan branch `jit-catch-data` once (`jit-catch data init`, then an admin push). Check that no ruleset blocks `GITHUB_TOKEN` pushes to it, and that `release-lines-guard.yml` and other branch guards ignore it. Set the repo's artifact retention to at least 90 days (transcripts).
- [ ] **Merge the workflows to `next`** after review (a scheduled workflow runs only from the default branch). `check:standards` and `check:guards` must be green.
- [ ] **Hosted-runner validation (first label run on a test PR).**
  - Repeat spike probe 6 from a step that holds the real `ACTIONS_RUNTIME_TOKEN`: the sandbox must not read it or write a cache entry (design §17).
  - Measure job times, the Base bundle size and its upload and download time; if the hand-off is too slow, switch to D50 option (c).
  - Measure the cold base build without remote cache (D31 open question) and the head build misses (Q4).
  - Check that the tool build in job 2 (no `TURBO_TOKEN`) fits the time budget.
- [ ] **First comment checks on GitHub.** The comment renders as designed; escaped text shows no links, HTML or mentions; the PR author can tick a box (on GitHub, editing another user's comment needs write access, so an author without write access cannot answer — confirm for MJ's contributors); the feedback workflow fires on the edit and records the answer; a bot re-render does not trigger it again; a promotion commit triggers CI and dismisses approvals, as the box text says.
- [ ] **Recheck check.** Push to the labeled test PR; the recheck runs without the Anthropic key and updates the comment.
- [ ] **Nightly dry week.** Enable the schedule with the spend limit set; read the workflow summaries for a week before counting gate 2 catches.
- [ ] **Gate 2 runs (4 to 8 weeks, §14.2).** Each week: `label --run <id>` packets for nightly catches, sent by the spec owner to each author directly; answers recorded with `label --catch`; `report --gate 2 --since <start>` reviewed. At 4 weeks: pass, or extend once by 4 weeks if volume is short. At 8 weeks without 15 answered catches: not passed; the team decides from the report.
- [ ] **After gate 2 passes:** set `Reporting.NightlyComments: true` (phase 4) and start Track C.

---

## Self-review notes

- Spec coverage: §15 row 3 — workflows (3.12) for jobs 1–3 (3.4 hand-off, existing steps), recheck (3.8), feedback (3.9); PR comment (3.6, 3.7); promotion (3.10); data branch (3.5). §6 triggers and selection (3.3), risk score reused, nightly cap and gate 2 widening (D23, `NightlyIncludeMerged`, `NightlyMaxPRs`), label daily limit, fork refusal. §9.3 nightly threshold by phase (3.1). §10.1 marker, one comment, escaping (3.6, 3.7); §10.2 sender check, answers restored, author-changed signal (3.8, 3.9); §10.3 App-token commit, rename, anti-pattern check, patch fallback, approval note (3.6, 3.10). §11 store on the orphan branch, schema validation, redaction, transcripts as 90-day artifacts (3.4, 3.5, 3.12); the concurrency group is replaced by replay (D51, recorded in 3.14). §12 job permissions, no secrets in job 2, tool from `next`, no cache save, `persist-credentials: false` (3.12 policy test). §13.3 monthly spend stop (3.3, D57). §14.2 precision, answer rate, volume, time limit (3.11).
- Not covered locally by design: anything in the checklist above.
- Type consistency: `Settings.Selection/Spend/Reporting/DataBranch`, `Feedback.HeadSHA`, `PromotionCandidate.PromotedPath/CommitSHA`, `Run.IntentType`, `GenerationFile.Rechecks` and the three store reads are all defined in 3.1 and only consumed later. `GitRunner` gains `env` in 3.5; 3.10 uses it. `RecheckableCatches` is defined in 3.3 and used by 3.8. `SelectResult` (3.3) is read by `NightlySummary` (3.11). `PromotionOutcome` is defined in 3.10 and used by 3.9. `ParseCommentBoxes` and `COMMENT_MARKER` (3.6) are used by 3.7 and 3.9. `CommentMode` (3.7) decides whether job 3 posts.
- Shared files: `cli.ts`, `cli.test.ts` and `index.ts` take additive hunks from 3.3–3.11; `GitRepo.ts` from 3.5 then 3.10; `Assess.ts` from 3.1 then 3.10. The wave plan keeps each pair in different waves.
- Open question the documents do not settle: D31 asks for a base build with read-only remote turbo cache in job 1, but phase 1 builds base inside the sandbox, which has no network; this plan keeps the sandbox build and leaves the change to hosted-runner data.

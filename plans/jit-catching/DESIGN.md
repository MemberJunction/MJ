# Catching JiTTests for MemberJunction — Design

| | |
|---|---|
| **Issue** | [MJ#6218](https://github.com/MemberJunction/MJ/issues/6218) |
| **Status** | Draft for review |
| **Date** | 2026-11-04 |
| **Owner** | Caeleb Balanesi (CaelebB-BC) |
| **Scope of this spec** | Track A in full, plus the shared interfaces that Tracks B and C plug into |

---

## 1. Summary

For each PR, MJ generates throwaway tests, runs each test on the PR's merge-base and on its head, and keeps the tests
that **pass on base and fail on head**. Deterministic rules and a panel of LLM judges rank those results. The top
results reach the author as one question: *"This input now gives this output. Was this change intended?"* Nothing
blocks merge, and no generated test lands in the repo unless a developer asks for it.

The work has three tracks, built in this order. All three are in scope.

| Order | Track | What it checks | Spec |
|---|---|---|---|
| 1 | **A — unit-level catching** | TypeScript PRs, with vitest tests in the changed packages | This document |
| 2 | **C — integration-level catching** | Server, security, RLS and cache PRs, with GraphQL checks against a live MJAPI | Own spec; reuses A's core |
| 3 | **B — prompt and agent catching** | Changes to prompts, agents and models, with Testing Framework drivers | Own spec; internal first, product later |

---

## 2. Background

### 2.1 Catching tests

A **hardening test** is written to pass and lives in the repo to guard future changes. A **catching test** is written
to fail: it exists to find a bug in one change, and is deleted afterwards.

| Term | Meaning |
|---|---|
| **Weak catch** | A test that passes on base and fails on head. It proves behavior changed, not that a bug exists. |
| **Strong catch** | A weak catch whose change the author did not intend — a bug found before merge. |
| **Dodgy diff** | Generation method. Treat the diff as if it were a bug; write tests that pin base behavior on the inputs the diff most likely affects. High recall, low precision. |
| **Intent-aware** | Generation method. Infer the diff's intent and list risks. For each risk, write a mutant of base and a test that kills it, then run that test on head. |
| **Mutant** | A copy of base with one deliberate bug that represents one risk. |
| **Kill** | A test kills a mutant when it passes on base and fails on the mutant. This proves the test can detect that bug. |

### 2.2 Meta's results

| | Pilot ([FSE 2026 paper](https://arxiv.org/abs/2601.22832)) | Full scale ([blog, 2026-10-29](https://engineering.fb.com/2026/10/29/security/catching-bugs-before-they-land-jittestings-human-on-the-loop-approach-at-full-scale/)) |
|---|---|---|
| Volume | 22,126 generated tests, 231 weak catches (1% per test) | Not published |
| Dodgy diff | 2.5% weak catches per test; 4.0% of diffs | — |
| Intent-aware | 6.4% weak catches per test; 7.9% of diffs | — |
| Review load | Rule + LLM assessors cut human review by ~70% | — |
| True positives | 8 of 41 reports (~20%) | 60%; 74 privacy SEVs caught before landing in H1 2026; privacy SEVs down 20% |
| Where it runs | Overnight, spare capacity, before the diff lands, unit tests | Same |

Plan against the **pilot** numbers; the full-scale numbers came later, after Meta scaled and tuned the system.

### 2.3 What MJ has today

Verified on `next` at `10a519b58d`. The issue estimated "~75% of the primitives exist". The CI side has building
blocks; the Testing Framework side has larger gaps than the issue states.

| Issue claim | What the code does |
|---|---|
| `LLMDecision` returns calibrated per-level probabilities | The model writes numbers in its JSON reply (`packages/AI/Prompts/src/decision/LLMDecision.ts:63-67`). No log-probabilities. Only MJ's OpenAI provider passes logprobs. |
| A multi-vendor judge on `LLMRubricEvaluator` is straightforward | It samples **one** model up to 9 times, sequentially. `ParallelExecutionCoordinator` can fan one prompt over hand-built model tasks, so an ensemble is possible but new work. |
| `DeterministicRubricEvaluator` can host the false-positive rules | Rules match JSON paths in `content.data` only (`DeterministicRubricEvaluator.ts:59`). They cannot read test source or a stack trace. |
| `TestEngine` can run disposable tests | `RunTest` needs a saved `MJ: Tests` row, and every run writes Test Run, Output, Agent Run and Prompt Run rows. `TestRunOptions.configOverride` is declared but unused. |
| Base vs candidate prompt/agent configs | No prompt or agent versions exist. `PromptEvalDriver` offers `systemPromptOverride` and model overrides only. |
| autodev has a break-the-fix worktree runner | Break-the-fix is prose for the agent (`.claude/commands/autodev-tick.md:83-88`). No script; no base/head helper exists. |
| `backstop-alarm.mjs` dedups one PR comment | It manages one rolling GitHub **issue**. |

Ready and useful: `GetConsensus('Median')` and `GetAgreement` (quadratic kappa, Krippendorff's alpha; ≥ 20 pairs) in
`@memberjunction/rubrics`; runtime loading of integration checks (`check-module-loader.ts`); the `@memberjunction/unit-testing`
stubs (`DatabaseProviderStub`, `EntitiesOnlyProvider`, `TestLLM`); `@vitest/coverage-v8`; a Stryker pilot.

---

## 3. Goals and non-goals

**Goals**

- Report likely-unintended behavior changes on PRs before merge, each backed by a test that passes on base and fails on head.
- Never block a PR or slow the required CI checks.
- Keep noise low: one comment per PR, and no unrequested comments until the success gates pass.
- Measure catch rate, false-alarm rate, precision, and cost per PR and per catch.
- Define interfaces that let Tracks C and B reuse the core, and let the core move into the Testing Framework packages later.

**Non-goals for v1**

- Blocking checks of any kind.
- PRs from forks (none of the last 500 PRs to `next` came from one).
- Publishing to npm.
- Non-Claude test generators.
- A cheap-judge pre-filter or the Message Batches API (volume is too low to pay off; see §9.2).
- Packages with no vitest tests (skipped and recorded).

---

## 4. Decisions

| # | Topic | Decision | Reason |
|---|---|---|---|
| D1 | Track order | A, then C, then B — all three in scope | A is cheapest and closest to Meta's proven setting; C reuses A's TypeScript generation; B needs new Testing Framework work first |
| D2 | Where it runs | Nightly GitHub Actions workflow **and** a `jit-catch` PR label, from the start; one CLI behind both | Shared infrastructure; keys already in CI; developers can still request a run |
| D3 | Track B audience | Internal first, product later | Fast start; interfaces designed so the move needs no rewrite |
| D4 | Tests that pass on both revisions | Offer up to 3 as promotion candidates | Free byproduct with real coverage value; capped to avoid bloat |
| D5 | Success measure | Two gates: backtest, then 4 weeks of live label runs | Proves value before any PR comment is posted, then proves it with real authors |
| D6 | Approach | Code runs every step; an agent only writes tests, on base only | Measurable, repeatable, bounded cost; the agent cannot fit tests to head |
| D7 | Code location | Private workspace package `@memberjunction/jit-catching` | No npm gate; full TypeScript, vitest and standards tooling |
| D8 | Base revision | `git merge-base origin/next <head>` | Changes merged by other PRs do not become false catches |
| D9 | Builds | Separate base and head worktrees by default; file swap for one-package PRs | 49% of PRs change 2+ packages, and tests import other packages from `dist/` |
| D10 | Execution isolation | Base and head runs share one job that holds no secrets | Fair comparison; PR code never runs next to API keys |
| D11 | Signature changes | A test that compiles on base but not on head is stored as **API changed**, not reported | Meta classes this as a false positive; data kept for later |
| D12 | Generation methods | Both run on every PR | Different jobs: dodgy diff finds unknown changes, intent-aware finds named bugs; gate 1 compares them |
| D13 | Mutant placement | Mutant and test live in the package that holds the risky code | Killing a mutant needs no rebuild |
| D14 | Rules | Plain TypeScript classes, not rubric rules | Rubric rules cannot read code or stack traces |
| D15 | TP Prob judge | An OpenAI model | Needs log-probabilities; only MJ's OpenAI provider passes them |
| D16 | Judge calls | MJ AI provider classes, called directly without a database | One interface for three vendors; eases the move to the product |
| D17 | Judge funnel / Batch API | Neither in v1 | ~3 catches a day; savings are cents |
| D18 | Thresholds | Settings, not code; tuned from human labels | Policy belongs to people, not to code changes |
| D19 | Reporting | One comment per PR, updated in place; checkbox answers; automatic "author changed the PR" signal | Low noise, one-click answers, objective signal |
| D20 | Promotion commits | Commit with a GitHub App token | Commits made with `GITHUB_TOKEN` do not trigger CI (open question Q1) |
| D21 | Store | JSONL files on an orphan branch `jit-catch-data`; transcripts as 90-day artifacts | Durable, free, readable; mirrors future MJ entities |
| D22 | Secrets | Never in the same process or job as PR code or generated tests | Generated tests come from an agent that read untrusted PR text |
| D23 | Nightly volume | At most 10 PRs a night, ordered by a rule-based risk score | Caps cost until gate 1 gives real numbers |
| D24 | Generator model | Gate 1 compares `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`; keep the cheapest that passes | Price per PR differs ~30x; only data shows cost per real catch |
| D25 | Gemini judge | `gemini-4-argon` | Strongest Gemini on the price list; judge cost is negligible |
| D26 | Gate 1 clean-set labels | The original PR author labels each catch; a reviewer of that PR if the author is gone or silent for a week | Only the author knows the intent; Meta also asks the author |
| D27 | Nightly start | 07:45 UTC, inside MJ's existing 06:00–08:30 UTC nightly window; at most 2 PRs in parallel | Follows `test.yml`'s 07:00 rebuild of `next` (warm turbo cache); avoids the top of the hour, when GitHub delays scheduled runs |

---

## 5. Architecture

### 5.1 Package

`packages/TestingFramework/jit-catching` → `@memberjunction/jit-catching`, `"private": true`. It ships a `jit-catch` CLI:

| Command | Runs | Used by |
|---|---|---|
| `jit-catch generate --pr <n>` | Select, analyze, generate (base only) | Job 1 |
| `jit-catch execute --run <id>` | Prepare base and head, run tests, verdicts, coverage | Job 2 |
| `jit-catch assess --run <id>` | Rules, judges, ranking, store, PR comment | Job 3 |
| `jit-catch run --pr <n>` | All three steps in one process | Local development |
| `jit-catch recheck --pr <n>` | Re-run earlier catching tests on a new head | Push to a labeled PR |
| `jit-catch feedback --event <file>` | Record a checkbox answer or a promotion request | Feedback workflow |
| `jit-catch backtest --corpus <file>` | Run the pipeline over a labeled corpus | Gate 1 |
| `jit-catch label --catch <id> --answer <answer>` | Record a human label collected outside the PR comment | Gate 1 |
| `jit-catch report` | Gate metrics, cost, judge agreement | Nightly summary, on demand |

Making B a product later means flipping `private` and doing the one-time npm trusted-publisher setup (manual 2FA).

### 5.2 Parts

Each part has one job behind an abstract base class. MJ uses this pattern for `BaseLLM` and `BaseEngine`; it lets
the product version register implementations with `@RegisterClass`.

| Part | Job | Track A implementation | Later |
|---|---|---|---|
| PR selector | Choose PRs (§6) | GitHub API | — |
| Change analyzer | Changed packages, files, exports; intent type and risks (one LLM call) | git + LLM | — |
| `BaseTestGenerator` | Write candidate tests on base | Claude Agent SDK | B: MJ AI Agent |
| `BaseCatchTarget` | Prepare a revision, run tests N times, measure coverage | `VitestCatchTarget` | C: `IntegrationCatchTarget`; B: `TestEngineCatchTarget` |
| `BaseVerdictRule` | Label base/head results | `AllRunsAgreeVerdict` | B: `RateComparisonVerdict` |
| `BaseCatchRule` | Drop test faults; boost true-positive patterns | Rule classes (§9.1) | Shared |
| `BaseCatchJudge` | Score a catch with an LLM | TP Prob + three bucket judges | Shared |
| `BaseCatchStore` | Persist runs, tests, results, catches, feedback | `FileCatchStore` | B: `EntityCatchStore` |
| Reporter | PR comment, nightly summary | GitHub | B: Explorer |
| Feedback reader | Answers and promotion requests into the store | GitHub | B: Explorer |

Sketch of the core contracts (names final, members indicative):

```ts
/** Prepares one revision of the code and runs candidate tests against it. */
export abstract class BaseCatchTarget {
    public abstract Prepare(revision: RevisionRef): Promise<PreparedRevision>;
    public abstract Run(revision: PreparedRevision, tests: CandidateTest[], repeats: number): Promise<ExecutionResult[]>;
    public abstract Coverage(revision: PreparedRevision, tests: CandidateTest[], changed: ChangedLines): Promise<CoverageResult[]>;
}

export type VerdictLabel = 'WeakCatch' | 'PassesBoth' | 'ApiChanged' | 'Invalid' | 'Flaky';

/** Turns the base and head results of one test into a verdict. */
export abstract class BaseVerdictRule {
    public abstract Classify(base: ExecutionResult[], head: ExecutionResult[]): Verdict;
}

/** Writes candidate tests for one generation request, working on base only. */
export abstract class BaseTestGenerator {
    public abstract Generate(request: GenerationRequest): Promise<GenerationResult>;
}

/** A deterministic check over one weak catch. */
export abstract class BaseCatchRule {
    public abstract get Name(): string;
    public abstract get Kind(): 'Drop' | 'Boost';
    public abstract Evaluate(context: CatchContext): RuleOutcome;
}

/** One LLM judge's score for one weak catch. */
export abstract class BaseCatchJudge {
    public abstract get Name(): string;
    public abstract Judge(context: CatchContext): Promise<JudgeScore>;
}
```

### 5.3 Flow for one PR

```
PR selector → Change analyzer → Generator (base only)
                                      │ candidate tests
                                      ▼
                Target: run each test 3× on base and 3× on head
                                      ▼
                Verdict rule ──PassesBoth──→ coverage → promotion candidates
                     │ WeakCatch
                     ▼
                Rule filter → Judge panel → ranked catches
                     ▼
                Store ←→ Reporter (comment / summary) ←→ Feedback reader
```

### 5.4 Workflow jobs

| Job | Does | Secrets | Runs PR code | Checks out tool from |
|---|---|---|---|---|
| 1 Generate | Select, analyze, generate; agent runs tests on base only | Anthropic key | No (base is merged code) | `next` |
| 2 Execute | Build base and head, run tests, verdicts, coverage | **None**; `contents: read` | **Yes** | `next` |
| 3 Assess | Rules, judges, store, PR comment | Anthropic, OpenAI and Gemini keys; `contents: write`, `pull-requests: write` | No; reads job 2 output as data | `next` |
| Feedback | Record answers; commit promoted tests | App token for commits; `contents: write` | No | `next` |

Jobs pass data as workflow artifacts. Job 3 validates job 2's output against a schema and never executes it.

---

## 6. Triggers and PR selection

| Trigger | Action |
|---|---|
| Nightly schedule, 07:45 UTC (`45 7 * * *`) | Full run on open PRs to `next` from this repo, whose head SHA has no run yet and which change TypeScript source in packages with vitest tests. Ordered by risk score; at most 10 per night, at most 2 in parallel. Results go to the store and the workflow summary only, until gate 2 passes. |
| `jit-catch` label added | Full run on the current head SHA. Posts the PR comment. At most 10 label runs a day. |
| Comment `/jit run` on a labeled PR | Full run on the current head SHA. Same daily limit. |
| Push to a labeled PR | `recheck` only: re-run earlier catching tests on the new head (no generation). Runs as jobs 2 and 3, without job 1, because it executes PR code. |

**Risk score (starting weights, tuned from gate data):**

| Signal | Weight |
|---|---|
| Touches `packages/MJCore/src/generic/securityInfo.ts`, `packages/MJServer/**`, `packages/SQLServerDataProvider/**`, `packages/PostgreSQLDataProvider/**`, `packages/GraphQLDataProvider/**`, `packages/RedisProvider/**`, `packages/CodeGenLib/**` or `packages/OpenApp/**` | +3 (once) |
| Intent is refactor, perf or dead-code removal (from the Conventional Commit prefix or the analyzer) | +2 |
| Size: changed source lines / 500 | +0 to +2 |
| Number of changed packages | +0.5 each, up to +2 |

---

## 7. Running tests on two revisions (`VitestCatchTarget`)

**Base** is `git merge-base origin/next <head>`. **Head** is the PR head SHA (`refs/pull/<n>/head`).

**Preparing a revision.** In the last 200 PRs merged to `next`, 18% changed no TypeScript source, 33% changed one
package, and 49% changed two or more. Tests read their own package from `src/` but import other MJ packages from
`dist/` (no `paths` aliases outside MJExplorer and MobileApp). So:

1. **Default path.** Two worktrees, `base/` and `head/`. In each: `pnpm install` (pnpm store cache), then
   `turbo run build --filter=<package under test>...`. CI already built `next` and the PR head with the remote turbo
   cache, so both builds should be mostly cache restores. The spike measures this.
2. **Fast path.** If the PR changes source in one package only, use one worktree built at head, and swap that package's
   changed `src/` files back to base for the base run.

**Running.** Generated tests live at `packages/<X>/src/__tests__/jit/<id>.jit.test.ts`; the shared vitest `include`
already matches them. Per revision, all generated tests for a package run in one `vitest run --reporter=json` call,
repeated 3 times. The run uses `TZ=UTC`, a fixed `--sequence.seed`, and no network for the test processes.
`tsc --noEmit` checks each test file against both revisions, because vitest does not type-check.

**Verdicts (`AllRunsAgreeVerdict`):**

| Base | Head | Verdict | Next |
|---|---|---|---|
| 3/3 pass | 3/3 fail, same failure | `WeakCatch` | Rules, judges |
| 3/3 pass | 3/3 timeout | `WeakCatch`, flagged *timeout* | Judges decide: regression or slow test |
| 3/3 pass | 3/3 pass | `PassesBoth` | Coverage, promotion candidates |
| compiles | does not compile | `ApiChanged` | Store only |
| any failure | any | `Invalid` | Discard |
| mixed on either side | | `Flaky` | Discard, record |

**Coverage (promotion candidates).** Run each `PassesBoth` test on head with `@vitest/coverage-v8`, limited to the PR's
changed lines; a test that covers none is not a candidate. On label runs only, and only for packages that still have a
candidate, run the package's existing tests once with coverage and keep tests that cover changed lines the existing
tests miss. Large packages are slow here (`ng-dashboards` takes ~5 minutes), which is why this step is conditional.

---

## 8. Generation

### 8.1 Change analyzer

One LLM call with structured output. Input: PR title and body (marked as untrusted data), the Conventional Commit
prefix, the diff. Output:

- **Intent type**: `feature | fix | refactor | perf | dead_code_removal | logging | config | other`
- **Summary**: one line
- **Risks**: each names a file and symbol, what could break, and how a caller would observe it
- **Packages to test**: ranked by risk, at most 3

### 8.2 Two methods

Both run on every PR, as separate agent sessions in the base worktree, at most 4 sessions in parallel.

| | Dodgy diff | Intent-aware |
|---|---|---|
| Agent gets | Diff + base source of changed files | One risk + the same inputs |
| Agent writes | Tests that pin base behavior on inputs the diff most likely affects | A mutant of **base** for that risk, then tests that kill it |
| Must show before handing in | Compiles and passes on base | Compiles, passes on base, **fails on base + mutant** |
| Starting limit | 5 tests per package | 3 risks per package, 2 tests per risk |

The agent never runs anything on head. The pipeline runs each finished test on head once (3 repeats, §7). An agent that
could iterate against head would find every intended change and make catches meaningless.

**Example.** A PR titled "perf: cache permission checks" keys its cache by entity name only. The analyzer lists risk
R1: "the cache key ignores the user." The agent writes a mutant of base that returns one shared answer for every user,
then a test: `canRead(admin, Users)` is `true` and `canRead(guest, Users)` is `false`. The test passes on base and fails
on the mutant, which proves it can detect R1. On head it also fails — a weak catch with a named reason. Had the PR keyed
the cache by user and entity, the test would pass on head and nothing would be reported.

**"Matches the risk."** When head fails with the same assertion and the same actual value as the mutant did, the catch
is flagged as matching the risk. The rule filter boosts these (§9.1).

### 8.3 Agent constraints (Claude Agent SDK)

- **Read**: read and search inside the base worktree.
- **Write**: only under `packages/<X>/src/__tests__/jit/**`, enforced by a permission check.
- **Run**: one custom tool, `run_test(file, mutant?)`, which runs vitest on that file on base, or on base + mutant in a
  scratch copy. It starts vitest with **no secrets in the environment and no network**. Results return as data.
- **No general shell, no network** beyond the model API.
- **Limits per session**: 30 turns and a token budget (starting values; gate 1 tunes them).
- **Model**: chosen in gate 1 (§13.2).

**Prompt content that prevents false alarms:** the package's existing tests as style examples; the
`@memberjunction/unit-testing` stubs and `ng-test-utils`; `.claude/rules/testing.md`; the anti-pattern rules from
`scripts/check-spec-antipatterns.mjs`; and Meta's false-positive patterns — no private member access, no call counting
on internal functions, no key-order dependence, no mocking the function under test, no unpinned clock or random values.

**Placement.** A test and its mutant live in the package that holds the risky code; the package's own `src/` is read
directly, so killing a mutant needs no rebuild. Each changed package in a cross-package PR gets its own tests.

**Output per candidate test:** PR, head SHA, package, file, method, risk, mutant patch, base result, transcript link,
tokens used. A session that cannot produce a passing test within its limits records a generation failure and the reason.

---

## 9. Filtering and judging

### 9.1 Rule filter

Rules are TypeScript classes with their own unit tests. They read the test's syntax tree (TypeScript compiler API), the
structured vitest failure, the diff hunks and the base source. Each catch is either **dropped** (rule name recorded) or
continues with the list of boosts that fired. Dropped catches stay in the store so over-strict rules can be found.

**Drop rules (test faults):**

| Rule | Fires when |
|---|---|
| `PrivateAccess` | The test reads a member that is `private` or `protected` in base, casts `as unknown as`, or indexes `obj['_x']` |
| `InternalCallCounting` | `toHaveBeenCalledTimes` / `toHaveBeenCalledWith` on a spy of a non-exported function |
| `BrokenMock` | The failure starts inside a `vi.mock` factory or in setup (`beforeEach`), not in the code under test |
| `OrderSensitive` | The assertion compares `JSON.stringify` output, `Object.keys` order, or a stringified object |
| `NotImplemented` | Head throws an error whose message matches `/not implemented/i` |
| `TestOwnError` | A `ReferenceError` or `TypeError` occurs in the test file before the code under test is called |
| `RunnerInfrastructure` | `Cannot find module`, a missing fixture, a hook timeout, a port in use |

**Boost rules (true-positive patterns):**

| Rule | Fires when |
|---|---|
| `NoBehaviorChangeExpected` | Intent is refactor, dead-code removal or perf, and any behavior changed |
| `AdditiveChangeBrokeOutput` | Intent is logging or config, and existing output changed |
| `AccessChange` | The test exercises roles, permissions, `CanRead`/`CanCreate`-style checks or RLS, and access changed for a role the diff did not touch |
| `UnexpectedEmpty` | Head returns `null`, `undefined`, `[]`, `{}` or `''` where base returned a value, from an expression the diff did not change |
| `SaveFailure` | An entity `Save()` or create fails on head and succeeded on base |
| `MatchesRisk` | Head failed with the same assertion and actual value as the mutant |

### 9.2 Judge panel

| Signal | How |
|---|---|
| **TP Prob** | An OpenAI model answers "Is this failure an unintended bug? Yes or no." The first token's log-probability maps to [−1, 1]. |
| **Bucket median** | `claude-opus-5-5`, `gemini-4-argon` and an OpenAI model each answer High / Medium / Low (1 / 0 / −1). Score = median. Each model's reason is kept separately. |

**Input:** test code, failure (expected vs actual), diff, intent and summary, risk and mutant if any, boosts that fired.
PR text and head's failure output are marked as untrusted data. Judges return structured output only.

**Calls** go through MJ's AI provider classes (`@memberjunction/ai` with the OpenAI, Anthropic and Gemini providers),
instantiated directly with keys and no database. The spike confirms this works.

**No funnel, no Batch API.** About 14 PRs a day change TypeScript; at Meta's rates that is ~3 weak catches and ~12 judge
calls a day. Every catch that survives the rules goes to every judge.

### 9.3 Ranking and thresholds

Order by bucket median, then TP Prob, then the number of boosts. Report thresholds are settings:

| Trigger | Reported |
|---|---|
| Label run | Median ≥ Medium, at most 3 catches |
| Nightly (after gate 2) | Median = High, or Medium with `AccessChange` or `MatchesRisk` |

**Calibration.** Each human label from gate 1 and gate 2 is compared with each judge's score using `GetAgreement`
(quadratic kappa, Krippendorff's alpha; ≥ 20 pairs). Results set the thresholds and remove a judge that adds only noise.
People set policy; they do not review individual tests.

---

## 10. Reporting, feedback and promotion

### 10.1 PR comment

One comment per PR, found and updated through a hidden marker (`<!-- jit-catch -->`). It shows the head SHA, status,
and what was checked, and says so in one line when nothing was found.

```
JiT catch results for a1b2c3d · 3 packages · 24 tests · 1 possible problem

1. canRead() gives a second user the first user's answer   [High · matches risk]
   Input:   canRead(admin, Users) then canRead(guest, Users)
   Base:    true, false
   This PR: true, true
   Risk:    "cache key ignores the user" (intent: perf → behavior should not change)
   Was this change intended?
   - [ ] No, it is a bug (I will fix it)
   - [ ] Yes, it is intended
   - [ ] The test is wrong
   ▸ Judge reasons (3)   ▸ Test code   ▸ Mutant

▸ Tests you can add to this PR (2): they cover new lines no existing test covers
   - [ ] Add canRead.cache.test.ts
   - [ ] Add permissionCache.clear.test.ts
```

All text that originates in the PR, a judge, or head's failure output is escaped: no HTML, no live links, and `@`
mentions are broken so nobody is notified.

### 10.2 Answers

- **Checkboxes.** Ticking one edits the comment; a workflow on `issue_comment.edited` records the answer. Only the PR
  author or a user with write access counts. (GitHub Actions has no reaction event, so reactions cannot be used.)
- **Answers survive updates.** When the comment is rewritten for a new head, ticked boxes are restored from the store.
- **"Author changed the PR."** After each push to a labeled PR, `recheck` re-runs earlier catching tests on the new head.
  A test that now passes means the author restored the behavior; this is recorded as a true positive and the comment
  shows "fixed in `<sha>`".

### 10.3 Promotion

Ticking "Add …" makes the feedback workflow commit the stored test to the PR branch, renamed from `.jit.test.ts` to
`.test.ts`. The commit uses a GitHub App token so CI runs on it (open question Q1). Fallback: the comment shows a patch the
author applies with one command. Every candidate must already pass `scripts/check-spec-antipatterns.mjs`.

---

## 11. Storage (`FileCatchStore`)

JSONL files on an orphan branch `jit-catch-data`. Only job 3 and the feedback workflow write; a concurrency group
serializes writes, and a rejected push rebases and retries. Every record is schema-validated. Agent transcripts go to
workflow artifacts (90-day retention); the branch keeps links and summaries. Field names follow MJ entity conventions so
`EntityCatchStore` is a direct port.

| Record | Key fields |
|---|---|
| `Run` | ID, Trigger (`Nightly`, `Label`, `Recheck`, `Backtest`), PRNumber, BaseSHA, HeadSHA, Status, GeneratorModel, TokensByModel, RunnerMinutes, StartedAt, EndedAt |
| `CandidateTest` | ID, RunID, Package, Method, RiskText, MutantPatch, Source, GenerationOutcome, Tokens, TranscriptURL |
| `ExecutionResult` | CandidateTestID, Revision, RunIndex, Status, Assertion, Expected, Actual, StackExcerpt, DurationMs |
| `Catch` | ID, CandidateTestID, Verdict, DroppedByRule, Boosts, TPProb, JudgeBuckets (model, bucket, reason), Rank, Reported, CommentID |
| `Feedback` | CatchID, User, Answer (`Bug`, `Intended`, `TestFault`, `AuthorChangedPR`), Source, At |
| `PromotionCandidate` | CandidateTestID, NewlyCoveredLines, State (`Offered`, `Added`) |

---

## 12. Security

**Secrets never meet PR code or generated tests.**

- Job 2 runs PR code with no secrets and `contents: read`; test processes have no network.
- Jobs 1 and 3 check out the `jit-catch` tool from `next`, never from the PR head. `next` is the default branch, so the
  nightly workflow definition also comes from `next`.
- Generated tests come from an agent that read untrusted PR text. `run_test` in job 1 therefore starts vitest with an
  environment that holds no keys and no network. Keys exist only in the orchestrating process.

**Injected instructions can waste money, not cause harm.** The agent has a narrow tool set; the worst case is wasted
tokens or bad tests. Judges return structured output; the worst case is a wrong score, which deterministic rules and
human answers check. The PR comment renders from structured fields with all external text escaped.

**Only trusted actors trigger actions.** Same-repo PRs only (head repo equals this repo). Adding the label needs triage
access; label runs have a daily limit. Promotion checkboxes count only from the PR author or a user with write access, and
the bot commits only the stored test. Only job 3 and the feedback workflow write to the store.

**Accepted risk.** A user with write access can open a PR that edits this workflow, and a `pull_request` run uses the PR's
copy. This already holds for every workflow in the repo.

---

## 13. Cost and model selection

### 13.1 Prices (checked 2026-11-04, per million tokens)

| Model | Input | Output | Cached input |
|---|---|---|---|
| `claude-opus-5-5` | $4.00 | $20.00 | $0.20 |
| `claude-sonnet-5-5` | $2.00 | $10.00 | $0.20 |
| `claude-haiku-5-5` | $0.10 | $0.50 | — (prompts ≤ 100K; $0.50 / $2.50 above) |
| `gemini-4-argon` (judge) | $2.00 → $4.00 on 2026-12-01 | $10.00 → $20.00 | $0.10 → $0.20 |

Runner minutes are free: MJ is a public repo on standard `ubuntu-latest` runners. The real limits are tokens and the job
concurrency shared with normal CI.

### 13.2 Estimates and model comparison

Assumption: ~7 generation sessions per PR, each ~250k input tokens (mostly cached) and ~20k output tokens. Judges and the
analyzer add cents.

| Generator | Per PR | Nightly cap (10 PRs × 22 nights) |
|---|---|---|
| `claude-opus-5-5` | ~$5 | ~$1,100 / month |
| `claude-sonnet-5-5` | ~$2.50–3 | ~$600 / month |
| `claude-haiku-5-5` | ~$0.15–0.70 | ~$30–150 / month |

These are per PR, not per catch. A weaker model may need more turns, fail more often on base, or kill fewer mutants.
**Gate 1 therefore runs once with each of the three generators** (~$500 total) and compares cost per matched bug-set
catch and clean-set false-alarm rate. The cheapest model that passes gate 1 becomes the default; later tuning passes use
only that model. A split setup (cheap model for dodgy diff, stronger model for intent-aware) is evaluated from the same
data. A non-Claude generator is considered only if no Claude model passes at an acceptable cost; it would need a second
agent harness.

### 13.3 Controls (all settings)

Per session: turn limit and token budget. Per PR: at most 3 packages. Nightly: at most 10 PRs, by risk score. Label runs:
daily limit. Monthly spend limit: when reached, nightly runs stop and the summary says why.

---

## 14. Success gates

### 14.1 Gate 1 — backtest (before any PR comment is posted)

**Bug set (~30 PRs).** Merged PRs whose bug a later PR fixed, where a unit test can show the bug. Found with the SZZ
method: for each fix PR, `git blame` the lines the fix changed (at the fix's parent) to find the commit and PR that
introduced them. Keep pairs where the introducing PR changed TypeScript source in packages with vitest tests; confirm by
hand that the bug is observable at unit level. Record bug PR, fix PR and a one-line description.

**Clean set (~30 PRs).** PRs merged at least 6 months before the backtest, that changed TypeScript source in packages with
vitest tests, and whose changed lines no later fix commit touched.

**Procedure.** Run the full pipeline on each PR, using its original merge-base and `refs/pull/<n>/head`, at the label-run
report threshold.

| Measure | Definition | Pass |
|---|---|---|
| Bug-set catch rate | Bug PRs with ≥ 1 reported catch that **matches the known bug** ÷ bug PRs | ≥ 25% |
| Clean-set false-alarm rate | Clean PRs with ≥ 1 reported catch labeled *Intended* or *TestFault* ÷ clean PRs | ≤ 10% |
| Cost | Tokens and dollars per PR and per matched catch, per generator model | Reported; basis for the spend limit |

**Match check (automatic).** Apply the fix PR's diff on top of the bug PR's head (`git apply --3way`) and re-run the
catching test. If it passes after the fix, the catch matches the known bug. If the fix does not apply, a person decides.

**Clean-set labels (human).** Each reported clean-set catch gets one label: *RealBug*, *Intended* or *TestFault*. Only
*Intended* and *TestFault* count as false alarms. A *RealBug* counts for the pipeline and is filed as an issue: a clean
set selected by "no later fix" can still contain bugs nobody found.

The **original PR author** labels each catch, because only the author knows what the change was meant to do. If the
author has left the team or does not answer within a week, a reviewer of that PR labels it. Gate 1 runs before the PR
comment workflow exists, so the spec owner sends each author the catches for their PRs (expected: 3–6 catches in total,
a few minutes each) and records the answers with `jit-catch label`. No comments are posted on the old PRs.

### 14.2 Gate 2 — live label runs (4 weeks)

| Measure | Definition | Pass |
|---|---|---|
| Precision | Catches answered *Bug* or *AuthorChangedPR* ÷ all answered catches | ≥ 40% (Meta pilot ~20%, full scale 60%) |
| Volume | Answered catches | ≥ 15; otherwise extend the period |

Passing gate 2 turns on nightly PR comments (at the nightly threshold) and starts Track C.

---

## 15. Rollout

| Phase | Delivers | Exit |
|---|---|---|
| 0 Spike | Answers to the questions below; throwaway code | All answered; design adjusted if needed |
| 1 Core | Package, CLI, `VitestCatchTarget`, `AllRunsAgreeVerdict`, generator, analyzer, rules, judges, `FileCatchStore`; `jit-catch run --pr` works locally | Unit tests for every rule and verdict; end-to-end run on 3 real PRs |
| 2 Gate 1 | Corpus files, `backtest` and `report` commands, three-model comparison | Gate 1 passes with the chosen model |
| 3 Gate 2 | Workflows (jobs 1–3, feedback, recheck), PR comment, promotion, data branch | Gate 2 passes |
| 4 Nightly comments | Nightly reporting turned on | — |
| 5 Track C | Own spec, then `IntegrationCatchTarget` | Own gates |
| 6 Track B | Own spec, then `TestEngineCatchTarget`, `RateComparisonVerdict`, `EntityCatchStore`, Explorer feedback | Own gates |

**Spike questions (phase 0):**

1. How long do `pnpm install` + filtered `turbo` build take in a fresh worktree for base and head, and what share is
   remote-cache hits? (5 sample PRs.)
2. Can the Claude Agent SDK restrict tools to read/search, enforce the write path, add `run_test`, cap turns and tokens,
   and report token usage?
3. Can `run_test` start vitest with a scrubbed environment and no network on `ubuntu-latest`?
4. Do MJ's Anthropic, OpenAI (with logprobs) and Gemini provider classes work without a database?
5. Does `INTEGRATION_LIVE_MODEL_KEYS` include an OpenAI key, or is a new secret needed?
6. Does vitest's JSON reporter give assertion, expected, actual and stack for each failure?
7. Does the one-package file-swap path give the same verdicts as the two-worktree path?

---

## 16. What Tracks C and B reuse

Both get their own spec. This section fixes only what they inherit.

**Track C** adds `IntegrationCatchTarget`. Each revision needs SQL Server, migrations and a running MJAPI (~21 minutes cold
in `integration.yml`; the DB snapshot cache cuts this on most PRs). Generated `NamedCheck`s load at run time through
`check-module-loader.ts`; the CI database is throwaway, so registering a temporary Test record is acceptable. It focuses on
RBAC/RLS through `DiscoverRlsFixture`, and runs nightly only, for PRs that touch server, security, provider or cache paths.

**Track B** adds `TestEngineCatchTarget`, `RateComparisonVerdict` (compares pass rates over many runs, since LLM output
varies), `EntityCatchStore` and Explorer feedback. It needs Testing Framework changes this spec does not design: a run
path that writes no rows (or a throwaway database), and base vs candidate prompt/agent configurations. Generator, rules,
judges, reporting model and gates carry over.

---

## 17. Risks

| Risk | Mitigation |
|---|---|
| Old PRs in the backtest miss the turbo cache and build slowly, or need older tooling | Measure in the spike; choose corpus PRs from the last 6–12 months |
| Most generated tests fail on base, so few reach head | Agent loop; prompt includes MJ test examples and stubs; three-model comparison |
| Noise erodes trust | Two gates; one comment per PR; thresholds as settings; nightly comments only after gate 2 |
| Agent SDK cannot enforce the tool limits | Spike question 2; fall back to a hand-written tool loop with the Anthropic SDK |
| Contention with normal CI | Nightly at 07:45 UTC in the existing nightly window, after `test.yml` starts; at most 2 PRs in parallel |
| Model prices change (Gemini rates double on fixed dates) | Prices are settings in the report; spend limit stops nightly runs |

---

## 18. Open questions

| # | Question | Owner |
|---|---|---|
| Q1 | May the promotion workflow commit with the existing release GitHub App token, or a new App? | Repo admins |
| Q2 | Is an OpenAI key available to CI (inside `INTEGRATION_LIVE_MODEL_KEYS` or new)? | Repo admins |
| Q3 | Monthly spend limit after gate 1 measures real cost | Team |

---

## 19. References

- Issue: [MJ#6218](https://github.com/MemberJunction/MJ/issues/6218)
- Paper: [Just-in-Time Catching Test Generation at Meta (arXiv:2601.22832)](https://arxiv.org/abs/2601.22832)
- Blog: [Catching Bugs Before They Land (Meta, 2026-10-29)](https://engineering.fb.com/2026/10/29/security/catching-bugs-before-they-land-jittestings-human-on-the-loop-approach-at-full-scale/)
- Gemini prices: [aistudio.google.com/docs/pricing](https://aistudio.google.com/docs/pricing)
- MJ: [`plans/autodev/PLAN.md`](../autodev/PLAN.md), `.github/workflows/test.yml`, `.github/workflows/integration.yml`,
  `packages/Rubrics/Engine/src/statistics.ts`, `packages/TestingFramework/testing-integration/src/check.ts`,
  `packages/UnitTesting/src/`

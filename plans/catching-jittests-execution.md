# Catching JiTTests — Parallel Agent Execution Plan

> **For the controller session:** this plan drives `superpowers:subagent-driven-development` over
> [`catching-jittests-implementation.md`](catching-jittests-implementation.md) (31 tasks, phases 0 and 1 of the
> [design](catching-jittests-design.md)). It adds what that skill does not decide: which tasks run at the same time,
> how parallel implementers are kept apart, how their work is merged, which models and effort they run at, and where
> the human must be asked. The implementation plan stays the single source of task requirements; nothing here
> restates a task.

**Goal:** finish phases 0 and 1 with the shortest wall-clock time that the task dependencies allow, without losing
the per-task review gate.

**Method in one paragraph.** The controller (this session) dispatches one fresh implementer per task, in *waves*.
Every task in a wave is independent of every other task in that wave, so they run at the same time, each in its own
git worktree on its own branch cut from the integration branch. When a task's review is clean, the controller merges
its branch into the integration branch and runs the integration gate (build + unit tests of the package). The next
wave branches from the merged result. Reviews, fix loops, the ledger and the final whole-branch review follow the
subagent-driven-development skill unchanged.

---

## 1. Fixed rules

| Rule | Value | Source |
|---|---|---|
| Model for every subagent (implementer, task reviewer, re-reviewer, final reviewer) | **Opus** (`model: "opus"`), stated explicitly on every dispatch | user rule: "Always use Opus" |
| Reasoning effort | **medium** unless the user sets another level at the start of execution; the same level for every dispatch of a run | user rule: "ask me the effort level or default to medium" |
| Integration branch | `CB-jit-catching-impl`, cut from `origin/next` with `--no-track`; tracking set to the same-named remote branch at first push | implementation plan, Global Constraints |
| Task branches | `CB-jit-impl-t<N>` where `<N>` is the task number with the dot removed (`t05`, `t111`), cut from the integration branch head at wave start | this plan |
| Task worktrees | `PROJ2/.wt-jit-t<N>` (siblings of `.wt-jit`), one per in-flight task, removed after merge | this plan; repo convention `.wt-*` |
| One implementer per worktree | never two implementers in one worktree; never an implementer in the integration worktree | SDD skill: "Never dispatch multiple implementation subagents in parallel (conflicts)" — satisfied by separate worktrees |
| Merge | controller only; `git merge --no-ff CB-jit-impl-t<N>` into the integration branch after the task review is clean; then the integration gate | this plan |
| Integration gate | `cd packages/TestingFramework/jit-catching && pnpm run build && pnpm test` in the integration worktree, green before the next wave starts (phase 0: `bash -n` on every script and a markdown check of `RESULTS.md`) | MJ CLAUDE.md "Definition of Done" |
| Push | never, unless the user asks; the two known exceptions are listed in §5 | user instruction |
| Keys | the user exports `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` in the controller's shell before the waves that need them (§4); keys never appear in a brief, a report, a ledger line or a commit | design D22/D32 |
| Agents never spawn agents | implementers and reviewers do not dispatch subagents | SDD skill |
| Concurrency cap | at most **7** implementers in flight (wave 4 is the widest); at most **2** tasks that run Docker at the same time (§4 marks them) | workflow-size guideline (medium, <10 agents); runner CPU |

## 2. Workspace and ledger

```bash
# once, before task 0.1 (the controller runs these; task 0.1 then creates the integration branch per its brief)
cd /Users/caelebbalanesi/PROJ2/.wt-jit
SDD=/Users/caelebbalanesi/.claude/plugins/cache/superpowers-marketplace/superpowers/6.3.0/skills/subagent-driven-development/scripts
$SDD/sdd-workspace plans/catching-jittests-implementation.md     # prints <workspace>; ledger = <workspace>/progress.md
```

The ledger's first line: `# SDD ledger — plan: plans/catching-jittests-implementation.md`. Besides the lines the SDD
skill prescribes, each task gets one *dispatch* line and one *merge* line, so a controller that lost its context can
find the worktree and the merge commit:

```
Task 1.7: dispatched — wave 3 — worktree ../.wt-jit-t17 — branch CB-jit-impl-t17 — base a1b2c3d — agent <id>
Task 1.7: complete (commits a1b2c3d..d4e5f6a, review clean)
Task 1.7: merged — integration e5f6a7b — gate green (build ok, 41 tests)
Wave 3: closed — integration head e5f6a7b
```

Recovery after compaction: a task with a `merged` line is done and its worktree may already be gone; a task with a
`dispatched` line but no `complete` line has a live or lost worktree — `git worktree list` and the report file in the
workspace say which; a wave without a `closed` line is still open.

## 3. Per-task cycle (what the controller does for one task)

1. Branch and worktree from the current integration head:
   `git -C /Users/caelebbalanesi/PROJ2/.wt-jit worktree add ../.wt-jit-t<N> -b CB-jit-impl-t<N> CB-jit-catching-impl`
   then `pnpm install --frozen-lockfile` at that worktree's root (phase 1 only; the package must resolve).
2. `BASE=$(git -C ../.wt-jit-t<N> rev-parse HEAD)`; `$SDD/task-brief plans/catching-jittests-implementation.md <N>` → brief path.
3. Dispatch the implementer (Opus, the run's effort level) with the SDD implementer template: one line of context,
   the brief path, the interfaces from earlier tasks it cannot know (copied from the plan's **Interfaces → Consumes**
   block of that task, nothing more), the worktree path as its only working directory, the report path, and the
   no-subagents contract. Ledger the dispatch line.
4. On `DONE`: `$SDD/review-package plans/catching-jittests-implementation.md $BASE <head>` in the task worktree →
   dispatch the task reviewer (Opus) with brief, report, package and the plan's Global Constraints verbatim.
5. Fix loop per the SDD skill (resume the implementer for rounds 1–3; fresh Opus implementer with the report file for
   rounds 4–5; scoped re-review each round; breaker at 5).
6. Clean (or parked at the cap): ledger `complete`; then in the integration worktree
   `git merge --no-ff CB-jit-impl-t<N>`; run the integration gate; ledger `merged`. A gate failure after a clean merge
   is an integration defect: dispatch one fix implementer in the integration worktree alone (no other implementer may
   be in flight there), review, merge the fix into the ledger as a fix round of that task.
7. `git worktree remove ../.wt-jit-t<N> && git branch -d CB-jit-impl-t<N>`.

Merge conflicts are expected only in files two tasks of one wave both touch. §4 lists the shared files per wave; the
controller resolves those conflicts itself (they are section-disjoint by construction) and records a ledger line
`Task <N>: merge conflict in <file> — resolved: <how>`. Any other conflict means the wave table was wrong: stop the
wave, ledger a `Ruling:` with the corrected dependency, and re-plan the remaining tasks of the wave.

## 4. Waves

Dependencies come from each task's **Interfaces → Consumes** block and its import lines in the implementation plan.
A task is in the earliest wave after all of its producers have merged.

### Phase 0 — spike

| Wave | Tasks (parallel) | Needs from the user | Docker | Shared files (conflict-prone) |
|---|---|---|---|---|
| 0-A | **0.1** spike branch, folder, `RESULTS.md`, `Dockerfile.sandbox` | — | builds the image once (`jit-sandbox:spike`) | — |
| 0-B | **0.2** Q6 vitest JSON · **0.3** Q4/Q5 providers · **0.4** Q2 Agent SDK · **0.6** Q7 file swap | `ANTHROPIC_API_KEY` (0.3, 0.4), `OPENAI_API_KEY` + `GEMINI_API_KEY` (0.3) | 0.6 | `plans/catching-jittests-spike/RESULTS.md` — each task edits only its own `§<n>` section |
| 0-B′ | **0.5** Q1/Q3/Q8 on `ubuntu-latest` | **approval to push** the temporary workflow + spike branch (§5); then dispatches for 5 PRs | 0.5 (local run of the attack script first) | `RESULTS.md` §1, §3, §8 |
| 0-C | **0.7** close phase 0 | — | — | `RESULTS.md` summary, design doc if a result changes it |

0-B and 0-B′ run at the same time once the push is approved; 0-B′ is the long pole (five hosted-runner dispatches at up
to 90 minutes each, run two at a time). If the user declines the push, 0.5 runs locally for Q1/Q8 timing only and
`RESULTS.md` §3 records "runner probes not run" — that is a phase-0 exit blocker the controller reports in 0.7.

**Phase-0 exit is a human gate.** Task 0.7 ends with a report to the user: every spike answer, and any design or plan
change the answers force (the implementation plan names the known forks: `pnpm fetch` fallback, Agent SDK tool
enforcement fallback, verdict parity of the file-swap path). The controller does not start wave 1 until the user has
read it, because a changed design changes the briefs.

### Phase 1 — core package

| Wave | Tasks (parallel) | Depends on | Needs from the user | Docker | Shared files |
|---|---|---|---|---|---|
| 1 | **1.1** package scaffold | 0.7 | — | — | — |
| 2 | **1.2** types, schemas, IDs | 1.1 | — | — | — |
| 3 | **1.3** settings · **1.4** contracts · **1.5** redaction · **1.7** git + diff parser · **1.10** vitest JSON parser · **1.14** mutants | 1.2 | — | — | `src/index.ts` (1.4 only) |
| 4 | **1.6** sandbox · **1.8** GitHub lookup · **1.9** package map + risk score · **1.12** verdict · **1.17** `TestAst` + `PrivateAccess` · **1.21** ranker · **1.22** store | 1.6→1.3; 1.8→1.7; 1.9→1.2,1.3; 1.12→1.4; 1.17→1.4; 1.21→1.2,1.3; 1.22→1.5 | — | 1.6 (image `jit-sandbox:local`, smoke step) | `src/types.ts` (1.17 adds `Ast?` to `CatchContext` — no other wave-4 task edits it) |
| 5 | **1.11** `VitestCatchTarget` · **1.13** change analyzer · **1.15** `run_test` tool · **1.18** other drop rules | 1.11→1.4,1.6,1.7,1.9,1.10; 1.13→1.7,1.9; 1.15→1.6,1.10,1.14; 1.18→1.17 | `ANTHROPIC_API_KEY` for 1.13's real-call check | 1.11, 1.15 (smoke steps) — the cap of 2 | — |
| 6 | **1.16** prompts + `ClaudeAgentGenerator` · **1.19** boost rules + `RuleFilter` · **1.20** judges | 1.16→1.15 (+ spike Q2); 1.19→1.17,1.18; 1.20→1.4,1.13 | `ANTHROPIC_API_KEY` (1.16 real session); all three keys (1.20 real check) | 1.16 (one real session) | `src/rules/index.ts` (1.19 only) |
| 7 | **1.23** run dir, pipeline steps, `run`, CLI | all of waves 3–6 | — | — | `src/index.ts` |
| 8 | **1.24** end-to-end on 3 real PRs | 1.23 | all three keys; `gh` logged in; **spend approval** (three generator sessions, judges) | yes | `README.md`, `PHASE1-E2E.md` |
| F | final whole-branch review (Opus, highest effort the user allowed) → one fix dispatch → one scoped re-review | 1.24 | — | — | — |

Critical path: 1.1 → 1.2 → 1.3 → 1.6 → 1.15 → 1.16 → 1.23 → 1.24 (eight sequential tasks); everything else hides
behind it. Wave 4 is the widest (7 implementers).

**Tasks a wave must not split.** 1.17 modifies `types.ts`; it is the only wave-4 task allowed to, and the plan's
wording ("import the type") is the instruction the brief carries. 1.19's `src/rules/index.ts` lists every rule by
class name from 1.17 and 1.18, so it waits for both. 1.20 imports `UNTRUSTED_OPEN`/`UNTRUSTED_CLOSE` from 1.13, so it
waits for 1.13 even though it is otherwise independent.

## 5. Where the controller stops and asks

The SDD skill's four stop classes, made concrete for this plan:

1. **Push of the temporary spike workflow** (task 0.5): the workflow runs on a hosted runner only from a pushed
   branch. Ask before the push; name the branch and the file. The workflow holds no secrets of its own (job 1 half
   uses `TURBO_TOKEN` read-only, as the plan states).
2. **Spend** (tasks 0.4, 1.16, 1.24, and 1.20's real check): each real model session costs money. Ask once per wave
   that needs keys, with the plan's estimate (design §13.2: ~$5 per PR with Opus as generator, cents for judges),
   and state which key each task reads.
3. **Phase-0 exit** (task 0.7): design changes are the user's to accept.
4. **A plan defect that leaves every path a guess** — ledger the `Ruling:` attempt first; stop only if none exists.

Everything else — ambiguities, cap exceedances, reviewer/plan conflicts — is a `Ruling:` in the ledger, reported in
the final message under "Rulings I made".

## 6. Dispatch brief additions per wave

The SDD implementer template carries the contract. Each dispatch also states, verbatim:

- "Your working directory is `/Users/caelebbalanesi/PROJ2/.wt-jit-t<N>`. Do not run commands in any other checkout.
  Stage named files only; never `git add -A` or `git add .`; never push."
- "Branch: `CB-jit-impl-t<N>`. Commit on it with the message the brief gives; end commit messages with the attribution
  line the controller supplies."
- "Other tasks run at the same time in other worktrees. Do not edit files outside the list in your brief. If you need
  a change in a shared file (`src/index.ts`, `src/types.ts`, `RESULTS.md`), make only the change your brief names."
- Phase 1: "Run `pnpm test` and `pnpm run build` inside `packages/TestingFramework/jit-catching` before reporting;
  paste the pass/fail counts into the report."
- Keys, where the brief needs them: "Read `ANTHROPIC_API_KEY` from the environment; never print it, never write it
  to a file."

## 7. Reviewer briefs

Task reviewers get the three paths (brief, report, review package) and the implementation plan's **Global
Constraints** block verbatim. For wave 4 onward, add one line naming the producer interfaces the task consumes (from
the plan's Consumes block), so the reviewer checks the signature match that the implementer could not see in its own
diff. Do not add anything that pre-judges a finding.

## 8. Time and cost expectation

Serial execution of 31 tasks at roughly 25–40 minutes each (implement + review) is 13–20 hours of wall clock. With
the waves above, the critical path is 8 tasks plus 7 single-task waves (0.1, 0.7, 1.1, 1.2, 1.23, 1.24, final review)
— about 15 task-slots, so roughly half the serial time, bounded below by the hosted-runner dispatches in 0.5 and the
real model sessions in 1.16 and 1.24. Subagent token cost grows with the number of dispatches, not with parallelism:
31 implementers + 31 reviewers + fix rounds, all Opus at the chosen effort.

## 9. Finish

When wave F is clean: collect every `Ruling:` line into the final message, delete the SDD workspace, remove any
leftover task worktrees, and hand over with `superpowers:finishing-a-development-branch` (merge options for
`CB-jit-catching-impl`; the push to `origin/CB-jit-catching-impl` needs the user's word).

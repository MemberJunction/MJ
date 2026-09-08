# Replay-First Regression Suite — Integration & Cutover Plan

**Status:** PROPOSAL · 2026-07-21 · The third and final plan in the regression-testing series

**Scope:** the **seam** between the two sibling plans — the wiring that turns the Computer Use plan's built-but-dormant replay machinery into the regression suite's actual execution model, running on the Docker plan's rebuilt substrate. This plan owns: build/data identity, the trace lifecycle (record → store → promote → review), the `ComputerUseTestDriver` tier-dispatch cutover, the retry-policy contract between CU failure classes and the DR-D2 scheduler, per-tier capacity, the suite-wide authoring enablement pass, and the triggers that un-gate the measurement-gated CU Wave-4 items. Items use the `RI-` prefix (Replay Integration).

**Standing assumptions.** This plan assumes both siblings are **done**:

1. **[Computer Use Robustness Plan](computer-use-robustness-plan.md) Waves 0–4 (Layer 1) — LANDED** (true today, per the per-item status blocks in that doc). The engine ships `Replay()`, `recordTrace`/`isRecordableRun`, `decideReplayTier`, the deterministic heal + `healTargetViaLLM` seam, `distillGoalPostconditions`/`executeGoalPostconditions`, `JudgeVerdictCache`/`SetJudgeCache`, `RunPrelude`, `ContextSeed`, `buildFailureMemo` + `PreviousAttemptSummary`, `diffTraces`, `classifyFailure` (13-class taxonomy), and element-grounded perception — all unit-tested, all app-agnostic, **none invoked by the driver yet**.
2. **[Docker Regression Reliability Plan](docker-regression-reliability-plan.md) — COMPLETE** (assumed, not yet true). Specifically this plan leans on: DR-B1 (hash-keyed DB snapshot, pristine data per run), DR-B5 (`:ro` metadata mount, live pushes), DR-C5 (`.docker-generated/.fingerprint`), DR-D1 (shared work queue), DR-D2 (classified/deferred/budgeted retries), DR-D3 (health-state admission), DR-D5 (per-attempt JSONL), DR-D8 (attempt-lineage columns incl. `FailureCategory`), DR-E2 (single env contract), DR-E4 (TTL-aware auth re-bootstrap), DR-E6 (warm-up page load), DR-F1 (host-minted `RUN_ID`), DR-F4 (`rerun-failures`), DR-G1 (failure-signature clustering), DR-G3 (quarantine lane), DR-G6 (`history`/`report` + duration/cost trends).

Where an assumption fails (a DR item slips), the affected RI item states its minimum fallback.

---

## 1. Executive Summary

The two sibling plans deliberately partition the problem: the CU plan builds a smarter, cheaper **per-test agent** and the complete replay/heal/warm-seed machinery; the Docker plan builds a deterministic, observable, self-protecting **suite substrate**. Both explicitly leave one thing to "the seam": nothing ever tells the driver to *use* the flagship. Today `ComputerUseTestDriver.Execute` ([ComputerUseTestDriver.ts:157](../../packages/AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts#L157)) calls `engine.Run()` unconditionally — every one of the 380 tests pays full vision-LLM cost on every run, forever, with ~90 unit-tested replay modules sitting dormant one import away. The engine even emits a retry memo (`ComputerUseResult.FailureMemo`) that the driver never reads, and accepts one (`PreviousAttemptSummary`) that nothing ever sets.

This plan closes that seam. It is deliberately small in mechanism — almost every item is *wiring between things that already exist* — and deliberately explicit about **decisions**, because the siblings parked their cross-plan questions here (trace storage, build identity, the failure-taxonomy contract, postcondition trust, capacity re-planning). A bridge plan that re-opens those questions has failed; §3 answers each one.

The shape of the cutover:

1. **Identity first (Theme A).** One composite `APP_BUILD_HASH` — git SHA + DR-C5 generation fingerprint + DR-B1 data-snapshot hash — minted by the CLI at `up`, threaded as env, stamped on every trace and result. Replay keying, warm-seed invalidation, and trace demotion all hang off this one string. The DR-B1 pristine-restore is what makes replay *deterministic*: same snapshot → same UUIDs → recorded selectors and URLs stay valid run over run.
2. **Traces as reviewed artifacts (Theme B).** Recording runs write traces to the run directory; a `promote-traces` CLI step (with `diffTraces` as the review surface) lands them in `metadata/tests/regression/traces/`, git-committed and mounted `:ro` into the runner per DR-B5. A trace diff **is** a UI-change report; promotion is where a human sees it.
3. **The driver switch-on (Theme C).** `Execute` becomes: load trace → `decideReplayTier` → `Replay` (sub-minute, zero tokens) or `Run` (hardened LLM tier) → on divergence, fall back to `Run` within the same attempt → on recordable pass, re-record. Plus the four deferred Layer-2 seams: the LLM heal-disambiguation override, the suite-shared judge cache, the capture-once warm seed (including the missing `SharedContextBrowserAdapter` parity), and the regression profile (element grounding ON, temperature 0).
4. **Retries that consume what the engine emits (Theme D).** The definitive `failureClass` → retry-policy matrix (answering the Docker plan's Open Question 5), the memo round-trip that makes attempt 2 non-blind, per-tier concurrency (replay wide, LLM capped), and the post-cutover capacity re-benchmark (answering its Open Question 9).
5. **The authoring pass (Theme E).** Deep links + `UserApplication` seeding, the deterministic-oracle floor, and the suite-level regression profile — phased by the catalog's priorities (P0 = 6, P1 = 95 first).
6. **Un-gating rules (Theme F).** The CU plan's measurement-gated Wave-4 items get their concrete triggers, computable from DR-G6 telemetry, so "revisit when data exists" becomes a standing query instead of a memory.

End state, restated from the siblings' shared metrics: ≥80% of executions on the replay tier within 3 runs of full cutover; replay p50 ≤ 20s against a pass-p50 baseline of 59s; suite LLM token spend −85%; full-suite wall clock < 2h (7.8h baseline); flaky count < 8 (37 baseline); total attempts ≤ 1.10× tests (1.36 baseline); and whole-feature app defects surfaced as `app-error` with diagnostics on their **first** appearance — never retried three times again.

---

## 2. Starting Position: What Each Plan Leaves at the Seam

### 2.1 Inherited from the CU plan (built, tested, dormant)

| Capability | Layer-1 API (all exported from `@memberjunction/computer-use`) | Dormant because |
|---|---|---|
| Replay execution | `ComputerUseEngine.Replay(trace, params)` → `ReplayInfo{Tier, Steps, Healed, Diverged}` | Driver never calls it |
| Trace recording | `isRecordableRun`, `recordTrace`, `hashGoal` | Driver never writes traces to disk |
| Tier decision | `decideReplayTier({trace, goal, appBuildHash, healRate})` | No trace store, no build hash, no heal ledger |
| Self-heal | deterministic `reresolveTarget`/`shouldAcceptHeal` + protected `healTargetViaLLM` (base: confidence 0) | MJ override + heal prompt template never authored |
| Verification | `distillGoalPostconditions`, `executeGoalPostconditions`, `JudgeVerdictCache` + `SetJudgeCache` | Distill-at-record + cross-attempt cache are driver-side |
| Preludes / deep links | `RunPrelude` + `evaluatePreludeLanding`; `params.StartUrl` | Test metadata still starts every test at bare `/` |
| Warm seed | `ContextSeed` + `CaptureContextSeed`/`SeedContext` (PBA only) | Capture-once never wired; **SCBA — the suite adapter — lacks the overrides** |
| Non-blind retries | `ComputerUseResult.FailureMemo` out; `RunComputerUseParams.PreviousAttemptSummary` in | Driver surfaces neither; `PriorAttemptSummary` carries no memo |
| Failure taxonomy | `classifyFailure` → 13-class `ComputerUseFailureClass`, stamped on `DriverExecutionResult.failureClass` | Emitted ✓ — but no scheduler consumes it (that scheduler is DR-D2) |
| Canary drift report | `diffTraces` → `meaningfulDrift` | No force-LLM-tier dispatch, no canary schedule |
| Element grounding | `params.ElementGrounding` (default **false**) | Never flipped for the suite |

### 2.2 Inherited from the Docker plan (assumed operational)

Pristine, hash-keyed data per run (DR-B1/B2) · metadata pushed from a `:ro` live mount (DR-B5) · a single work queue with health-gated dispatch (DR-D1/D3) · classified, deferred, budgeted retries awaiting a taxonomy (DR-D2) · per-attempt JSONL + attempt-lineage columns (DR-D5/D8) · a strict env contract that can carry new variables in one table edit (DR-E2) · TTL-aware auth bootstrap (DR-E4) · a scripted warm-up page load before test #1 (DR-E6) · host-minted `RUN_ID` + `rerun-failures` + `ci` mode (DR-F) · signature clustering, quarantine, and duration/cost trend queries (DR-G1/G3/G6).

### 2.3 The gap, in one sentence

Every capability in §2.1 terminates at a driver or scheduler boundary that §2.2 now makes safe to cross — and nothing crosses it.

### 2.4 The suite being cut over

The redesigned catalog ([regression-suite-redesign.md](regression-suite-redesign.md), [regression-test-catalog.md](regression-test-catalog.md)): **380 functionally-distinct, data-agnostic tests** (T001–T380) at `metadata/tests/regression/.T*.json`, suite membership in `metadata/test-suites/.regression-suite.json`, priorities P0 = 6 · P1 = 95 · P2 = 207 · P3 = 72. Data-agnosticism (assert behavior, pass on empty states) is a tailwind for this plan: postconditions distilled from passing runs are less data-coupled, so traces invalidate less.

---

## 3. Decisions

The siblings parked their cross-plan open questions on this seam. This plan is final, so it answers them. Each decision is binding unless a phase gate (§5) falsifies it.

| # | Question (origin) | Decision |
|---|---|---|
| D1 | **Trace storage & review workflow** (CU OQ#1) | **Git-committed files** at `metadata/tests/regression/traces/T{NNN}.trace.json`, one per test, mounted `:ro` into the runner (DR-B5 policy: metadata is mounted, never baked). Recording runs write candidates to `$RUN_DIR/traces-out/`; they reach the repo only through `mj test regression promote-traces` (RI-B3), whose review surface is the `diffTraces` summary. Rationale: traces are compiled test artifacts like snapshot files — versioned with the code they exercise, diffable in PRs, and immune to the DR-B1 per-run DB restore (which would wipe DB-resident traces). The archive MJ instance stores replay *statistics*, never the traces themselves. |
| D2 | **`appBuildHash` definition** (CU OQ#2, DR-C5) | Composite string minted by the CLI at `up`: `<gitSha:12>:<genFingerprint:12>:<dbSnapshotHash:12>` — source SHA, the DR-C5 `.docker-generated/.fingerprint`, and the DR-B1 snapshot hash. Declared in the DR-E2 env contract as `APP_BUILD_HASH`; opaque to Layer 1 (`decideReplayTier` compares strings). Any component changing ⇒ no exact match ⇒ `replay-with-heal` (the safe default the keying module already implements). `Trace.AppVersion` = the MJ package version, stamped by the driver. |
| D3 | **Postcondition trust bar** (CU OQ#3) | Distilled `goalPostconditions` **gate** replay-tier pass/fail from day one — they are presence-based (role/name, URL pattern), distilled only from judge-approved + oracle-green passes, and reviewed implicitly at promote time (they live inside the committed trace). The independent guard is the canary lane (RI-C6): every canary run re-derives the outcome via the full LLM path and D7 divergence tracking alarms if replay verdicts drift from judge verdicts. No 380-test manual review pass. |
| D4 | **Failure-taxonomy contract** (DR OQ#5) | The authoritative enum is the shipped `ComputerUseFailureClass` (13 values, [classify-failure.ts](../../packages/AI/MJComputerUse/src/test-driver/classify-failure.ts)), assigned **by the driver** post-run, persisted to DR-D8's `FailureCategory` column verbatim. The DR-D2 stopgap regex classifier is deleted at cutover. The retry-policy mapping is RI-D1's matrix. Other drivers own their own vocabularies (`DriverExecutionResult.failureClass` is free-form by design); the scheduler keys on string match with a default policy for unrecognized classes. |
| D5 | **Retry tier selection** ("retry-as-replay-first", CU-C2 ⇄ DR-D2) | Retries **re-enter tier dispatch** — a retry with a valid trace replays first (cheap), and a replay divergence falls back to the LLM tier *within the same attempt* (RI-C1). No special-case "force LLM on retry" logic; the memo (RI-D2) rides along regardless of tier. |
| D6 | **Capacity re-planning after replay lands** (DR OQ#9) | Phase 3 (§5) ends with a mandated re-benchmark run that re-derives worker counts, per-tier concurrency caps, and DR-D10 shard sizing from the measured tier mix. Until then, LLM-tier concurrency keeps the pre-cutover worker count and replay-tier concurrency starts at 2× it. |
| D7 | **`AppProfile` metadata home** (CU OQ#8) | Three-level merge, most specific wins: driver-baked MJ defaults (already shipped) ← suite-level `TestSuite.Configuration.computerUse` block (RI-E3 adds the channel) ← per-test `Configuration.appProfile` (already shipped). One mechanism for profile, grounding flag, generation knobs, and trace policy — the "regression profile" is just the suite-level block. |
| D8 | **Authoring backfill strategy** (CU OQ#10) | Phased by catalog priority, not big-bang: P0+P1 (101 tests) get deep links, variables discipline, and oracle floors in Phase 2; P2/P3 ride opportunistic triage plus one scripted sweep for mechanical parts (start URLs are derivable from each test's section/app). Traces themselves need **zero** authoring — they are recorded, not written. |
| D9 | **The 27 cross-run-consistent app defects** (DR OQ#6) | Out of scope to *fix*, in scope to *contain*: DR-G1's whole-feature-cluster flag auto-files them as suspected app defects; they enter the DR-G3 quarantine lane (executed, reported, non-gating) with `app-error`/`assertion` classes and 0 retries until the product fix lands. This plan's cutover metrics exclude quarantined tests from gate math but report them in every run. |
| D10 | **Network-replay third tier** (CU OQ#6, Meticulous pattern) | **Declined.** The replay tier already removes LLM cost; mocking GraphQL would decouple the suite from the real stack — the thing it exists to test — for marginal wall-clock. Revisit only if Phase 3's wall-clock gate misses by >2×. |

---

## 4. Integration Catalog

Themes: **A** build & data identity · **B** trace lifecycle · **C** driver cutover · **D** scheduler seams · **E** suite authoring · **F** un-gating the measurement-gated items.

Every item is Layer-2 / TestingFramework / CLI / metadata work except where explicitly marked **[L1-parity]** — app-neutral Layer-1 gap-fills that keep the CU-E7 genericity gate green (they add generic capability parity, never app knowledge).

---

### Theme A — Build & Data Identity

#### RI-A1 — Mint and thread `APP_BUILD_HASH`

**Problem.** `decideReplayTier` and `ContextSeed` invalidation both key on a build identity that nothing produces. Today the graceful default (empty string → `replay-with-heal`) would work but wastes the zero-heal `replay` fast path on the 95% of runs where nothing changed.

**Proposal.** The CLI computes the composite at `up` (Decision D2): `git rev-parse --short=12 HEAD` + the DR-C5 fingerprint + the DR-B1 snapshot hash — all three already exist host-side in the assumed end-state. Declare `APP_BUILD_HASH` in the DR-E2 env contract (runner-visible); the driver reads it once (`process.env.APP_BUILD_HASH ?? ''`) and (a) passes it to `decideReplayTier`, (b) stamps it on every recorded trace, (c) emits it into the DR-D5 JSONL per attempt so the report can segment results by build. Dirty working trees append `-dirty` (never exact-matches, so local iteration always runs `replay-with-heal` — correct).

**Fallback if DR-C5/B1 slip:** git SHA alone. Strictly better than the empty string; the composite only widens exact-match coverage.

**Expected impact.** Exact-match builds take the zero-heal replay path; every result is attributable to a build; seed/trace invalidation becomes intentional.

#### RI-A2 — Trace ↔ data-snapshot coupling (why replay is deterministic at all)

**Problem.** Recorded traces embed the *shape* of data-bearing pages: URL patterns tokenize UUIDs (`{uuid}`), but typed text, landmark headings, and grid contents can still reflect seed data. Without pristine data, replay determinism decays run over run as prior tests' writes accumulate.

**Proposal.** No new mechanism — this item is the *contract*: the regression suite records and replays **only against DR-B1 pristine restores**, and the snapshot hash is a component of `APP_BUILD_HASH` (RI-A1), so a data change demotes exact-match to `replay-with-heal` automatically. Mutation tests rely on the same restore for teardown (the sibling's data-isolation guarantee the CU plan named as replay's precondition). Document in the trace store README that a trace is valid *relative to a snapshot*, not absolutely.

**Expected impact.** The single assumption that makes selectors/URLs stable enough for ≥80% replay share; data drift becomes a keyed invalidation, not a mystery flake.

---

### Theme B — Trace Lifecycle

#### RI-B1 — Record on recordable, oracle-green passes (the driver's write path)

**Problem.** CU-C1's deferred half: nothing serializes traces. The gate logic (`isRecordableRun`: Completed + judge Done + no FailureReason + no step errors + all actions replayable) is pure and shipped; the driver must add its own AND-condition — **all gating oracles passed** — and the postcondition distillation.

**Proposal.** In `Execute`, after oracle scoring, when `status === 'Passed'` ∧ `isRecordableRun(result).recordable` ∧ run was LLM-tier (never re-record from a replay — it would launder healed selectors without fresh derivation):
1. `distillGoalPostconditions({finalUrl, elements, volatileParams})` → `goalPostconditions` (CU-C5's record-time half).
2. `recordTrace({testId, appBuildHash, appVersion, goal, steps, variableValues, volatileParams, goalPostconditions})` — `variableValues` from the driver's resolved `{{variables}}` (context.variables), so recorded literals tokenize back to `%name%` placeholders.
3. Write to `$RUN_DIR/traces-out/T{NNN}.trace.json` (atomic tmp+rename), and append a one-line record to the DR-D5 JSONL (`tracesRecorded` counter for the report).

Recording is **always on** — it is nearly free (serializing StepRecords already in memory) and shadow-records improvements even before dispatch cuts over.

**Expected impact.** Every green LLM run mints the asset the whole plan consumes; recordability % becomes a tracked metric from the first Phase-1 run.

**Risks.** Coordinate-mode steps record weak targets — mitigated by RI-C5 flipping element grounding ON before Phase 1 recording begins (the CU plan's "A4-era traces are the real product").

#### RI-B2 — The committed trace store

**Problem.** No home, no load path, no mount.

**Proposal.** `metadata/tests/regression/traces/` (Decision D1): one `T{NNN}.trace.json` per test plus `.trace-health.json` (the heal ledger, RI-B4) and a `README.md` stating the validity contract (RI-A2) and the promotion workflow. The runner sees it via the existing DR-B5 `:ro` metadata mount; the driver resolves the directory from `CU_TRACE_DIR` (DR-E2 contract entry, defaulting to the mount-relative path) and lazily loads + caches per test at `Execute` time. Traces are **driver-read files, not mj-sync entities** — they never touch the DB, so `mj sync push` ignores them (add the directory to the sync ignore set if the glob would sweep it).

**Expected impact.** Trace reads are free and versioned; a `git log` on a trace file is the UI-change history of that test.

#### RI-B3 — `promote-traces`: the review gate

**Problem.** Auto-committing traces from inside a run (the "nightly bot commits to `next`" temptation) would silently ratify UI drift and stamp root-owned files into the repo — the exact class of pollution DR-B4/B5 just eliminated.

**Proposal.** `mj test regression promote-traces [--run ID] [--test T042] [--dry-run] [--json]` (extends the DR-F command family, keyed by DR-F1 run IDs):
1. For each candidate in the run's `traces-out/`, diff against the committed trace with `diffTraces` and print the classified summary — `selector-drift` (routine, heal-class) vs `meaningfulDrift` (steps added/removed, targets/methods/URLs changed).
2. Copy accepted candidates into the store, update `.trace-health.json` (reset heal counters for re-recorded tests), and leave the working tree for a normal human-reviewed commit/PR.
3. `--json` emits the drift report for CI annotation: a PR that legitimately changes the UI shows its trace diffs as review artifacts; a PR that *doesn't* intend UI change but produces `meaningfulDrift` in the nightly gets flagged (the "this PR changed the UI" signal both siblings promised).

Cadence: after nightly runs, the suite owner promotes; new tests' first traces promote trivially (no baseline to diff).

**Expected impact.** UI drift becomes a reviewed diff instead of an accident; the cottage industry of "why did this test start failing" triage gets its primary source document.

#### RI-B4 — The heal ledger (cross-run trace health)

**Problem.** `decideReplayTier`'s `healRate` input and its demote-to-LLM threshold (default 0.5) need per-test history that survives runs; the engine only knows the current run.

**Proposal.** `metadata/tests/regression/traces/.trace-health.json`: per test `{healedSteps, replayedSteps, consecutiveDivergences, lastReplayedBuild}`. The driver reads it (same `:ro` mount) to compute `healRate` for `decideReplayTier`; each run's deltas ride the JSONL; `promote-traces` folds deltas back into the committed ledger (and re-recording resets the counters). The richer time-series lives in the archive DB via DR-G6 — the ledger is deliberately just the scheduler-facing summary.

**Expected impact.** Chronically-drifting traces demote themselves to LLM tier and re-record; the ledger diff in a promotion PR shows suite-wide UI churn at a glance.

**Risks.** Two writers (multiple concurrent runs) — promotion is serialized through the CLI, and deltas are additive; last-promote-wins is acceptable for a summary.

---

### Theme C — Driver Cutover

#### RI-C1 — Tier dispatch in `Execute` (the switch-on)

**Problem.** The flagship's last missing conditional.

**Proposal.** Rework `Execute` (after config/input parse, before `buildRunParams`):

```
trace  = loadTrace(testId)                       // RI-B2, null-safe
health = loadHealthEntry(testId)                 // RI-B4
tier   = config.forceTier                        // RI-C6 canary override
      ?? decideReplayTier({ trace, goal: input.goal,
                            appBuildHash: env.APP_BUILD_HASH,
                            healRate: health?.rate })

if tier is replay | replay-with-heal:
    replayResult = engine.Replay(trace, params)   // params carry VariableValues
    if replayResult.Success → score via oracles over replay actualOutput; done (record ReplayInfo)
    else → fall through to LLM in the SAME attempt:
           params.PreviousAttemptSummary = replayResult.FailureMemo   // divergence context
llmResult = engine.Run(params)                    // today's hardened path
on recordable pass → RI-B1 record
```

Mechanics: `params.VariableValues` = the driver's resolved variables (fresh values substitute into `%name%` placeholders); the replay leg is wall-clock-bounded (steps × `ActionTimeoutMs`), so the driver's `effectiveTimeout` covers replay + fallback without a new budget concept; `ReplayInfo` lands on `actualOutput.replay` and in the JSONL (tier, hit/healed/diverged counts — the Momentic cache-provenance pane, now suite-visible). Oracles run identically on both tiers — the replay tier's goal-postcondition gate (already inside `Replay`) is *additional* rigor, not a substitute.

**Expected impact.** The order-of-magnitude item: at the observed ~88% stable-pass rate, most executions become sub-minute and zero-token; host load drops, which independently improves the residual LLM-tier pass rate (the siblings' second-half-degradation analysis).

**Risks.** In-attempt fallback doubles worst-case duration for diverging tests — bounded (replay legs are fast) and rare by construction (divergence ⇒ UI changed ⇒ next pass re-records). A diverged-then-LLM-passed attempt reports `Passed` with `replay.Diverged > 0` — the drift signal survives the green result.

#### RI-C2 — The LLM heal-disambiguation override

**Problem.** Layer 1 heals deterministically (moved element, same role+name). The ambiguous residue (multiple candidates, renamed element with same intent) needs the `healTargetViaLLM` override that CU-C3 deferred: one focused Layer-2 prompt.

**Proposal.** New metadata prompt "Computer Use - Heal" + `heal.template.md` (fresh indexed element list + the step's recorded `Instruction` + the failed target descriptor → `{index, confidence}`); `MJComputerUseEngine.healTargetViaLLM` override routes it through `AIPromptRunner` like controller/judge — **remembering the named-field mapping trap** (the template sees only explicitly-mapped `data` fields). The existing `shouldAcceptHeal` gate (0.6) applies unchanged; a low-confidence heal still fails the step rather than guessing.

**Expected impact.** Heal coverage extends from "moved" to "renamed/reworded" drift; one cheap text call replaces a 35-step re-derivation for the second-most-common drift class.

#### RI-C3 — Suite-shared judge verdict cache

**Problem.** `JudgeVerdictCache` + `SetJudgeCache` exist per-engine-instance; the driver constructs a fresh engine per test ([ComputerUseTestDriver.ts:592](../../packages/AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts#L592)), so cross-attempt caching (a cached `Impossible` on an identical state short-circuiting a retry) never engages.

**Proposal.** One module-level `JudgeVerdictCache` in the driver, keyed already by `(goalHash, normalizedUrl, stateHash)` so cross-test collisions are impossible; `SetJudgeCache(sharedCache)` on every engine. Size-bound it (LRU, ~500 entries) since a suite run is long-lived. Cleared per process start (per run) — verdicts must never survive a build change.

**Expected impact.** Retry attempts stop re-paying judge calls for states the run has already judged; verdict variance across attempts drops.

#### RI-C4 — Warm-seed capture-once **[L1-parity: SCBA]**

**Problem.** Two gaps: (a) `SharedContextBrowserAdapter` — the adapter the suite actually runs on — does not override `CaptureContextSeed`/`SeedContext` (only PBA does), so the G4 machinery silently no-ops in suite mode, the exact drift class CU-A3's parity test was built to catch; (b) nothing captures the seed once per run.

**Proposal.**
1. **[L1-parity]** Extract PBA's page-level capture/restore functions into the shared page-utility module (the CU-A3 pattern) and override both methods on SCBA; extend the adapter-parity test to cover them. App-agnostic — E7 gate unaffected.
2. Capture-once at the DR-E6 warm-up: the warm-up page load (which already boots the app end-to-end post-auth) ends with `CaptureContextSeed(appOrigin)` → `$RUN_DIR/context-seed.json`. Per-run capture means the seed is *always* fresh for its run — no cross-run invalidation logic at all (`APP_BUILD_HASH` keying is only needed if a future optimization persists seeds across runs; don't build that now).
3. The driver loads the seed file once (path via `CU_CONTEXT_SEED_FILE`, DR-E2 entry) and sets `params.ContextSeed` on every test — both tiers. Layer 1's delete-on-error restore already guarantees a bad seed cold-boots clean.

**Fallback if DR-E6 slips:** the driver captures from the first completed test per worker and seeds the rest.

**Expected impact.** ~380 × workers cold metadata boots → 1 per run; the "Loading workspace…" page — the most load-sensitive surface in the failure corpus — leaves almost every test's critical path; replay-tier runs get faster still.

#### RI-C5 — The regression profile: grounding ON, pinned generation

**Problem.** `ElementGrounding` defaults false and `generation` is per-test — the suite still runs coordinate/vision mode at default temperature, which caps trace quality (weak targets) and injects trajectory variance.

**Proposal.** Via the D7 suite-level config channel (RI-E3): `{ elementGrounding: true, generation: { temperature: 0 }, trace: 'retain-on-failure' }` as the regression suite's `Configuration.computerUse` block. Sequence matters: **flip grounding before Phase-1 recording starts** so first-generation traces carry resolved role/name/selector targets. Measure the CU-F4 trace overhead on the P0 smoke slice before the `retain-on-failure` default sticks (the plan's own stated bar).

**Expected impact.** Recorded traces are heal-able (semantic targets); the LLM tier's misclick class stays closed; attempt-to-attempt variance shrinks before replay removes most of it entirely.

#### RI-C6 — Canary dispatch and scheduling

**Problem.** CU-C7's dispatch half: full determinism would blind the suite to the exploration-found bug class (Feature Pipelines was found by an agent getting lost in a broken lazy route).

**Proposal.** `config.forceTier?: 'llm' | 'replay'` honored by RI-C1's dispatch (per-test override, also the `rerun-failures --llm` escape hatch). Scheduling: nightly runs force-LLM a rotating 10% slice — selection seeded by `RUN_ID` hash so it's deterministic per run and covers the suite every ~10 nights; per-commit/PR profile runs replay-preferred with canary **off**. Canary runs that pass diff their fresh derivation against the stored trace (`diffTraces`); `meaningfulDrift` findings land in the DR-G1 report as UI-drift signatures and queue the trace for re-record via promotion. Canary failures report through the DR-G3 quarantine convention (non-gating) per the CU plan's risk note.

**Expected impact.** Exploration coverage retained at ~10% of its former cost, on a schedule instead of by accident.

---

### Theme D — Scheduler Seams

#### RI-D1 — The `failureClass` → retry-policy matrix (the DR-D2 contract)

**Problem.** DR-D2 built classified/deferred/budgeted retries around a taxonomy placeholder; the taxonomy shipped (13 classes) but the binding was never written down. This table is it — the answer to the Docker plan's Open Question 5.

**Proposal.** All retries remain DR-D2-deferred (end-of-run pass, reduced concurrency, suite budget ≤ ⌈0.15 × suiteSize⌉) and re-enter tier dispatch (Decision D5). Policy per class:

| `failureClass` | Retries | Condition / notes |
|---|---|---|
| `app-error` | **0** | DR-G1 auto-flag "suspected app defect"; quarantine candidate (Decision D9) |
| `impossible` | **0** | Triage; RI-C3's cached verdict short-circuits identical-state re-checks anyway |
| `assertion` | **0** | Deterministic oracle failed a clean run — a regression or a stale postcondition; `rerun-failures --category assertion` is the manual override; repeated `assertion` on an unchanged build queues the trace for re-record review |
| `cancelled` | **0** | Operator/watchdog action, not a test outcome |
| `auth-detour` | **1** | Gated on DR-E4 having re-bootstrapped auth since the failure; any occurrence raises an env alarm — post-E4 this class should be ≈0 |
| `loop-detected` | **1** | Memo-injected (RI-D2) — the reflexive-retry case the memo was built for |
| `judge-disagreement` | **1** | Memo-injected; increments the D7/RI-F trigger counters |
| `stuck-page` / `env-stall` | **1** | Health-gated: dispatch only when DR-D3 state is green |
| `timeout-progressing` | **1** | Health-gated (env slowness is the likely cause; drained-load retry is the fix) |
| `timeout-stuck` | **1** | Health-gated; a second identical failure flags for triage, never a third attempt |
| `infra` | **2** | After browser-context recycle (DR-D4's poisoned-context rule); not an agent fault |
| `unknown` | **1** | Memo-injected; `unknown`-rate > 5% of failures alarms the classifier itself |

Persist the class verbatim into DR-D8's `FailureCategory`; DR-G1 uses it as the primary signature component (plus route prefix and, new here, the replay divergence step index when the failing attempt had one — divergence points cluster UI changes precisely).

**Expected impact.** The recheck-storm class (27 deterministic failures × 3 blind attempts ≈ 4.7h for 1h of signal) becomes structurally impossible; retry spend concentrates where retries actually convert.

#### RI-D2 — The memo round-trip (non-blind attempt 2)

**Problem.** Confirmed both halves dangle: the driver never surfaces `result.FailureMemo` (zero references in [ComputerUseTestDriver.ts](../../packages/AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts)), and nothing ever sets `params.PreviousAttemptSummary` — the engine's Layer-2 mapping ([MJComputerUseEngine.ts:251](../../packages/AI/MJComputerUse/src/engine/MJComputerUseEngine.ts#L251)) and the controller template block are live wire to nowhere.

**Proposal.** Three additive touches:
1. **Out:** the driver stamps `result.FailureMemo` → `actualOutput.failureMemo` + `DriverExecutionResult.failureMemo?` (same additive pattern as `failureClass`) on every non-passing path (main, timeout, cancelled).
2. **Carry:** `PriorAttemptSummary` (EngineBase) gains `failureMemo?` + `failureClass?`; `summarizeAttempt` copies them — still payload-free.
3. **In:** the DR-D2 scheduler exposes prior attempts to the next attempt — `DriverExecutionContext.priorAttempts?: PriorAttemptSummary[]` (additive, optional; the TestEngine's `runOnce` closure threads what `runWithRetries` already collects). The driver sets `params.PreviousAttemptSummary` from the latest memo. Replay-tier retries carry it too (harmless; consumed only if the attempt falls back to LLM).

**Expected impact.** Attempt 2 stops being a blind re-roll (32% baseline conversion); memo-fed retry conversion becomes a measured number — which is itself the RI-F2 trigger input.

#### RI-D3 — Per-tier concurrency and queue ordering

**Problem.** Both plans flagged it (the Docker plan's cross-plan capacity note; CU-C2's "retries become cheap"): once most tests are browser-bound replays, a single worker-count knob either starves the cheap tier or overloads the expensive one.

**Proposal.** At queue-seed time the engine pre-computes each test's *predicted* tier with the same pure inputs the driver will use (trace present + goal-hash match + ledger heal-rate — no engine construction needed). The DR-D1 queue then: (a) seeds predicted-replay tests first (fast early signal, and the whole replay wave completes before host load ramps); (b) applies an **LLM-tier semaphore** = the pre-cutover worker count, while replay-tier tests dispatch up to the browser-fleet width (DR-A2's per-browser containers are the capacity boundary); (c) leaves DR-D11 heavy-class throttling applying to the LLM tier only. Prediction mismatches (driver decides differently at Execute time) are harmless — the semaphore is acquired by *actual* tier at dispatch-into-engine time.

**Expected impact.** Wall-clock approaches (replay wave ≈ minutes) + (LLM residue at full worker width); the host never sees today's worst load shape again.

**Risks.** Two knobs where there was one — surface both in DR-F5's flags and print them in the effective-config banner.

#### RI-D4 — Cutover telemetry: making the report tier-aware

**Problem.** The DR-G report was designed pre-tier; without tier columns the cutover's success is unmeasurable and a replay false-pass would be invisible.

**Proposal.** JSONL/attempt records gain `tier`, `replayHit/Healed/Diverged`, `tracesRecorded`, `appBuildHash` (RI-A1/C1 emit them); DR-G2's HTML report adds a tier lane to the swimlane and a replay-health panel (hit/heal/diverge rates per run, trending via DR-G6); DR-G1 signatures include the divergence step index (RI-D1). The D7 divergence report (self vs judge vs oracle) gains the fourth column — replay postcondition verdict — closing the loop on Decision D3's trust argument.

**Expected impact.** "Is replay lying to us" is a dashboard, not a debate; every §6 metric becomes a query.

---

### Theme E — Suite Authoring Enablement

#### RI-E1 — Deep links + `UserApplication` seeding (CU-C6's deferred half)

**Problem.** Every test still starts at bare `http://localhost:4200` — the switcher-hunt archetype persists on the LLM tier and lengthens every recorded trace by 3–8 steps of navigation that isn't the test's subject.

**Proposal.** (1) db-setup seeds `UserApplication` rows for all 28 apps under test — inside the DR-B1 snapshot content, so it's paid once per snapshot build. (2) A scripted authoring sweep stamps `startUrl` deep links onto tests from their catalog section→route mapping (the catalog already organizes by app/section); P0+P1 first (Decision D8), navigation-subject tests (Section 1) explicitly keep bare starts. (3) Tests needing post-navigation setup that isn't their subject get a `prelude` block (`RunPrelude` actions) — expected to be rare; author on triage evidence, not speculatively.

**Expected impact.** Shorter, more-focused traces; several LLM steps × 380 tests removed from the residual tier; the switcher leaves the failure statistics.

#### RI-E2 — Deterministic-oracle floor (CU-D3.4 + D2's unblocked oracles)

**Problem.** Zero-oracle tests self-grade on the engine's own verdict; and CU-D2's `db-state` oracle was deferred *on the data-isolation gate that DR-B1 has now satisfied*.

**Proposal.** (1) Suite validation rule (regression profile): every test carries ≥1 non-LLM gating oracle or an explicit `selfGraded: true`. Cheap floor for all 380: `no-console-errors` (already shipped, free, and the ChunkLoadError tripwire). (2) Auto-draft `dom-assert`s from each promoted trace's `goalPostconditions` (they're the same shape) — the authoring pass CU-D2 costed at "380 tests" becomes a script over the trace store. (3) Implement `db-state` (SQL row/column assertion via the stack's mssql helper) now that every run starts from a pristine snapshot; author it onto the CRUD tests (Section 3) opportunistically.

**Expected impact.** Pass/fail's center of gravity completes its move from judge to assertions; replay and LLM tiers verify against the same deterministic backbone.

#### RI-E3 — The suite-level configuration channel

**Problem.** Decision D7 needs a merge point: the driver currently reads per-test `Configuration` only; suite-wide policy (grounding, temperature, trace policy, canary %) has no home short of editing 380 files.

**Proposal.** `TestSuite.Configuration.computerUse` block, delivered to the driver via `DriverExecutionContext` (additive optional `suiteConfiguration?` if no channel exists — verify first; the engine already resolves suite variables through a hierarchy, so a config passthrough follows the same path). Driver merge order: baked defaults ← suite block ← per-test config. The regression profile (RI-C5) is the first consumer; canary percentage (RI-C6) the second.

**Expected impact.** Suite policy becomes one JSON edit; per-test files stay about the test.

---

### Theme F — Un-gating the Measurement-Gated Items

The CU plan deferred four Wave-4 refinements "until data exists." DR-G6 + RI-D4 now define that data. Each deferred item gets a standing trigger — evaluated per nightly report, not remembered by humans. Building any of these **before** its trigger fires remains out of scope (their absence is a design decision, not a gap).

| Deferred item | Un-gate trigger (rolling 3 full runs) | First action when fired |
|---|---|---|
| CU-B9 two-model planner/actor | `loop-detected` + `judge-disagreement` > 10% of **LLM-tier** failures *and* E2 plan-field stagnation visible in those runs' step records | Prototype on the worst-oscillating catalog section only |
| CU-B6 parts 1–2 (RunMemory ledger + reflection call) | Memo-fed retry conversion (RI-D2) ≤ blind-retry baseline +10 pts (i.e. memo alone isn't moving attempt-2 pass rate) | Add the reflection call to the retry path first (cheapest leg) |
| CU-D6 k-vote ensembles | D7 judge↔oracle disagreement > 10%, or ≥2 `Impossible` reversals observed in a month | Enable k=3 on the flapping tests only (per-test knob, not suite-wide) |
| CU-C4 scoped invalidation | After routine merges, > 30% of traces demote/heal on the first post-merge run (whole-suite keying proving too coarse) | Key invalidation by route-prefix ∩ changed-area manifest from the build diff |
| Canary % (RI-C6 tuning) | Canary finds zero `meaningfulDrift` and zero new defects for 4 consecutive weeks → halve %; a canary-found app defect → hold | Adjust the suite-config knob |

---

## 5. Sequencing

Four phases, each with a **hard gate** — the next phase does not start until the gate passes. Everything inside a phase is parallelizable.

**Phase 0 — Plumbing (no behavior change).**
RI-A1 (identity env) · RI-B2 (store + env contract entries) · RI-C4.1 (SCBA seed parity + tests) · RI-C2 (heal prompt + override) · RI-D2 outbound half (memo surfacing) · RI-E3 (suite-config channel) · RI-D4 schema additions.
*Gate:* unit/integration suites green (both packages + TestingFramework); one manual end-to-end record on the T001 smoke — trace written, promoted by hand, loaded, replayed locally.

**Phase 1 — Shadow record.**
RI-C5 (grounding ON, temp 0 — **before** recording so traces are semantic) · RI-B1 (record-on-pass, suite-wide) · RI-C4.2/3 (warm seed live) · RI-D2 inbound half (memo-fed retries) · RI-D1 matrix live in DR-D2 (retry policy no longer needs replay to pay off). Tier dispatch stays **off**.
*Gate (2 nightly runs):* recordability ≥ 70% of passing tests; warm-seed active with zero seed-corruption cold-boots... (delete-on-error count = boots, not errors); memo-fed retry conversion measured; grounding introduces no pass-rate regression vs the pre-phase baseline.

**Phase 2 — Pilot cutover (P0 + P1, 101 tests).**
`promote-traces` (RI-B3) seeds the store from Phase-1 recordings · RI-C1 tier dispatch ON for the pilot slice · RI-C3 (judge cache) · RI-B4 (ledger) · RI-E1 deep links for the slice · RI-D3 per-tier concurrency (predicted-tier seeding).
*Gate (3 nightly runs):* pilot replay share ≥ 80%; replay p50 ≤ 20s; **zero replay false-passes** (canary-audited: force-LLM re-runs of a sample of replay-passes agree); divergence-fallback correctly re-records (observed at least once).

**Phase 3 — Full cutover + canary.**
Dispatch ON suite-wide · RI-C6 canary (10% nightly; per-commit profile replay-preferred) · RI-E1/E2 sweeps complete for P2/P3 · RI-D4 report panels · Decision D6's **re-benchmark run** re-derives workers/semaphores/shards from the measured tier mix.
*Gate:* the §6 cutover metrics, measured over one representative week.

**Phase 4 — Steady state.**
Theme F triggers standing in the nightly report · DR-G3 quarantine holding the Decision-D9 defect set until product fixes land · promotion cadence owned (suite owner) · `.trace-health` trends in DR-G6.

---

## 6. Success Metrics (cutover acceptance)

Inherited targets from the siblings' §7s, now owned here because only the integrated system can hit them (baselines: full run 20260718T160625Z; recheck 20260720T034359Z):

- **Tier mix:** replay-tier share ≥ **80%** of executions within 3 runs of Phase 3; canary slice reporting separately.
- **Speed:** replay-tier per-test p50 ≤ **20s** (pass p50 baseline 59s); full-suite wall clock < **2h** (baseline 7.8h).
- **Cost:** suite LLM token spend −**85%** vs baseline (measurable via CU-F2 linkage + DR-G6 roll-ups; `totalCost` nonzero on every record).
- **Stability:** flaky (pass-on-retry) count < **8** (baseline 37); total attempts ≤ **1.10×** tests (baseline 1.36×); heal rate < 5% of replay steps in steady state, spikes correlating with real UI merges (verified against promoted trace diffs).
- **Retry economics:** a recheck of deterministic failures costs ≤ **1 attempt per test** (baseline: 3× each, 4.7h for 1h of signal); zero retries dispatched for `app-error`/`impossible`/`assertion`.
- **Honesty:** replay false-pass rate **0** observed (canary-audited); D7 four-way divergence < 10%; every attempt row carries `tier`, `failureClass`, `appBuildHash`.
- **Drift as signal:** a UI-changing merge produces a `meaningfulDrift` cluster in the next nightly's report and a reviewable trace diff at promotion — demonstrated at least once before Phase 4 is declared.

---

## 7. Residual Open Questions

Deliberately short — everything the siblings parked here is decided in §3. What remains is genuinely external:

1. **Promotion ownership.** `promote-traces` needs a named suite owner (a person/rotation, not a bot) for the nightly review-and-commit cadence. Recommendation: whoever owns the regression suite's gate signal; needs a name before Phase 2.
2. **Auth0 tenant configuration.** DR-E4's consent pre-authorization and token-TTL changes are tenant-owned; RI-D1's `auth-detour` policy assumes they land. If the tenant can't be changed, the E4 re-bootstrap carries the whole burden and the class stays >0 — acceptable, but alarm thresholds need retuning.
3. **Product fixes for the Decision-D9 defect set** (Routines, Bulk Operations, Feature Pipelines, Credentials, Database Designer clusters). This plan contains them (quarantine, 0 retries, first-run diagnostics); fixing them is product work with its own owners. The suite's gate math treats them as expected-fail until then.
4. **Published-image consumers.** DR-C6's `agentic-test-runner` base image ships the driver; external consumers replaying against non-MJ apps get the same tier machinery via their own profiles/trace stores — but the promotion CLI is monorepo-shaped. Whether to generalize `promote-traces` for external consumers is deferred until one asks.

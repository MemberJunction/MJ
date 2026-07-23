# Regression-Testing Series — Unshipped Inventory

**As of:** 2026-07-22 · branch `CB-regression-suite-improvements`
**Purpose:** one authoritative list of everything in the three regression-testing plans that has **not** shipped, so the remaining work is visible in one place and the replay-first cutover can be scoped against reality (not the plans' optimistic standing assumptions). Derived from each plan's own per-item status blocks, the git history on this branch, and a four-way codebase ground-truth sweep (Layer-1 APIs, driver/TestingFramework seams, Docker item status, metadata/adapter layout).

The three plans:
1. `computer-use-robustness-plan.md` — the per-test agent + replay/heal machinery (the "CU-" items).
2. `docker-regression-reliability-plan.md` — the suite substrate (the "DR-" items).
3. `replay-first-integration-plan.md` — the seam that wires (1) onto (2) (the "RI-" items). **PROPOSAL — nothing built.**

---

## 0. The headline

Two sibling plans are **substantially shipped**; the third (the integration/cutover) is **entirely unbuilt**. The suite the cutover targets **exists and is well-formed**:

> **The 380-test regression suite is materialized in `metadata-optional/regression-test/`.**
> `tests/regression/.T001…T380-*.json` — each with a `goal`, a `startUrl`, oracles + scoring weights, and a `P0/P1/…` tag — plus `test-suites/.regression-suite.json` membership (all 380 joined via `@lookup:MJ: Tests.Name=…`, `applicationContext` from `@file:context/mjexplorer-context.md`), bound to `MJ: Tests` by `filePattern: "**/.*.json"`. It lives under `metadata-optional/` — opt-in metadata that a default `mj sync push` does not sweep — which is the correct home for test-fixture metadata (mirrors `metadata-optional/integration-test/`). The `.deleted-computer-use-tests.json` tombstones under the *main* `metadata/tests/regression/` are the **old** T01–T25 location being retired, not the current suite.

So the cutover's later phases (record → promote → dispatch across the suite) have a real suite to run against; what gates them is **live-run capability** (an LLM-driven suite + a scheduler), not missing test definitions. Everything below is a normal deferral.

---

## 1. Docker Reliability plan (`DR-`) — not shipped

**Shipped:** 34 of 48 items (12 of them partial). **Not shipped (14):**

| ID | Title | Note |
|---|---|---|
| DR-A2 | Browser fleet off the app host (browser grid) | No commit. Load-bearing auth-path change ("the bootstrap login flow *is* the test"). |
| DR-A4 | Worker-count auto-derivation | **Formula-only**: `suggestWorkers` shipped inside DR-F5 as *advisory*; the cgroup-read auto-clamp in the DR-A4 body did not. |
| DR-A5 | MJAPI longevity across multi-hour runs | No commit. Verifiable only by a live multi-hour run. |
| DR-A6 | Remove/supervise socat | No commit. Auth-path change. |
| DR-B3 | Kill the double-codegen at the root | No commit. §6 notes the fix lives in CodeGenLib. |
| DR-C2 | One shared builder, thin per-service images | No commit. Build re-architecture; needs a 4-image rebuild to prove. |
| DR-C3 | Runtime-configurable Explorer | No commit. Paired with DR-C2. |
| DR-C6 | Adopt the published `agentic-test-runner` base image | No commit. **Needs a container-registry publish** — impossible in this environment. |
| DR-D6 | Resumable runs | No commit. Needs an interrupted live run to verify. |
| DR-D10 | Sharding across stacks/hosts | No commit. Multi-host infra. |
| DR-D11 | Per-test concurrency classes | No commit. Needs G6 duration data + a live scheduler. |
| DR-E4 | Auth bootstrap hardening (infra side) | No commit. Auth0-tenant-owned; **a dependency of replay-first RI-D1's `auth-detour` policy.** |
| DR-G3 | Flaky tracking, SLO, quarantine lane | No commit. **A dependency of replay-first Decision D9 / RI-C6 canary containment.** |
| DR-G5 | Screenshot/artifact pipeline efficiency | No commit. Needs a live run to measure. |

**Notable partials (shipped, with the remainder deferred):**
- **DR-B1** — snapshot/restore (B1a) landed + live-verified; **B1b prebuilt DB image deferred**.
- **DR-B5** — `:ro` mount + live prompt freshness landed; **schema-only push-removal deferred** (folded into DR-B1).
- **DR-D2** — classify + budget + backoff landed; **separate end-of-run retry phase deferred**.
- **DR-D8** — file-based attempt lineage + retry-aware `compare` landed; **DB lineage columns deferred**.
- **DR-E2** — `MAX_RETRIES` unblock landed; **full single env contract deferred**.
- **DR-F6** — JUnit emitter carve-out landed; **full `ci` orchestration deferred**.
- **DR-F7** — safe path-hardening slice landed; **run-from-subdir refactor + orchestration inversion deferred**.
- **DR-G1** — coarse clustering (category + route) landed; **cross-run signature IDs + perceptual hashing deferred**.
- **DR-G6** — duration/flake/pass-rate landed; **cost half plumbed-but-`n/a`** (blocked on CU cost telemetry reaching the archive).

---

## 2. Computer Use Robustness plan (`CU-`) — not shipped

**Shipped:** 48 of 50 items. **Genuinely not shipped (2):**

| ID | Title | Note |
|---|---|---|
| CU-B9 | Two-model planner/actor split | Explicitly DEFERRED — measurement-gated by design (replay-first Theme F gives it a concrete un-gate trigger). |
| CU-G2 | Release screenshots from RAM | Explicitly DEFERRED to a later wave. |

**The dominant CU deferral is not a whole item — it is a layer.** Theme C (the replay flagship) and CU-G4/C6 shipped their **Layer-1 core only**; the **entire Layer-2 driver integration is deferred** and is precisely what the replay-first plan exists to build:
- record-to-disk (CU-C1 driver half), tier dispatch (CU-C2 driver half), self-heal LLM-disambiguation + leg-2 re-derive (CU-C3), build-hash source (CU-C4), cross-attempt judge cache wiring (CU-C5 driver half), per-test deep-link/prelude metadata + seeding (CU-C6), force-LLM canary dispatch + scheduling (CU-C7), driver capture-once warm seed + SCBA parity (CU-G4).

All Layer-1 APIs are **present, exported from `@memberjunction/computer-use`, unit-tested, and dormant** (verified: `Replay`, `decideReplayTier`, `recordTrace`/`isRecordableRun`/`hashGoal`, `diffTraces`, `distillGoalPostconditions`/`executeGoalPostconditions`, `JudgeVerdictCache`/`SetJudgeCache`, `reresolveTarget`/`shouldAcceptHeal`/`healTargetViaLLM`, `RunPrelude`/`evaluatePreludeLanding`, `ContextSeed`/`CaptureContextSeed`/`SeedContext`, `ElementGrounding`, `FailureMemo`/`PreviousAttemptSummary`). The driver already wires three of them (`classifyFailure`, `ElementGrounding`, and it *accepts* `PreviousAttemptSummary`/*produces* `FailureMemo` at the engine layer — but nothing threads the memo across attempts).

---

## 3. Replay-First Integration plan (`RI-`) — not shipped (entire plan)

No `RI-` commit exists. Status by theme, with the concrete gate that blocks each:

| Item | What | Gate |
|---|---|---|
| **RI-A1** | Mint & thread `APP_BUILD_HASH` (gitSha + DR-C5 fingerprint + DR-B1 snapshot hash) | **Buildable now** (deps DR-C5 ✓, DR-B1a ✓). |
| **RI-A2** | Trace↔snapshot determinism *contract* (doc, not code) | Buildable now (a README + the RI-A1 keying). |
| **RI-B1** | Driver record-on-pass (write traces to `$RUN_DIR/traces-out/`) | Needs a **live LLM run + the suite** to actually fire. Pure helper is testable. |
| **RI-B2** | Committed trace store (`metadata-optional/regression-test/tests/regression/traces/`) + driver `loadTrace` path | **Buildable now** (dep DR-B5 `:ro` ✓; colocated with the suite it keys off). |
| **RI-B3** | `promote-traces` CLI (diff→review→commit) | Needs recorded traces (RI-B1) + the suite. Pure diff/copy is testable. |
| **RI-B4** | Cross-run heal ledger (`.trace-health.json`) | Needs recorded traces + runs. |
| **RI-C1** | **Tier dispatch in `Execute`** (the switch-on) | **Load-bearing; live-run + suite gated.** Plan itself keeps this OFF until Phase 2. Do not ship blind. |
| **RI-C2** | LLM heal-disambiguation prompt + `healTargetViaLLM` override | Override **compiles now**; runtime needs a live LLM. Authorable. |
| **RI-C3** | Suite-shared module-level judge cache | Behavior-affecting; small. Authorable + unit-testable. |
| **RI-C4.1** | [L1-parity] extract PBA capture/restore → shared module, override on SCBA, extend parity test | **Buildable now** (app-neutral Layer-1). |
| **RI-C4.2/3** | Capture-once warm seed wired into DR-E6 warm-up + driver | Needs a live run (DR-E6 ✓, but capture fires only in a run). |
| **RI-C5** | Regression profile (grounding ON, temp 0) via suite config | Delivered by RI-E3; effect needs live recording. |
| **RI-C6** | Canary force-LLM dispatch + nightly scheduling | Needs a live scheduler. |
| **RI-D1** | `failureClass` → retry-policy matrix | **Buildable now** (dep DR-D2 ✓ partial). Pure. `auth-detour` sub-policy leans on DR-E4 (absent) — degrade gracefully. |
| **RI-D2** | Non-blind attempt-2 memo round-trip | **Buildable now** — pure additive wiring; engine halves already built. Fully unit-testable. |
| **RI-D3** | Per-tier concurrency + predicted-tier queue ordering | Pure `predictTier` is testable; queue integration needs DR-D1 wiring + a live run. |
| **RI-D4** | Tier-aware report columns (JSONL fields + panels) | Additive JSONL fields buildable now; panels need real tier data. |
| **RI-E1** | Deep links + `UserApplication` seeding | Suite exists (§0) — sweep is a large mechanical edit over 380 files (each already has a `startUrl`; the sweep points them at deep routes) + effect needs live runs; `UserApplication` seeding rides DR-B1. |
| **RI-E2** | Deterministic-oracle floor + `db-state` oracle | Suite exists — floor rule is a sweep over the 380 files; `db-state` oracle authorable (dep DR-B1 ✓). |
| **RI-E3** | Suite-level `computerUse` config channel + merge | **Buildable now** — `suiteContext` is already an open-ended bag. |
| **RI-F** | Un-gate triggers for CU-B9 / B6 / D6 / C4 | Standing queries over DR-G6 telemetry; needs live data. |

---

## 4. This-pass implementation scope — what landed

Built the **Phase-0 plumbing + the pure, independently-unit-testable logic** — the slice that is additive, safe, and verifiable in this environment without a live LLM suite, a scheduler, or a live browser. Everything load-bearing that only a live run can validate is **deliberately deferred**, per the plan's own Phase-0-is-no-behavior-change design and the standing rule against shipping unverifiable load-bearing changes blind.

**Landed (each additive, per-package build + unit tests green):**

| Item | What landed | Package(s) · tests |
|---|---|---|
| **RI-D2** | Non-blind retry round-trip: driver surfaces `ComputerUseResult.FailureMemo` → `DriverExecutionResult.failureMemo` → `TestRunResult`/`PriorAttemptSummary` → `runWithRetries` feeds prior attempts forward → `buildRunParams` sets `PreviousAttemptSummary`. Lights up a fully-built-but-dormant engine feature (CU-B6) with pure additive wiring. | `testing-engine-base`, `testing-engine` (141), `computer-use-engine` (176) · **+3** |
| **RI-E3** | Suite-level `computerUse` config channel + `baked ← suite ← per-test` merge (`suite-config.ts`), read from the existing open-ended `suiteContext` bag (no type change). No-op for every current suite. | `computer-use-engine` · **+11** |
| **RI-A1** | `APP_BUILD_HASH` minting (`computeAppBuildHash` = git SHA + schema fingerprint, graceful fallback) + threaded as env from `up`, surfaced in the compose contract + `.env.test.example`. **Note:** collapses the plan's 3 components to 2 — the gen-forms fingerprint and DB-snapshot hash are the same value here by construction. | `@memberjunction/cli` (453) · **+5** |
| **RI-B2** | *Store half:* committed trace store `metadata-optional/regression-test/tests/regression/traces/` + validity-contract README (D1/RI-A2) + `ignoreDirectories` sync guard. | metadata · (declarative) |
| **RI-C4.1** | [L1-parity] extracted the CU-G4 capture/restore into shared `page-storage.ts`, gave SCBA the `CaptureContextSeed`/`SeedContext` overrides it lacked (closing the suite-mode no-op gap), extended the parity gate. | `@memberjunction/computer-use` (428) · **+3** |
| **RI-C2** | Authored the `Computer Use - Heal` prompt + template + the `healTargetViaLLM` override routing through `AIPromptRunner` (mirrors controller/judge). The pure `parseHealResponse` is unit-tested; the LLM call is compile-verified only. | `computer-use-engine` + metadata · **+9** |

**Deferred this pass (with the gate):**
- **RI-D1** — DR-D2 already implements its substance (`retry-policy.ts` `maxExtraAttemptsForCategory` + `failure-classifier.ts` normalize the CU taxonomy → per-category caps + suite budget). The RI-D1 *delta* (13-class granularity, `assertion`→0, delete-the-regex-stopgap) is a **live-behavior change to the shared retry scheduler** whose correctness the plan itself gates behind Phase-1 nightly runs — not shipped blind.
- **RI-B2 driver half** (`loadTrace` + `CU_TRACE_DIR`) — its only consumer is RI-C1 tier dispatch; adding a trace-load to `Execute` with nothing reading it is ahead-of-consumer.
- **RI-C1** (tier dispatch — Phase 2, live), **RI-B1/B3/B4** (record/promote/ledger — need live recording), **RI-C4.2/3 · C5 · C6** (warm-seed capture-once, profile effect, canary — live), **RI-D3** queue integration (needs DR-D1 wiring + live), **RI-D4** report panels (need tier data), **RI-E1/E2** authoring sweeps (large mechanical edits over the 380 files; effect needs live runs).

**On the cutover's later phases:** the 380-test suite already exists (`metadata-optional/regression-test/`), so replay-first Phases 1–3 are gated on **live-run capability** (an LLM-driven suite + a scheduler) — not on authoring the suite. The RI-B2 trace store colocates with it under `tests/regression/traces/`; RI-C1 dispatch is the pure code change that activates the whole tier.

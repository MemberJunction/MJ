# Video Studio — post-release hardening

**Status:** Proposed
**Date:** 2026-11-09
**Scope:** MJ core. Video Studio shipped in 6.2.0 (PR #5055, merged 2026-10-31; on npm 2026-11-04) and 6.2.1.
**Related:** [`plans/video-studio.md`](video-studio.md) (the build spec), [`guides/VIDEO_STUDIO_GUIDE.md`](../guides/VIDEO_STUDIO_GUIDE.md), #4827, #6372

---

## Why this plan exists

Video Studio's design is sound. The quality gates are pure functions in code, the render happens out of
process and is reproducible, data snapshots run as the requesting user, and the render worker is locked
down in several layers. This plan does not change any of that.

A review after release found three operational risks and a few smaller items:

1. **No CI job renders a real video.** The renderer is the most fragile part of the system, and CI
   never exercises it.
2. **Video Studio works around three agent-framework bugs instead of fixing them.** Every other agent
   still hits those bugs, and the workarounds may conflict with the eventual fixes.
3. **Large changes to the shared agent framework shipped inside the Video Studio PR.** That PR was 603
   files and about 150k lines, and it changed code every agent depends on.

Each workstream below is one or more small PRs into `next`. None needs a migration or a metadata
change unless noted.

---

## WS1 — Render a real video in CI

### What is true today

- Every test that runs the real renderer (Chrome + ffmpeg + HyperFrames) is opt-in:
  - `VIDEO_STUDIO_RENDER_TESTS=1`, plus `ffmpeg` on `PATH`, turns on
    `RenderWorker/src/__tests__/{hyperframes,checks,chart-kit}.render.test.ts` and
    `Engine/src/__tests__/local-worker-render-driver.test.ts`.
  - `VIDEO_STUDIO_DOCKER_TESTS=1` turns on the real-container suite in
    `Engine/src/__tests__/docker-render-driver.test.ts`.
  - `VIDEO_STUDIO_RENDER_URL` turns on the remote-driver suite in
    `Engine/src/__tests__/remote-render-driver.test.ts`.
- No workflow in `.github/workflows/` sets any of these, so every suite above is skipped on every PR.
  `describe.skipIf` reports a skip as a pass.
- `docker.yml` builds only `docker/MJAPI/Dockerfile`. The render worker's own
  `packages/AI/VideoStudio/RenderWorker/Dockerfile` is never built in CI.
- The deterministic end-to-end integration bundle (IT151, `video-studio-production.checks.ts`) uses an
  in-process fake renderer. The only real model-plus-render check (IT152,
  `video-studio-live-smoke.checks.ts`) is opt-in and gated on `RequiresLiveModel`.
- The renderer depends on seven HyperFrames packages pinned at `0.8.134`, a pre-1.0 third-party
  library, plus a headless Chrome and ffmpeg. A version bump to any of them can break rendering with
  CI still green.

### Tasks

- **WS1-1 — One shared opt-in helper.** `checkCanRunRealRenderTests()` is copied into several test
  files. Move it to one test helper per package. Add a "required" mode
  (`VIDEO_STUDIO_RENDER_TESTS_REQUIRED=1`) in which a missing prerequisite **throws** instead of
  skipping, so a CI job cannot pass by skipping everything.
- **WS1-2 — Build the worker image in CI.** A job that builds the RenderWorker `Dockerfile` and runs
  the worker's health check inside the image (it reports Chrome, ffmpeg and HyperFrames versions).
- **WS1-3 — Run the real-render suites.** In the built image (or on a runner with ffmpeg and the
  pinned Chrome), run the RenderWorker render suites and the local-worker driver suite with
  `VIDEO_STUDIO_RENDER_TESTS=1` and `VIDEO_STUDIO_RENDER_TESTS_REQUIRED=1`. Run the Docker driver
  suite against the image just built, with `VIDEO_STUDIO_DOCKER_TESTS=1`.
- **WS1-4 — Triggers.** Pull requests that touch `packages/AI/VideoStudio/**`, the RenderWorker
  `Dockerfile`, or a `pnpm-lock.yaml` change to any `@hyperframes/*` or `hyperframes` entry. Use a
  job-level change-detection step, as `test.yml` does, so the check always reports a status. Also run
  nightly against `next`.

### Acceptance

- The job fails when the golden composition is deliberately broken
  (`RenderWorker/src/__tests__/fixtures/golden/`).
- The job fails, rather than skips, when ffmpeg or Chrome is missing.
- The job logs the number of real-render tests executed, and that number is above zero.

---

## WS2 — Fix the three framework bugs and delete the workarounds

### What is true today

Video Studio carries code comments marked `INTERIM` for three bugs in shared agent code. The comments
cite "plan-notes 37/38/39", which are not in the repository.

| # | Bug | Where it lives | Issue | Video Studio workaround sites |
|---|---|---|---|---|
| A | A key containing `.` or `[` makes the whole change request be treated as path syntax, so data keys such as composition file names (`index.html` under `Output.Source`) are lost | `packages/AI/Agents/src/PayloadManager.ts`, `hasDottedKeys` (~line 1200) and its use in `ApplyAgentChangeRequest` (~line 1266) | **None found — file one** | `Engine/src/agents/video-studio-agent.ts` (~170, ~307: `_lastSubAgentPayload` and the `Output.Source` re-copy in `executeNextStep`); `Engine/src/agents/motion-engineer-agent.ts` (~136) |
| B | `CleanValidationSyntax` reads every reply key as validation syntax and strips everything from `:` on, so a format key such as `16:9` becomes `16` | `packages/MJGlobal/src/JSONValidator.ts`, `CleanValidationSyntax` (~line 526), called by `AIPromptRunner` whenever a prompt has an `OutputExample` | #4827 (open) | `RestoreStrippedFormatKeys` calls in `video-studio-agent.ts` (~374), `motion-engineer-agent.ts` (~148, ~151), `Core/src/validate-spec.ts` (~1558, ~1601) |
| C | The upstream payload merge drops empty arrays | `PayloadManager.mergeUpstreamPayload` | #6372 is related (emptied containers when an array shrinks); confirm whether it is the same root cause | `restoreDroppedEmptyArrays` in `video-studio-agent.ts` (~1443, 165 lines) and its caller (~376) |

### Tasks

- **WS2-0 — Make the comments point somewhere real.** Replace each "plan-notes NN" with the issue
  number. File the issue for bug A, and for bug C if #6372 turns out to be a different root cause.
  Comments only, no behavior change.
- **WS2-A / WS2-B / WS2-C — One PR per bug.** Each PR:
  1. Adds a failing regression test in the owning package (`@memberjunction/ai-agents` or
     `@memberjunction/global`) that reproduces the bug with a non-video payload.
  2. Fixes the bug in the framework.
  3. Deletes the Video Studio workaround for that bug in the same PR, so there is never a window where
     both the fix and the workaround apply.
  4. Keeps every existing Video Studio test passing. The tests that covered the workaround now cover
     the framework fix.
- **Design note for A and B.** Both bugs come from treating data keys as syntax. The fix should let a
  caller say "these are data keys", for example per payload path or per prompt, rather than special-
  casing `.` or `:`. #4827 already proposes an opt-out for B; agree the shape there first.

### Acceptance

- No `INTERIM` comment remains in `packages/AI/VideoStudio`.
- `restoreDroppedEmptyArrays`, `RestoreStrippedFormatKeys` and the `Output.Source` re-copy are gone.
- Unit tests in `@memberjunction/ai-agents`, `@memberjunction/global` and all three Video Studio
  packages pass, and the deterministic integration tier passes (these are shared code paths).

---

## WS3 — An independent review of the framework changes that rode in with Video Studio

### What is true today

PR #5055 also carried general agent-framework features, Consult (a sub-agent asks its parent a
question) and Handoff (Sage transfers a conversation to another agent):

- `packages/AI/Agents/src/base-agent.ts`: +1,227 / −205
- `packages/AI/Agents/src/AgentRunner.ts`: +550 / −9
- `packages/MJServer/src/resolvers/RunAIAgentResolver.ts`: +252 / −82
- New: `packages/AI/Agents/src/handoff-target.ts`, `packages/AI/Agents/src/sub-agent-consult.ts`,
  `packages/Angular/Generic/conversations/src/lib/utils/agent-handoff-map.ts`, the handoff card component
- Migrations `V202610301710__v6.2.x__Agent_Consult_Chat_Handling.sql` and
  `V202610301712__v6.2.x__AIAgentRunStep_StepType_Handoff.sql`

They are documented in `packages/AI/Agents/docs/sub-agents-guide.md`, `HUMAN_IN_THE_LOOP.md`,
`guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md` and `guides/CONVERSATIONS_UX_STACK_GUIDE.md`. What is
missing is an owner and a review by someone who was not building Video Studio.

### Tasks

- **WS3-1 — Name an owner** for Consult and Handoff as framework features.
- **WS3-2 — A focused review** of the files listed above, by someone outside the Video Studio work.
  Focus on what affects every agent: run termination, payload flow between parent and child, the
  preset precedence a handed-off agent runs under, permission checks on the handoff target, and hop
  limits.
- **WS3-3 — File each finding as an issue.** Fix them in their own PRs, not in this plan.

### Acceptance

- An owner is recorded in the Agents package README.
- The review is written up, and every finding has an issue.

---

## WS4 — Break up the orchestrator driver's long methods

### What is true today

`packages/AI/VideoStudio/Engine/src/agents/video-studio-agent.ts` is 1,937 lines. Against the repo's
30–40 line guideline:

| Method | Lines |
|---|---|
| `validateSuccessNextStep` | 198 |
| `validateSubAgentNextStep` | 182 |
| `restoreDroppedEmptyArrays` | 165 (deleted by WS2-C) |
| `intakeConversationAttachments` | 155 |
| `ApplyStageResult` | 105 |
| `seedBrandKit` | 104 |

Stage-name normalization exists twice: `resolveCanonicalStage` / `normalizeStageKey` in the driver and
`normalizeStageName` in `Engine/src/gates.ts`.

### Tasks

- **WS4-1 — After WS2.** Removing the workarounds shrinks the driver first, and refactoring it before
  then would refactor code that is about to be deleted.
- **WS4-2 — Split each long method** into named steps (for example, in `validateSubAgentNextStep`:
  reject parallel or terminating stage calls, evaluate gates, pause for approval, check prerequisites,
  validate before render). Behavior-preserving refactor commits only, separate from any behavior
  change.
- **WS4-3 — One stage-name normalizer**, exported from `gates.ts` and used by the driver.

### Acceptance

- No method in the driver over about 60 lines, unless a comment says why.
- All Engine tests pass unchanged (about 23k lines of tests are the safety net).

---

## WS5 — Investigate whether the orchestrator needs to be a full Loop agent

### What is true today

- The root `Video Studio` agent is a Loop agent with a custom driver. Its model chooses the next stage;
  the driver rejects any choice that is out of order or not yet allowed.
- The orchestrator prompt (`metadata/prompts/templates/video-studio/orchestrator.template.md`) fixes the
  stage order, and the repair route after the Critic is also fixed (Motion Engineer, then Render).
- So the root model's remaining decisions are: asking the caller when gate G1 has gaps, answering
  sub-agents' Consult questions, and deciding when to finish.

### Tasks

- **WS5-1 — Measure** from recorded agent runs, using production runs or IT152: root-model turns per
  production, how many of those the driver refused as retries, and the token cost of root turns.
- **WS5-2 — Compare** with a design where code sequences the stages and calls the model only to talk to
  the caller or answer a Consult (a code-led driver, or the Flow agent type).
- **WS5-3 — Write a decision record.** No code change unless the numbers justify it.

### Acceptance

- A short decision record in `plans/`, with the measurements.

---

## WS6 — Small items

- **WS6-1 — npm `latest` tag.** For packages first published in 6.2 (including
  `@memberjunction/video-studio`, `video-studio-core`, `video-studio-render-worker` and
  `ng-brand-kits`), `latest` points at the `0.0.0` placeholder created during publishing setup, so an
  install with no version gets an empty package. The release engineer should decide whether `latest`
  should follow `lts-6.2` for packages with no 6.1 history.
- **WS6-2 — Record what shipped.** The task list in `plans/video-studio.md` §15 has no done or not-done
  state. Mark each task against the code, so the shipped scope is on record.

---

## Order

1. **WS2-0** (comments and issues) and **WS1** start immediately. They are independent of each other.
2. **WS2-A, WS2-B, WS2-C**, one PR each, in any order. Each needs WS1 green first if it touches render
   paths.
3. **WS4**, after WS2.
4. **WS3** in parallel with everything; it is review work, not code.
5. **WS5** once real run data exists, from WS1's nightly runs plus any IT152 or production runs.
6. **WS6** at any time.

## Decisions needed

- **Is the WS1 render check required on PRs?** Suggestion: start non-required, and make it required
  after two weeks of stable nightly runs.
- **Does IT152 (real model plus real render) run on a schedule?** It spends model credits on every run.
- **Who owns Consult and Handoff?** (WS3-1)
- **What should the `latest` npm tag point at for packages new in 6.2?** (WS6-1)

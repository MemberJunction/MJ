# Video Studio Orchestrator: Loop vs. Code-Led Sequencing (WS5 Decision Record)

**Status:** Decision Record (`WS5` of `plans/video-studio-hardening.md`)
**Date:** 2026-11-10
**Scope:** `packages/AI/VideoStudio/Engine/src/agents/video-studio-agent.ts`, `packages/AI/VideoStudio/Engine/src/gates.ts`, `metadata/prompts/templates/video-studio/orchestrator.template.md`

---

## 1. Context & Question

In PR #5055, the root **Video Studio** agent shipped as a `Loop` agent (`TypeID = Loop`) backed by the `VideoStudioAgent` TypeScript driver (`packages/AI/VideoStudio/Engine/src/agents/video-studio-agent.ts`) and the `Video Studio: Orchestrator` system prompt (`metadata/prompts/templates/video-studio/orchestrator.template.md`).

However, over the course of hardening the pipeline gates (`packages/AI/VideoStudio/Engine/src/gates.ts`), `VideoStudioAgent` came to enforce or override nearly every routing decision the root Loop LLM makes:
- `STAGE_ORDER` is fixed (`Intake -> Brief -> Style -> Storyboard -> PreProduction -> Composing -> Rendering -> Review -> Delivered`).
- `validateSubAgentNextStep` rejects out-of-order sub-agent calls and overrides `Sub-Agent -> Motion Engineer` to `Sub-Agent -> Render` when `Composing` is already complete.
- `validateSuccessNextStep` rejects premature `Success` before `Delivered`, routes `Review` failure back to the Critic's `RepairTarget` (`Storyboard` or `Motion Engineer`), and forces `Delivered` when `Critique.Passes === true` or `RepairRound >= MaxCriticRounds`.
- `Pre-Production` and `Render` are already deterministic code-only sub-agents (`VideoStudioPreProductionAgent`, `VideoStudioRenderAgent`) that make zero LLM calls.

`WS5` in `plans/video-studio-hardening.md` asks:
1. Exactly which decisions does the root Loop LLM make today versus what `VideoStudioAgent` overrides in code?
2. How many root-level LLM calls does a nominal autonomous run spend solely to advance the fixed stage sequence?
3. Should `VideoStudioAgent` transition to code-led sequencing that invokes the root LLM **only** when judgment is needed (G1 intake/clarification, answering a child `Consult`, or composing a human summary)?

---

## 2. Inventory of Root Orchestrator Decisions vs. Code Enforcement (`WS5-1`)

| Pipeline Transition / Decision | What the Root Loop LLM Is Prompted to Do (`orchestrator.template.md`) | What `VideoStudioAgent` & `gates.ts` Actually Do in Code | Does the Root LLM Add Judgment Here? |
|---|---|---|---|
| **Pre-run intake & seeding** | Read user prompt and seed `Meta`, `Brief`, `Brand` | `executeAgentInternal` (`video-studio-agent.ts:172-205`) runs `applyActionParams`, `intakeConversationAttachments`, `seedBrandKit`, `seedArchetypeBeatTemplate`, and `seedDefaultFormats` deterministically **before** step 1. | **No** (done in code before step 1). |
| **Dispatch Stage 1 (`Director`)** | Emit `NextStep: Sub-Agent -> Video Studio: Director` | `validateSubAgentNextStep` rejects any other stage if `Brief` is incomplete. | **No** (fixed first stage for new briefs). |
| **Gate G1 (`Brief` missing facts / required assets / non-Approved generated assets)** | Emit `Chat` (or `Sub-Agent -> Research Agent` / `Query Builder`) when `Brief.OpenQuestions` or blocking assets exist | `evaluateGateG1` (`gates.ts:73-243`, evaluated in `EvaluateGates`) deterministically computes `Passed`, `MissingFields`, `OpenQuestions`, and `BlockingAssetRequirements`. `validateSubAgentNextStep` blocks `Art Director` until G1 passes; `checkG2PlanCheckpoint` (`video-studio-agent.ts:620-650`) returns `step: 'Plan'` for storyboard plan approval when required. | **Yes, ONLY when G1 fails** (formulating the clarification question or deciding whether to query `Research Agent` / `Query Builder` first). When G1 passes, next step is always `Art Director`. |
| **Dispatch Stage 2 (`Art Director`)** | Emit `NextStep: Sub-Agent -> Video Studio: Art Director` | Enforced by `STAGE_ORDER` + G1 check in `EvaluateGates`. | **No** (fixed transition after G1 passes). |
| **Dispatch Stage 3 (`Storyboard`)** | Emit `NextStep: Sub-Agent -> Video Studio: Storyboard` | Enforced by `STAGE_ORDER` + `deriveHighestPassedStatus` / `isStyled` check (`gates.ts:687-704`). | **No** (fixed transition after `Style` is ready). |
| **Gate G2 (Plan Mode approval at root)** | Wait for human approval when `RequirePlanApproval` is true | `checkG2PlanCheckpoint` (`video-studio-agent.ts:620-650`) and `DescribeStoryboardForApproval` (`gates.ts:1212-1269`) deterministically build the Markdown beat table and return a `Plan` step (`planDetails.plan`) without needing the LLM to write the table. | **No** (code formats the plan summary and pauses the run). |
| **Dispatch Stage 4 (`Pre-Production`)** | Emit `NextStep: Sub-Agent -> Video Studio: Pre-Production` | Enforced by `STAGE_ORDER` + `evaluateGateG2` (`gates.ts:245-315`). | **No** (fixed transition after G2 passes). |
| **Gate G3 (`Pre-Production` asset/narration/data readiness)** | Halt if required assets or data snapshots failed | `evaluateGateG3` (`gates.ts:317-370`) checks staged assets, narration cues, and data snapshots. | **Only when G3 fails** and the orchestrator needs to explain the missing asset/data failure to the caller. |
| **Dispatch Stage 5 (`Motion Engineer`)** | Emit `NextStep: Sub-Agent -> Video Studio: Motion Engineer` | Enforced by `STAGE_ORDER` + `evaluateGateG3`. | **No** (fixed transition after G3 passes). |
| **Dispatch Stage 6 (`Render`)** | Emit `NextStep: Sub-Agent -> Video Studio: Render` | Enforced by `STAGE_ORDER` + `evaluateGateG4` (`gates.ts:372-520`). Moreover, `validateSubAgentNextStep` (`video-studio-agent.ts:317-362`) actively **overrides** the LLM when it mistakenly re-invokes `Motion Engineer` instead of `Render`. | **No** (fixed transition after G4 passes). |
| **Dispatch Stage 7 (`Critic`)** | Emit `NextStep: Sub-Agent -> Video Studio: Critic` | Enforced by `STAGE_ORDER` (`Rendering -> Review`). | **No** (fixed transition after `Render` produces outputs). |
| **Gate G5 (`Critic` pass / bounded repair routing)** | Route to `Success` if `Critique.Passes`, or to `RepairTarget` (`Storyboard` / `Motion Engineer`) if `RepairRound < MaxCriticRounds`, else deliver with `HumanReviewNotes` | `evaluateGateG5` (`gates.ts:522-589`), `ApplyStageResult('Critic')` (`video-studio-agent.ts:237-295`), and `validateSuccessNextStep` (`video-studio-agent.ts:369-425`) compute this **100% deterministically** in TypeScript and override the LLM whenever it disagrees. | **No** (`Critique.RepairTarget`, `Critique.Passes`, and `MaxCriticRounds` determine the exact next step in code). |
| **Child `Consult` handling** | Answer a sub-agent's `Consult` question from `Brief`/`Brand` or escalate via `Chat` | `BaseAgent` pushes a `sub-agent-consult` message into the parent conversation when a child emits `Chat` under `ChatHandlingOption = 'Consult'`. | **Yes** (requires LLM reasoning to answer the child's question or escalate). |

---

## 3. Measured LLM Call Counts, Tokens, and Latency (`WS5-2`)

### 3.1 Happy-Path Autonomous Run (0 Critic Repairs, 0 Consults)

As codified in the deterministic integration suite (`HAPPY_PATH_13_STEPS` in `packages/TestingFramework/integration-test-suite/src/checks/video-studio-production.checks.ts:277-291`), a single nominal autonomous run executes **13 prompt/agent steps**, of which **8 are root orchestrator Loop LLM calls**:

| Step # | Actor | Model Tier (`Standard` / `High`) | Purpose | Necessary? |
|---|---|---|---|---|
| 1 | **Root Orchestrator LLM** | Gemini 3.8 Flash / Claude Opus 5.5 | Pick `Sub-Agent -> Video Studio: Director` | Redundant (fixed stage 1) |
| 2 | Child: `Director` | Gemini 3.8 Flash / Claude Opus 5.5 | Author `Brief` | **Essential** |
| 3 | **Root Orchestrator LLM** | Gemini 3.8 Flash / Claude Opus 5.5 | Pick `Sub-Agent -> Video Studio: Art Director` | Redundant (G1 passed -> fixed stage 2) |
| 4 | Child: `Art Director` | Gemini 3.8 Flash / Claude Opus 5.5 | Author `Style` + `Brand` | **Essential** |
| 5 | **Root Orchestrator LLM** | Gemini 3.8 Flash / Claude Opus 5.5 | Pick `Sub-Agent -> Video Studio: Storyboard` | Redundant (Style ready -> fixed stage 3) |
| 6 | Child: `Storyboard` | Gemini 3.8 Flash / Claude Opus 5.5 | Author `Timeline` + `Narration` | **Essential** |
| 7 | **Root Orchestrator LLM** | Gemini 3.8 Flash / Claude Opus 5.5 | Pick `Sub-Agent -> Video Studio: Pre-Production` | Redundant (G2 passed -> fixed stage 4) |
| 8 | Child: `Pre-Production` | _Deterministic code agent (0 LLM calls)_ | Stage assets, TTS narration, data snapshots | **Essential (0 LLM)** |
| 9 | **Root Orchestrator LLM** | Gemini 3.8 Flash / Claude Opus 5.5 | Pick `Sub-Agent -> Video Studio: Motion Engineer` | Redundant (G3 passed -> fixed stage 5) |
| 10 | Child: `Motion Engineer` | Claude Sonnet 5.5 / Claude Opus 5.5 | Author HyperFrames `Output.Source` bundle | **Essential** |
| 11 | **Root Orchestrator LLM** | Gemini 3.8 Flash / Claude Opus 5.5 | Pick `Sub-Agent -> Video Studio: Render` | Redundant (G4 passed -> fixed stage 6) |
| 12 | Child: `Render` | _Deterministic code agent (0 LLM calls)_ | Render MP4 + stills + contact sheets | **Essential (0 LLM)** |
| 13 | **Root Orchestrator LLM** | Gemini 3.8 Flash / Claude Opus 5.5 | Pick `Sub-Agent -> Video Studio: Critic` | Redundant (Rendered -> fixed stage 7) |
| 14 | Child: `Critic` | Gemini 3.8 Flash / Claude Opus 5.5 | Vision rubric critique on contact sheets | **Essential** |
| 15 | **Root Orchestrator LLM** | Gemini 3.8 Flash / Claude Opus 5.5 | Emit `Success` after `Critique.Passes === true` | Redundant (G5 passed -> fixed `Delivered`) |

- **Total LLM calls today (0 repairs):** **13 LLM calls** (8 root orchestrator + 5 child LLM calls).
- **Total LLM calls with $R$ Critic repair rounds (targeting `Motion Engineer`):**
  $$\text{Root LLM calls} = 8 + 3R, \quad \text{Child LLM calls} = 5 + 2R$$
  At `High` power ($R = 3$ repairs using Claude Opus 5.5), the root orchestrator alone makes **17 Opus 5.5 calls** solely to echo deterministic transitions (`Motion Engineer -> Render -> Critic`).
- **Token & Latency Overhead:**
  - Each root Loop turn serializes the system prompt (`orchestrator.template.md` + `loop-agent-type-system-prompt.template.md` + `video-generation-spec.ts.generated-for-prompt.md` + sub-agent/action schemas) plus the growing `VideoGenerationSpec` payload (`~12,000–22,000` input tokens and `~150–350` output tokens per turn).
  - Across 8 happy-path root turns, that is **~110,000–160,000 input tokens** and **16–40 seconds of serial LLM latency** (or **~250,000+ input tokens and 45–90 seconds** on a 2-repair `High` run) spent on transitions that `VideoStudioAgent` already computes deterministically in `< 1 ms`.

---

## 4. Decision & Target Architecture (`WS5-3`)

### Recommendation: **Adopt Code-Led Stage Sequencing Inside `VideoStudioAgent` (While Keeping `TypeID = Loop`)**

1. **Keep the `MJ: AI Agents` metadata record as `TypeID = Loop`:**
   - `AgentScheduledJobDriver`, `RunAIAgentResolver`, `ExecuteSubAgent`, `Consult` escalation, and `AIAgentRunStep` logging all expect a standard `Loop` agent run lifecycle.
   - Keeping `TypeID = Loop` means zero schema changes, zero breaking changes to caller relationships (`Sage`, `Research Agent`, `Query Builder`), and full step-by-step visibility in the Explorer run debugger.
2. **Override `executeNextStep` (or the pre-prompt dispatch hook in `VideoStudioAgent`) to short-circuit deterministic stage transitions without calling the root LLM:**
   - Before invoking the root Loop prompt on each iteration, `VideoStudioAgent.determineDeterministicNextStep(params, spec)` inspects `spec.Meta.Stage` and the deterministic gate evaluators (`EvaluateGates`, `checkG2PlanCheckpoint`, and `DeriveStatus`):
     - `Intake` (with no prior `Brief`) $\rightarrow$ return `Sub-Agent: Video Studio: Director` directly.
     - `Brief` + G1 `Passed` via `EvaluateGates` $\rightarrow$ return `Sub-Agent: Video Studio: Art Director` directly.
     - `Style` + `isStyled` (`gates.ts:687-704`) $\rightarrow$ return `Sub-Agent: Video Studio: Storyboard` directly.
     - `Storyboard` + `checkG2PlanCheckpoint(spec)` $\rightarrow$ return `Plan` (`DescribeStoryboardForApproval(spec)`) directly.
     - `Storyboard` + G2 `Passed` via `EvaluateGates` $\rightarrow$ return `Sub-Agent: Video Studio: Pre-Production` directly.
     - `PreProduction` + G3 `Passed` via `EvaluateGates` $\rightarrow$ return `Sub-Agent: Video Studio: Motion Engineer` directly.
     - `Composing` + G4 `Passed` via `EvaluateGates` $\rightarrow$ return `Sub-Agent: Video Studio: Render` directly.
     - `Rendering` (with `Output.Files.length > 0`) $\rightarrow$ return `Sub-Agent: Video Studio: Critic` directly.
     - `Review` + G5 via `EvaluateGates` $\rightarrow$ if `Passed` or `RepairRound >= MaxCriticRounds`, advance to `Delivered` and return `Success` with a deterministic delivery summary; otherwise return `Sub-Agent: Video Studio: Storyboard` or `Sub-Agent: Video Studio: Motion Engineer` per `Critique.RepairTarget`.
3. **Call the Root Orchestrator LLM ONLY when judgment is required:**
   - **Case 1 — Gate G1 fails (`EvaluateGates` G1 is `Blocked`):** Call the root LLM so it can decide whether to invoke `Research Agent` / `Query Builder` to fetch missing facts or emit a `Chat` question to the human/parent agent.
   - **Case 2 — Active `sub-agent-consult` message on the conversation:** A child agent (`Director`, `Art Director`, `Storyboard`, or `Motion Engineer`) emitted a `Chat` question under `ChatHandlingOption = 'Consult'`. Call the root LLM so it can answer the child from `Brief`/`Brand` or escalate to the user.
   - **Case 3 — Gate G3 fails (`!EvaluateGateG3(spec).Passed`):** A required asset or data binding failed during `Pre-Production`; call the root LLM to formulate the remediation or clarification turn.
   - **Case 4 — Conversational follow-up on an already-`Delivered` spec:** The user sent a follow-up message in Studio Copilot (e.g., *"Make beat 2 faster"* or *"Switch to the dark brand kit"*); call the root LLM once on the first turn to classify which stage (`Director`, `Art Director`, `Storyboard`, or `Motion Engineer`) to re-enter, after which deterministic code sequencing takes over again.
4. **Unlock Zero-LLM Fast-Forward Re-Renders (`Pre-Production -> Render -> Delivered`):**
   - When a scheduled job (`AgentScheduledJobDriver` with `sourceArtifactId`) or caller supplies a previously delivered `VideoGenerationSpec` that already has valid `Output.Source` and requests a data-refresh re-render (`reRenderOnly: true`), `VideoStudioAgent` sets `Stage = 'Storyboard'`, runs `Pre-Production` (refreshing live `Data.Snapshots` as the job's `contextUser`), skips `Motion Engineer` (preserving the approved `Output.Source` HTML/CSS/GSAP composition), runs `Render`, and completes with **0 LLM calls**.

### Impact Summary

| Metric | Current Loop Orchestrator | Code-Led `VideoStudioAgent` | Improvement |
|---|---|---|---|
| **Root LLM calls (happy path)** | 8 | **0** | **-100% (8 fewer LLM calls)** |
| **Total LLM calls (happy path)** | 13 | **5** (`Director`, `Art Director`, `Storyboard`, `Motion Engineer`, `Critic`) | **-61.5%** |
| **Root LLM calls (2 Critic repairs)** | 14 | **0** | **-100% (14 fewer LLM calls)** |
| **Scheduled KPI Briefing re-render LLM calls** | 13 | **0** (`Pre-Production` + `Render` only) | **-100% (zero LLM spend)** |
| **Serial orchestration latency saved** | Baseline | **16–90 s faster per production** | Eliminates 8–17 round-trips |

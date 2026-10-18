# Idea 1: Execution Blast-Radius Containment Layer

**Week of 2026-09-19 · Creative exploration · Framework-level (core, not a vertical app)**

> **Status (Implemented in PR #4612):** Core byte-ceiling containment (`PayloadSizeGuard`, `BaseAgent` per-run and tree-wide payload byte guardrails, and `MJAPI` `--max-old-space-size=8192`) is implemented and tested. Questionable parts (`worker_threads` execution isolation and lowering `DEFAULT_ABSOLUTE_MAX_ITERATIONS` below `5000`) were stripped out.

## The problem, framed for the world, not the codebase

Picture a two-person nonprofit IT shop the week before its annual gala: renewal reminders are
going out, the donor portal is open for online gifts, and a program officer — trying to be
helpful — asks an AI agent to "clean up stale event registrations." The agent has no iteration
cap, no cost cap, no token cap, because nobody told them those fields existed or that leaving them
blank meant "unlimited." The agent gets stuck re-planning against a condition it can never satisfy,
grows its own conversation history every turn, and a few minutes later the entire server falls
over — not just that one automation, *everyone's* session, mid-gala, mid-donation.

This happened on a development instance (**#4539**): one agent run with no caps recorded 106
consecutive "Execute Agent Prompt" steps, grew its serialized payload until V8 could not allocate a
string, and `SIGABRT`'d the whole MJAPI process — dropping every other user's session and orphaning
every concurrent run.

## What already exists (and why this doesn't duplicate it)

- **Per-run guards exist but were previously measured only in turns, tokens, and dollars.**
  `AIAgent.MaxCostPerRun`, `MaxTokensPerRun`, and `MaxIterationsPerRun` are checked in
  `base-agent.ts`, with `BaseAgent.DEFAULT_ABSOLUTE_MAX_ITERATIONS = 5000` (`base-agent.ts`) as an
  absolute turn-count safety net. The incident in #4539 died at iteration 106 because its currency
  was serialized payload bytes, not turn count.
- **`packages/MJAPI` previously inherited the V8 default heap** with no `--max-old-space-size` set
  in its start script, while `packages/MJExplorer` set `16384`.
- **Distinct from the Resource Governance Engine and Tenant Isolation Guarantee**: those govern
  billing/token budgets across windows and tenant data boundaries; this governs per-execution
  memory blast radius inside a live agent run.

## Implemented Architecture (PR #4612)

### 1. `PayloadSizeGuard` (`@memberjunction/ai-agents`)

- Added [`PayloadSizeGuard`](../../../packages/AI/Agents/src/payload-size-guard.ts) with:
  - `DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024` (16 MiB) absolute safety ceiling.
  - `MeasurePayloadBytes(payload)`: fast, non-throwing UTF-8 byte measurement (`Buffer.byteLength`
    on `JSON.stringify`, with a cycle-safe weak-set fallback for circular object references).
  - `Evaluate(payload, maxPayloadBytes?)`: returns `{ Exceeded, PayloadBytes, LimitBytes, Reason }`
    with human-readable `FormatBytes` diagnostics.
- Wired into `BaseAgent`:
  - `BaseAgent.DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES` (16 MiB) enforced in both
    `checkExecutionGuardrails` (pre-step) and `hasExceededAgentRunGuardrails` (in-loop).
  - Optional per-run override via `ExecuteAgentParams.maxPayloadBytes`.
  - Cross-sub-agent tree enforcement via `ExecuteAgentParams.maxTreePayloadBytes` and
    `AgentTreeBudget.peakPayloadBytes` in `ensureTreeBudget` / `checkTreeBudgetLimit`.

### 2. Intentional MJAPI Heap Ceiling (`packages/MJAPI`)

- Updated `packages/MJAPI/package.json` `start` script to include
  `--max-old-space-size=8192`, matching explicit heap configuration practices across the workspace.

## Stripped-Out / Descoped Items (and Why)

1. **`worker_threads` Bulkhead Isolation (Original Phase 3 — Stripped Out):**
   MemberJunction's server runtime relies deeply on in-process singletons (`BaseSingleton` backed by
   `GetGlobalObjectStore()`), `Metadata.Provider`, `UserInfoEngine`, `EncryptionEngine`, and pooled
   SQL Server data providers. Moving individual agent runs into `worker_threads` would require either
   re-bootstrapping the full metadata cache per worker (multiplying memory pressure) or serializing
   every `RunView`/`BaseEntity` call across `MessagePort` (introducing the exact large-payload
   serialization overhead this guard prevents). In-process byte-ceiling enforcement via
   `PayloadSizeGuard` stops runaway payload growth cleanly as a normal `AIAgentRun` failure without
   architectural friction.
2. **Lowering `DEFAULT_ABSOLUTE_MAX_ITERATIONS` to 10–25 (Stripped Out):**
   Legitimate deep-research, code-analysis, and multi-step loop/flow orchestration agents routinely
   execute more than 25 iterations with small payloads. Lowering the global turn-count safety net
   would break valid workloads and existing test contracts, whereas bounding payload bytes directly
   targets the OOM vector in #4539.

## Mockup

See [`mockups/execution-guardrails-dashboard.html`](./mockups/execution-guardrails-dashboard.html)
and [`screenshots/idea-1-execution-guardrails-dashboard.png`](./screenshots/idea-1-execution-guardrails-dashboard.png).

## Sources

- MemberJunction repo issue **#4539** ("A single runaway agent run can exhaust the Node heap and
  abort the whole MJAPI process").
- `packages/AI/Agents/src/payload-size-guard.ts`, `packages/AI/Agents/src/base-agent.ts`, and
  `packages/AI/CorePlus/src/agent-types.ts`.

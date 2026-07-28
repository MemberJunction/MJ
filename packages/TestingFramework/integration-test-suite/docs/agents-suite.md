# Extended Agents Integration Suite

The live-model agent bundles: deterministic **correctness** testing of the agent framework's advanced behaviors — long-conversation compaction, tool-result carry-forward, artifact interrogation, sub-agent payload guards, skills, plan mode, memory-write guards, and RAG/search — plus the fire-and-forget wire path and structural coverage of the shipped agents (Sage, Query Builder, Research Agent).

The suite asserts **framework observables only** (run/step/request/note rows, `AIPromptRun.Messages`, cost/token stamping, step provenance) — never the model's prose. It does **not** do LLM-as-judge / output-quality evaluation.

## How it runs

- **Tier:** live-model. Joined to the **"Integration Tests — Live Model"** suite; ON by default (`RUN_AGENT_TESTS=0` opts out). CI opts out (no credentials); local/nightly runs exercise it.
- **Models:** the test agents are pinned via `MJ: AI Prompt Models` bindings to cheap/fast real models (Gemini Flash-Lite / OpenAI nano / Cerebras) with **multi-vendor fallback chains** — real token spend, well under $1 per full run.
- **Transport:** server-in-process (`AgentRunner.RunAgent`) for the correlation-heavy bundles — a synchronous run handle is needed to read back run/step/request rows. The one exception is `agent-wire-callback`, which runs over the **actual GraphQL wire** to exercise the fire-and-forget WebSocket completion callback + `onProgress` streaming.
- **Fixtures:** purpose-built IT-prefixed agents/prompts/skills seeded in `metadata-optional/integration-test/ai*` (14 agents, 42 model bindings) — never in the base system. Run products (conversations, runs, steps, notes, artifacts) are marker-isolated and FK-order-deleted in teardown.
- **Reliability:** live models vary run-to-run. Each check that depends on the model taking a specific action wraps a **two-phase bounded retry** (≤3 attempts) and then fails loudly with `model-noncompliance:` — never a vacuous skip. Some structured-output-heavy checks (e.g. "emit exactly six memory writes") carry inherent variance on cheap models; that is a known live-tier characteristic, surfaced honestly rather than hidden.

## Determinism strategy

The agent loop, payload manager, skill/plan gates, compaction manager, and memory-write manager are all deterministic code — the only entropy is the model. So every assertion targets what the framework *did* with the model's output, observable in persisted rows:

- **`AIAgentRun`** — Status settled, `PlanMode`, `ConversationID`, `TotalTokensUsed`.
- **`AIAgentRunStep`** — StepType and ordering, `TargetLogID` linkage, `Skills` provenance, `OutputData` (payload-change violations, memory-write dispositions, tool results).
- **`MJ: AI Agent Requests`** — plan-mode pause/approve/reject rows.
- **`AIPromptRun.Messages`** — what each turn actually received (carry-forward reference, RAG injection, skill instructions).
- **`MJ: AI Agent Notes`** — memory-write provenance/status/TTL.

Two techniques recur: **fabricate-then-observe** (hand-create prior persisted state, then spend one live turn observing the framework's reaction — e.g. carry-forward, compaction) and **positive-attempt controls** (a guard check must prove the agent *tried* the blocked action, so "nothing blocked" can't pass when nothing was attempted).

## The bundles

| IT | Bundle | Checks | What it proves |
|---|---|---|---|
| IT53 | `agent-loop-live` | AL1–AL7 | Loop foundation: terminal runs with every step finalized, `Prompt→Actions→Prompt` lineage + `TargetLogID` linkage, action results carried into later prompts, cost-rollup identity (`TotalTokensUsed = Σ child prompt tokens`), conversation linkage, and the multi-vendor **failover ladder** (no-model fails loudly; primary-down completes on the secondary). |
| IT54 | `shipped-agents-live` | SA1–SA4 | The real shipped agents as standard members: Sage terminal, Query Builder sub-agent lineage, Research Agent tree termination, conversation plumbing. Smoke-depth structural — catches wiring rot in production agents. |
| IT55 | `agent-carry-forward` | CF1–CF6 | Tool-result carry-forward (fabricate-then-observe): exactly one injected carry-forward message with the reuse header + compacted result (not a full re-dump, not nothing), size cap with `omitted for size`, render stability, and no-leak across agents/conversations, failed runs, and ineligible tool families. |
| IT56 | `agent-payload-guards` | PG1–PG9 | Sub-agent payload scoping (previously zero coverage): downstream strip, upstream merge block + violation logging, per-op suffix enforcement, empty-upstream all-grant, scope slice/reverse, the one fail-**closed** missing-scope guard, self-write default, failed-sub-agent no-merge, malformed-paths fail-open. Every guard has a positive-attempt control. |
| IT57 | `agent-artifact-tools` | AT1–AT9 | Artifact interrogation across types, extractions asserted against a checked-in MANIFEST: CSV rows, JSON path/keys, PDF pages/search/metadata, Markdown grep, XML grep-fallback, PNG binary sha, malformed-artifact structured error, and the >50k externalization boundary. |
| IT58 | `agent-skills-live` | SL1–SL5 | Skills over the live loop: requested activation with `Skills` provenance, unentitled dropped, hallucinated not activated, un-requested `RequestedOnly` gated (the runtime half of the double gate), and activation Instructions applied to the assembled prompt. |
| IT59 | `agent-plan-mode` | PM1–PM6 | Plan-mode HITL via the entity-driven resume: plan step + `Requested` row + pause, no work before approval, approve resumes + executes, reject re-plans, and `RequirePlanMode` is not bypassable. |
| IT60 | `agent-compaction-e2e` | CE1, CE2, CE9 | Compaction beyond the assembly-layer bundle: deterministic budget-knob precedence (CE1, no LLM), live over-trigger fires + persists a boundary summary + folds the next window (CE2), and the under-trigger negative control (CE9). |
| IT61 | `agent-memory-guards` | MG1–MG5 | The 6-stage `memoryWrites` guard pipeline: disallowed-type rejection, per-run cap, scope-clamp never-broadens, same-run idempotency, and provenance + `Provisional` + TTL — each observable in the `Memory Write` tool-step disposition. |
| IT62 | `agent-rag-search` | RS1–RS7 | RAG + search for agents: deterministic scoped `SearchEngine` fan-out/fusion, scope exclusion, cross-user no-leak, and the min-term guard (RS1–3/7, LLM-free), plus live scoped-search action and pre-execution RAG injection (RS4/RS6). |
| IT63 | `agent-wire-callback` | WC1–WC2 | The over-the-wire fire-and-forget path: `RunAIAgent` resolves via the WebSocket completion callback with a settled run (WC1), and `onProgress` delivers ≥1 streaming event (WC2). The rest of the family runs in-process; this pins the browser/headless-WS follow-up path. |

**Totals: 11 bundles, 62 checks** (49 live-model + 13 deterministic/fabricated-leaning legs).

## The test-agent roster

Seeded in `metadata-optional/integration-test/ai-agents/` (all `IT:`-prefixed, `Type=Loop`, `Status=Active`, category `IT: Integration Test`), each with an imperative single-action prompt (`metadata-optional/integration-test/ai-prompts/templates/it-*.template.md`) and multi-vendor model bindings:

`IT: Echo Agent` · `IT: Tool Loop Agent` · `IT: Failover Agent` · `IT: Payload Parent` · `IT: Payload Child` · `IT: Payload Scoped Child` · `IT: Self-Write Restricted` · `IT: Skill Probe Agent` · `IT: Plan Agent` · `IT: Always-Plan Agent` · `IT: Compaction Agent` · `IT: Memory Writer` · `IT: Search Agent` · `IT: Artifact Reader`.

Artifact test assets (with an expected-value `MANIFEST.json`) live in `metadata-optional/integration-test/assets/`: `sample.{json,csv,xml,md,pdf,png,bin}`.

## Adding to this suite

Same rules as any bundle (see [README](README.md)): a `*.checks.ts` file registering on `IntegrationCheckRegistry`, exported from `src/index.ts`, with an `.IT##-*.json` sibling joined to **"Integration Tests — Live Model"** (not the deterministic suite) and a count-table entry in `check-registry.test.ts`. New test agents/prompts go under `metadata-optional/integration-test/ai*` and must be `IT:`-prefixed and self-contained. Assertions stay structural; model prose is never asserted.

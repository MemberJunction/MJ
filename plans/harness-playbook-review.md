# The Harness Playbook (Stencil) — Lessons for the MJ Agent Framework

## Technical Architecture Review & Recommendations

**Version**: 1.0
**Date**: September 2026
**Status**: Proposed — for review and prioritization
**Owner**: AI Agents subsystem
**Source**: ["The Harness Playbook"](https://stencil.so/blog/harness-playbook), Can Bölük (author of omp/omp²), 2026-09-02
**Companion**: the OpenClaw 2.0 review ([PR #4155](https://github.com/MemberJunction/MJ/pull/4155), `plans/openclaw-2-agent-architecture-review.md`) — cross-referenced below where the two sources independently converge on the same recommendation.

---

## Executive Summary

The Harness Playbook is a postmortem-plus-rewrite-design from the author of **omp**, one of the most-used open-source coding harnesses (omp² is the ground-up rewrite; OpenCode, Pi, and OpenClaw are named as concurrently rewriting for the same reasons). Its thesis: **"an agent harness is systems software — not a while loop around a fetch"**, and the recurring design move is Ousterhout's *push the hard invariant down into the layer that can enforce it* — never make every tool author, extension author, or coding agent re-implement 30% of it slightly differently.

It is organized as 12 lessons: the design envelope, journaled state, the runtime/sandbox boundary, tool execution as a bounded cancellable stream, declarative settings ("convars"), a composable loop-control primitive ("Directors"), model compatibility as structured knowledge, scheduled (speculative) compaction, the permanent-tool-roster tax, rendering, and language choice.

**Where MJ stands.** MJ already embodies several of the playbook's conclusions — often more completely than the harness world does: compatibility as data (`MJ: AI Models` / `AI Model Vendors` capability columns vs. their 880-line if-chains), per-step relational journaling (`AIAgentRunStep.PayloadAtStart/AtEnd` vs. Pi's closures), server-side pipelines that keep intermediate results out of context, artifact tools that let the model query large outputs instead of swallowing them, and a metadata-first extension model. The playbook is independent confirmation that those were the right calls.

**Where it teaches us something.** Six mechanisms are directly adoptable, and one is a deep refactor direction for `base-agent.ts`:

1. A **journal-derivability contract** for agent state, and the rewind/resume capability it unlocks (Lesson 2).
2. A **Director/yield-gate primitive** replacing the accreted cross-turn special cases in the loop (Lesson 6).
3. **Bound output once; bound blocking time once** — central result budgets with artifact spillover, and a uniform background-job primitive (Lesson 4).
4. **Corrective inference hardening** — repetition-loop detection, leaked-envelope recovery, charitable parameter repair (Lesson 7). The malformed-JSON leg of this just landed independently in [PR #4137](https://github.com/MemberJunction/MJ/pull/4137) (deterministic lexical escaping repair), which also sets the design bar for the remaining legs.
5. **`intent` and version on every tool invocation** as protocol data (Lesson 9).
6. **AutoQA** — a structured bug-report path *for agents* about the tools they use (Lesson 9).
7. A **declarative setting-resolution registry** to replace MJ's N hand-rolled precedence chains (Lesson 5).

The playbook also supplies hard numbers for a recommendation the OpenClaw review already made: cutting a 23-tool permanent roster to 5 essential tools took the same task from **86.2s to 36.6s median wall-clock** (25.1k → 15.1k prompt-prefix tokens) — tool grammar taxes every turn.

---

## What we are NOT importing

- **The XML session DOM as a substrate.** omp² materializes the whole session as one XML tree because Pi had no journaled state at all. MJ's substrate is relational rows with Record Changes — the same "one authority" property with better queryability. The lesson to take is the *contract* (state derivable from the journal), not the representation.
- **The in-process Bash interpreter, TUI rendering stack, TLA+-verified scrollback protocol.** Terminal-specific; MJ's surfaces are Angular over journaled rows, which already gives "views are projections."
- **Rust core / Python extensions re-platforming.** The transferable kernel of Lesson 11 — *a language that permits twenty equally normal local styles asks the model to make twenty decisions before the product problem* — is exactly what MJ's `.claude/rules/`, naming conventions, and CI gates exist to do for TypeScript. Keep investing there; don't change stacks.

---

## Tier 1 — Adopt

### H1. The journal-derivability contract (and what it unlocks)

**Impact: High (correctness) · Effort: Medium · Touches**: `packages/AI/Agents` docs + `base-agent.ts`, DriverClass authoring guidance, integration tests

**The lesson (L2).** *"If authoritative state cannot be derived from the journal, rewind, fork, and resume are lies."* Pi journals only the message tree; todo state, retry counters, subagent registries, and mode flags live in extension closures. The result, measured: of Pi's 78 official extension examples, 17 were stateful and **only two were correct** under rewind/fork/resume — checkpoints cleared before `/fork` could use them, turn counters that count 1→3→4 after a rewind, plan-mode restrictions that survive rewind, a tic-tac-toe move that vanishes on crash-resume. Their fix: make non-replayable state unrepresentable — "correctness comes from that constraint, not from every extension author remembering to register two hooks."

**MJ today.** Materially better than Pi: payload state is journaled per step (`AIAgentRunStep.PayloadAtStart/PayloadAtEnd`), agent-type state persists in `AIAgentRun.AgentState`, resume exists (`AwaitingFeedback` → `ResumingAgentRunID`, `lastRunId` + `autoPopulateLastRunPayload`). But the contract is implicit, and the same failure mode is open to us: a custom `DriverClass` (subclass of `BaseAgent`) or custom `BaseAgentType` can hold cross-step state in instance fields, module-level maps, or closures — which dies with the process and silently diverges from what the journal says. Nothing states the rule, and nothing tests it.

**Proposed.**
1. State the contract in `packages/AI/Agents` docs and the create-agent scaffolds: *all state that must survive a step boundary lives in the payload, `AgentState`, or a run-step row — never in instance/module state.* Framework-owned counters that currently live only in memory (execution counts, preemption counters, plan-mode flags) move into `AgentState` so a resumed run restores them.
2. Add a **kill-and-resume integration bundle**: start a multi-step run, hard-stop the process mid-run, resume, assert the loop's guardrail counters, plan-mode state, and payload match the journal. (The watchdog already handles *detecting* the orphan; this tests *restoring* it.)
3. Exploit what MJ already journals: because payload before/after is stored per step, **rewind-to-step and fork-from-step are computable as a payload diff** — the playbook's "rewind is a DOM diff" with rows instead of DOM. The Flow debugger's step/breakpoint work is the natural UI home. This is the cheapest path to a genuinely differentiating capability: time-travel over governed agent runs, with Record Changes as the audit trail.

### H2. A Director primitive — name the loop-owning abstraction

**Impact: High (architecture) · Effort: High · Touches**: `base-agent.ts`, `LoopAgentType`, `AgentState`, run-step visualization

**The lesson (L6).** Everything that wants to keep control across turns — plan mode, goal mode, "force a tool next turn," a todo reminder that objects before yield — is a **Director**: one composable stack that owns the candidate yield. `prepare_inference` walks the stack outside-in (each behavior may refine the request); `on_yield` walks inside-out; each Director answers `Pass / Continue / Yield / Push / Done / Fail`. The stack itself lives in journaled state, so rewind removes Directors, resume restores them, and an inspector can see *which behavior currently owns the yield*. Without this primitive, independently written behaviors cannot compose — Pi's most popular Plan and Goal plugins ship a private mutex protocol that only works within one author's plugin suite, and omp v1 restated `if (goalMode || vibeMode)` checks by hand at seven entry points.

**MJ today.** `base-agent.ts` (14,775 lines) has accreted exactly this class of special case, each with private flags and its own branch:
- Plan Mode: `_planModeActive`/`_planApproved` checked inside `validateNextStep` to block `Actions`/`Sub-Agent`.
- Read-tool yield pre-emption: `buildReadToolPreemptionStep` + `MAX_CONSECUTIVE_READ_TOOL_PREEMPTIONS`.
- Minimum executions: `checkMinimumExecutionRequirements` before allowing `Success`.
- Final payload validation: `FinalPayloadValidationMaxRetries` retry loop.
- Unproductive-retry and failed-step counters; `HandleStepFallback` re-prompting.

Each works; none compose; every new cross-turn behavior grows the file and cannot be added by a downstream app without subclassing the world.

**Proposed.** Introduce a `Director` (or "yield gate") contract at the `BaseAgentType` layer: a stack persisted in `AgentState`, consulted at two seams — request preparation and candidate terminal step — with the playbook's six verdicts. Migrate the five behaviors above onto it one at a time (Plan Mode first; it is already a clean state machine), each migration shrinking `validateNextStep`. Then expose it: a metadata-declared director list per agent/agent type (`MJ: AI Agent Directors`?) makes "verify-before-yield," "todo reminder," and "goal until done" behaviors that Open Apps can ship **without forking BaseAgent** — the same move that made agent types pluggable. Each director push/pop is a run step, so the run monitor shows who owns the yield. This is the single highest-leverage refactor direction in this document; it is also the largest.

### H3. Bound output once, bound blocking time once — and one job primitive

**Impact: High (reliability + cost) · Effort: Medium · Touches**: `ExecuteSingleAction`/`formatActionResultsAsMarkdown`, sub-agent fan-out, TaskGraph, a new jobs surface

**The lesson (L4).** *"Tool execution is a bounded, cancellable stream of state — not an async function that returns text."* Three parts:
- **Bound output once.** A tool that can return 1 MB to the model verbatim "is too low-level a primitive to expose." Truncation must be central and opt-out (`notrunc`), not a helper each author may know about — an opt-in helper guarantees uneven coverage and N+1 stacked truncation layers under composition. Full output spills to an artifact the model can read back.
- **Bound blocking time once.** Backgrounding belongs to the library layer: an unexpectedly long call otherwise leaves "the agent unable to notice and adjust, the user returning to a stuck session, autonomous jobs waiting forever, and the provider's KV cache expiring before the call returns."
- **One stdio-shaped job.** A backgrounded shell, a subagent, a daemon, a remote function, and an ordinary call that ran past its budget are all the same object — signal + stream in + stream out + status. One primitive, one budget enforcement point, one artifact spill path, one inspect/message/kill surface. (Claude Code's own Bash-background vs. Task tools duplicating spawn/poll/kill/list is their evidence.)
- **Cancellation requires a kill boundary.** `AbortSignal` is a protocol, not an enforcement: forget to pass it, call a dependency that ignores it, or run synchronous work, and "a timeout only tells the agent to continue; the work keeps burning resources."

**MJ today.** Pieces exist and are good: `interceptLargeBinaryContent` (binaries → media refs), context-crush on large values, per-grant `ResultExpirationTurns`/`CompactMode`, artifact tools for querying large artifacts, Pipelines keeping intermediate results out of context, `isolated-vm` worker pool with a real kill boundary for generated code. What's missing is the *centralization*: no framework-level per-result size budget with automatic artifact spillover (an action author can still return 1 MB of text); no blocking-time budget that converts an overtime action into a background handle; and background-ish work is fragmented across sub-agent fan-out (awaited in-step), TaskGraph (submit-and-detach), scheduled jobs, and client-tool requests — with no uniform way for an *agent* to list, check, or cancel its own long-running work. Action code runs in-process, so cancellation of a misbehaving action is cooperative only.

**Proposed.**
1. Central result budget in `ExecuteSingleAction`/result formatting: over N bytes/tokens → persist full output as an artifact, inject head/tail + a standard notice + the artifact reference (the artifact-tool read-back loop already exists). Per-action `notrunc` opt-out in `MJ: AI Agent Actions` for the rare capability that needs it.
2. Blocking budget: per-action/sub-agent `MaxBlockingSeconds`; on breach, the call converts to a **job** and the step settles with a handle instead of hanging the turn.
3. A uniform job surface (`MJ: AI Agent Jobs` view or API over sub-agent runs, task-graph tasks, overtime actions): list / peek output / signal-cancel — one tool exposure instead of per-mechanism plumbing.
4. For AI-authored action code, prefer execution inside the CodeExecution worker pool so the kill boundary is real (hand-written platform actions stay in-process by design).

### H4. Corrective inference hardening

**Impact: Medium-high (cost + reliability) · Effort: Low-Medium · Touches**: `AIPromptRunner`, `LoopAgentType` parsing, action param conversion

**The lesson (L7).** "A provider adapter is not complete when it can open a stream. It is complete when the rest of the harness receives one canonical turn despite malformed JSON, repetition, leaked reasoning, or a model-specific tool-call dialect." Concretely: (a) repair malformed JSON; (b) **detect repetition loops** (named offenders: Gemini, DeepSeek) instead of paying for degenerate output to the token limit; (c) parse leaked tool-call/think dialects out of prose and synthesize canonical blocks. And on arguments: models are not generic API clients — "be strict about the tool's semantic contract, but charitable about the model's dialect": repair `paths: "a,b"` into a list when unambiguous; otherwise return a **structured, retryable error**.

**MJ today — and a fresh landing.** The malformed-JSON leg of this recommendation was substantially delivered while this document was being written: [PR #4137](https://github.com/MemberJunction/MJ/pull/4137) (jordanfanapour, merged to `next` 2026-09-01) added **deterministic, error-driven lexical escaping repair** — `RepairJSONEscaping()` in `@memberjunction/global` walks back from the real parse-failure offset, escapes one character per pass, re-parses after each, only ever *adds* escapes, gives up rather than guessing on truncation, and records every offset it changed (`_jsonRepairInfo.LexicalEscaping`). It also fixed `CleanJSON`'s interior-fence extraction (a fence *inside* a JSON string value no longer destroys the envelope and replaces the true parse error with a phantom one) and made `resolveTrueParseError()` derive the error from the raw output, so the AI repair stage — now the last resort after CleanJSON → lexical → JSON5 — reasons from the actual defect. Validated against 16 real failing production payloads (16/16 recovered in 12ms total; a run that previously burned 10 retries / 79K tokens / ~4 minutes) and 34 valid payloads with zero false positives. That PR is the design bar for the remaining legs: **deterministic before model-based, error-driven not pattern-matched, validated by a real re-parse, refuses to guess, auditable** — note that its "a rising repair count signals model output is drifting and a prompt needs attention" is exactly the H6/AutoQA evaluation-loop instinct.

Still open after #4137: repetition-loop detection on streamed output (a degenerate run today burns tokens until a limit trips); envelope recovery at the agent-type layer (`CleanJSON` now extracts fence-wrapped and prose-buried JSON correctly, but a decision that parses yet mismatches the expected shape still costs a full `Retry` turn); and typed coercion of LLM-supplied action params (`Record<string, unknown>` is converted to `ActionParam[]` and handed to the action — dialect mistakes surface as action-level errors rather than a uniform repair-or-retryable-error at the boundary).

**Proposed.** (1) A streaming repetition detector in `AIPromptRunner` (n-gram/window heuristic) that aborts and treats the attempt as a failover-classified error; (2) shape-aware envelope recovery in `LoopAgentType` before spending a `Retry` — locate the outermost JSON object matching the decision shape inside prose; (3) framework-level param validation/coercion against the action's declared param types, with unambiguous repairs applied and a structured retryable message otherwise — built to #4137's constraints (deterministic, re-validated, add-only where possible, offsets/changes recorded). All three reduce paid retry turns.

### H5. `intent` and version as tool-call protocol data

**Impact: Medium (observability) · Effort: Low · Touches**: `LoopAgentResponse` action/sub-agent shapes, `AIAgentRunStep`, Action entity + execution logs

**The lesson (L9).** Every omp² tool takes an `i` (intent) argument — it streams early, so the UI can show *what the model thinks it is doing* before the call completes, and the journal gets a readable summary "without every tool inventing `reason`/`purpose`." And: *"People should version their tools"* — traces are only evaluable over time if each call records which contract produced it. "Name, version, intent, input, output, diagnostics, and usage are protocol data."

**MJ today.** `LoopAgentResponse` carries decision-level `reasoning`, but individual action invocations in a multi-action step carry only params; the run monitor and Slack progress updates name the action, not the intent. Action rows evolve (code, params) with no contract-version stamp in `ActionExecutionLog`/run steps, so evaluating an action's success rate across its own history means guessing which version produced each call.

**Proposed.** Add an optional per-invocation `intent` field to the action/sub-agent envelope shapes (journaled into the step's `InputData`, surfaced in progress streaming and the run timeline); stamp the action's version identifier (or `__mj_UpdatedAt` at minimum) into execution logs and step data. Two small changes that make the existing relational trace store far more useful for the evaluation loop H6 and PR #4155's R4 feed on.

### H6. AutoQA — a bug-report path for agents

**Impact: High (product feedback) · Effort: Low-Medium · Touches**: new entity + one built-in tool + a dashboard widget

**The lesson (L9).** omp added a tool that lets *agents* file structured feedback about the tools they use — what confused them, what behaved erroneously, what they liked — "the equivalent of a user bug-report path, but for agents." It is noisy (models misattribute), "but once obvious misattributions are filtered, it reveals which operation confuses models, which projection hides needed data, and which repair belongs in the harness." Anthropic later added an equivalent to Claude Code. AutoQA closes the loop between tool design and deployed behavior.

**MJ today.** MJ has rich *implicit* signal (result codes, failed steps, retry counters) but no explicit channel: an agent that finds an action's description misleading, a result format confusing, or a prompt contradictory has nowhere to say so — the signal dies in a retry loop or an `AIAgentRunStep` error nobody aggregates by cause.

**Proposed.** An `MJ: AI Agent Feedback` entity (agent, run, step, target type/ID — action, prompt, sub-agent, artifact tool —, category, free text, severity) + one always-available framework tool ("report a problem with a tool or instruction"), rate-limited per run; an AI dashboard rollup by target. This is the *evidence intake* for the governed self-improvement loop proposed in [PR #4155](https://github.com/MemberJunction/MJ/pull/4155) (R4): proposals stop being mined only from transcripts and start being filed by the agents themselves. Very MJ-shaped: it's a row, a tool, and a grid.

---

## Tier 2 — Adapt

### H7. Declare resolution policy with the setting (convars)

**Impact: Medium (maintainability) · Effort: Medium**

**The lesson (L5).** Source-engine convars declare name, default, help, and behavior flags (`REPLICATED`, `ARCHIVE`, `CHEAT`, `PROTECTED`) **once, at the definition site** — "persistence, ownership, scope, replication, even replay-honesty: all properties of the variable, stated where it is born. Nobody routes a set through a god object, nobody hand-rolls dirty tracking." Sub-agent inheritance needs no second setting: a spawned child seeds from the parent's live values by default; class configs layer on top.

**MJ today.** MJ resolves each agent setting through its own hand-written chain: effort level (`params` → `agent.DefaultPromptEffortLevel` → `prompt.EffortLevel`), storage account (override → agent → category-walk → type), assignment strategy (params → type → category-walk → request-type → contextUser), context budget (agent → type → model), model override, scoped prompt config… Each resolver is correct; each was written separately; each new setting adds another bespoke walk, and the `AIAgent` entity accretes toward the "god object with a thousand properties" the playbook warns about.

**Proposed.** A declarative **setting-resolution registry**: each resolvable agent setting declares its precedence chain (invocation → agent → category-walk → type → configuration → default), inheritance-to-sub-agent behavior, and persistence scope as *data*; one generic resolver executes it. New settings become declarations, not resolvers. Metadata-driven resolution of metadata is exactly MJ's home turf, and the category/type walks are already duplicated ~6 times waiting to be unified.

### H8. Speculative compaction and the "fold" abstraction

**Impact: Medium (UX) · Effort: Medium · Cross-ref: PR #4155 R2/R3**

**The lesson (L8).** *"Start the summary before the limit, from a journal snapshot; at the limit, commit it only if the snapshot still describes the branch."* Kick compaction off speculatively ~10% before the limit on a branched copy while the user and model keep working; splice at the boundary — the model "will not get confused by a handoff message standing as the only message in the history, but instead will see all the progress it should have done anyway." Model every prompt entry as a **fold** (`fn(this, req) → req`): the user sees full history; the model's request renders the fold. Also named: remote/provider-side compaction, "handoff" phrasing over "summary," and shake (trim heavy tool results) as cheaper first resorts.

**MJ today.** `ConversationCompactionManager` already fires post-turn (user never waits at settle ✓) with a synchronous pre-turn fallback — and the boundary-row `SummaryOfEarlierConversation` + `AssembleContextWindow` *is* a fold. The remaining naive-UX case is exactly the one the playbook targets: a run that crosses the trigger mid-turn only compacts synchronously at the *next* run start. **Proposed:** when in-turn token telemetry crosses `CompactionTriggerPercent`, start Tier-A summarization concurrently from the journaled snapshot; at settle, commit only if the conversation head still matches the snapshot (the OpenClaw review's abort-don't-write verification gate applies to the splice). MJ's audit row already records the outcome either way.

### H9. The tool-roster tax, now with numbers

**Impact: reinforces PR #4155 R11 · Effort: —**

The playbook measured what the OpenClaw review argued: same task, same model — 23 permanent tool defs = **86.2s** median wall (25.1k-token prefix); todo-batching fix = 59.5s; 15 defs = 45.4s; **5 essential tools = 36.6s** (15.1k prefix), beating codex-cli's 42.2s reference. "A tool is not some free win just in case the model needs it." Their answer to the long tail is a **stable discovery surface** (`dyn` — list/`--help`/invoke synthesized from JSON Schema, composable in Bash/Eval) rather than dynamic roster mutation, *because roster changes invalidate the prompt cache*. Rule of thumb worth adopting verbatim in MJ's action-exposure design: **bounded operation set → schema; open-ended operation set → a discovery/code surface; neither changes the permanent roster after discovery.** This is the concrete mechanism and the empirical justification for R11's progressive action disclosure (`formatActionDetails` today renders every granted action, unbounded).

### H10. A first-class utility-model slot

**Impact: Low-medium (cost/latency) · Effort: Low**

**The lesson (L8).** "Tiny local models are super useful… for classification tasks, generating a title, translation, or judging how happy the user is — this is not a second 'agent,' it is a cheap internal capability that should not pay frontier latency or cost." MJ already does this ad hoc (the `Summarize Conversation Range` prompt pins a cheap model; conversation naming; the realtime turn moderator on Cerebras). **Proposed:** name the pattern — a `UtilityModel` designation on `MJ: AI Configurations` that harness chores (folding, naming, classification, memory flush, repetition adjudication) resolve through, instead of each seeded prompt hand-picking a model pool. One row to retune every harness chore per environment.

---

## Process notes worth stealing

- **The design envelope as a review test (L1).** Before shipping a framework feature, check it against MJ's own four-mode envelope: interactive Explorer/conversation use, channel use (Slack/Teams/embedded widget), autonomous use (scheduled jobs, routines, task graphs, record-set processing), and SDK/API use against untrusted input. "A design that only works for the first case smuggles the controller into the UI and assumes a human can recover from an unbounded call." MJ's client-tools, HITL, and streaming already pass this test; new features should state it explicitly.
- **Audit your own examples (L2).** Their 78-extension audit (2 of 17 stateful correct) turned an abstract principle into an undeniable table. The MJ analog: audit the seeded/metadata example agents and the `create-agent` scaffolds against the H1 journal contract and the loop guardrails — the examples are what downstream apps copy.
- **Verification is part of the interface (L10).** "If 'how to verify' is unknown, the agent will side-channel a look-alike test… the debug protocol becomes the machine-readable definition of what the UI is." MJ's integration-test doctrine and Flow debugger are this posture; extend it by giving each new agent-facing surface a declared verification protocol at design time rather than post-hoc Playwright archaeology.
- **Formalize the genuinely hard invariant (L10).** They TLA+-modeled the transcript-commit protocol and now answer bug reports with a counterexample or a proof. MJ's equivalent gnarly invariants — compaction assembly, payload merge under parallel sub-agents, task-graph settlement — are pinned by integration tests today; for the next protocol-shaped one, a small formal spec is a cheap option to keep in the toolbox.

---

## Suggested sequencing

| Phase | Items | Rationale |
|---|---|---|
| 1 | H5, H6, H10 | Small rows-and-tools wins; H6 starts collecting the evidence everything else uses |
| 2 | H3, H4 | Runtime hardening: central budgets, job surface, cheaper retries (H4's malformed-JSON leg already landed via [#4137](https://github.com/MemberJunction/MJ/pull/4137)) |
| 3 | H1 (+ contract/tests), H8 | Journal contract + kill-resume tests; speculative compaction rides the existing manager |
| 4 | H2, H7 | The deep refactors: Director stack, then the setting-resolution registry it pairs with |

---

## Source

["The Harness Playbook"](https://stencil.so/blog/harness-playbook) — Can Bölük, Stencil, 2026-09-02. 9 chapters + 2 appendices (Appendix A: the 78-extension state audit with reproductions; Appendix B: the "Elastic Speculative Slots" TLA+ transcript spec). MJ internals referenced at `6.1.0-edge` (`packages/AI/Agents/src/base-agent.ts`, `LoopAgentType`, `PayloadManager`, `ConversationCompactionManager`, `AIPromptRunner`, `packages/Actions/CodeExecution`, `packages/TaskGraph`).

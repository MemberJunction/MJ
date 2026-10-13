# Blended Inference: Client/Edge Steps in the MJ Agent Architecture — Design Notes

**Status:** exploratory, September 2026. Written after the Chrome built-in Gemma 4 experiment
(`FINDINGS-CHROME-BUILTIN-AI.md`) to answer the question: *how would our agent architecture allow some
inference steps to run on the client/edge and some on the back end, so that when edge models are good enough
(3–6 months?) we can add framework support rather than bolt-ons.* Nothing here is built; the experiment's
`BuiltInAIService` is the seed for the client half.

## 1. What the experiment tells us to design for

| Fact from the experiment | Design consequence |
|---|---|
| Edge decisions cost ~300 ms and $0; the equivalent server step (the agent's planning prompt) costs ~1.5 s and a paid call | Edge is a **latency and cost** optimisation for small, structured decisions, not a place to move reasoning |
| The edge model is reliable at the ends (smalltalk / clear research) and unreliable in the middle | Edge results are **advisory by default**; only a narrow, policy-selected set of decisions are **authoritative** |
| Availability is per browser/hardware/flag and can vanish (origin trial, Canary, hardware floor) | Every edge step needs a **server fallback** and the system must behave identically with edge absent |
| The API does not identify the model; the client can be anything | Edge output is **untrusted input** at the server boundary; nothing security-relevant may depend on it |
| One session per role is fast; `clone()` and cross-session interleaving are slow; prompts serialise | The client needs a **session pool keyed by role** and a **single queue**, not ad-hoc calls |
| Prompt text shipped to the client is readable by the user | Only prompts we are happy to expose run on the edge; tenant personality yes, retrieval strategy no |

## 2. Principles

1. **Placement is a property of a step, not of an agent.** An agent's graph stays where it is; individual prompts/actions declare where they *may* run.
2. **Speculate, don't block.** The server never waits for the client to decide. Edge results arrive early and are used if they arrive in time; otherwise the server path proceeds as today.
3. **Authority stays on the server.** Edge results can shorten a path (skip a planning call, start retrieval early, answer a greeting) only under an explicit policy; they can never widen access, bypass tenant scoping, or replace a validation.
4. **Same telemetry.** An edge step is an `AIAgentRunStep` like any other, with `ExecutionLocation = 'Edge'`, client-reported timings, and cost 0 — so replays, insights and cost reports keep working.
5. **Degrade to today.** With no edge capability, the request is byte-for-byte what it is now.

## 3. Capability negotiation

At conversation start (or on first message) the client probes and reports:

```ts
interface EdgeCapabilities {
  Available: boolean;              // LanguageModel present and availability === 'available'
  ModelClassHint: string;          // e.g. 'chrome-builtin', vendor/version if ever exposed
  ContextWindow: number;           // 9,216 today
  StructuredOutput: boolean;       // responseConstraint supported
  MeasuredLatencyMs: number;       // one warm structured decision, measured on this device
  MeasuredTokensPerSecond: number; // short streaming probe
  Inputs: ('text' | 'image' | 'audio')[];
}
```

Stored on the agent session (`AIAgentSession` / conversation metadata) so agents and policies can plan with it.
Re-probed when it changes (model download completes, flag flipped). The probe itself is ~1 s once and cached.

## 4. Step placement metadata

Additions, all optional and defaulting to today's behaviour:

- `AIPrompt.ExecutionLocation`: `Server` (default) | `Edge` | `Either`.
- `AIPrompt.EdgeRequirements` (JSON): minimum context window, structured output required, max output tokens, allowed model classes.
- `AIAgentStep` (Flow agents) / agent-type config (Loop agents): `PreferredLocation`, and for `Either` a `Policy` = `Advisory` | `Authoritative` | `Speculative`.
- `AIModel` rows for edge models with `Vendor = 'Chrome Built-in AI'`, `DriverClass = 'ChromeBuiltInLLM'`, `ExecutionLocation = 'Edge'`, cost 0 — so the metadata-driven model selection and reporting already understand them.

Runtime placement: a step runs on the edge iff `ExecutionLocation ∈ {Edge, Either}` ∧ capabilities satisfy `EdgeRequirements` ∧ the tenant/user feature flag allows it; otherwise on the server. Decided per step, per session.

## 5. Execution contract

**Client → server (pre-send hints).** The client may attach zero or more `EdgeStepResult`s to a message before it is sent:

```ts
interface EdgeStepResult {
  StepKey: string;              // e.g. 'routing-hint', 'tool-plan'
  PromptID?: string;            // when it ran a metadata prompt
  Output: string;               // raw model output
  Parsed?: unknown;             // JSON when a schema was used
  Model: string;                // capability ModelClassHint
  TimingMs: { TotalMs: number; FirstTokenMs?: number };
  ContextUsage?: number;
  ClientTimestamp: string;
}
```

**Server → client (edge sub-steps).** MJ already has a channel for "the server wants the client to do something":
`ConversationDetail.AutomaticCommands` / `ActionableCommands`. A new command type `EdgeInference { PromptText,
ResponseSchema, StepKey, TimeoutMs }` lets a server-side agent request an edge step mid-run; the client runs it and
posts the `EdgeStepResult` back; the run continues (the same pause/resume mechanics as `AwaitingFeedback`). With a
timeout, the server falls back to running the prompt itself.

**Trust.** Every `EdgeStepResult` is validated at the boundary: schema-checked, size-limited, and mapped through the
step's policy. `Advisory` results become extra context for the next server prompt. `Authoritative` results (only
the narrow set a policy allows, e.g. "this is smalltalk") short-circuit a step but are still logged. `Speculative`
results start parallel work whose output is discarded if the server's own decision disagrees.

## 6. The patterns this enables

1. **Pre-send routing hint** (this experiment): tenant-aware router on the client; `smalltalk`/`out_of_scope` handled locally under an `Authoritative` policy with a server post for logging; `needs_research` sent as `Speculative` so retrieval starts before the planner; everything else `Advisory`.
2. **Speculative retrieval:** on a `needs_research` hint the server launches the search action in parallel with the planning prompt; reconcile when the planner decides (76% agreement in the production replay; the cost of disagreement is a wasted search).
3. **Local-only turns:** greetings, thanks, obvious off-topic — answered by the edge model with the tenant's persona prompt, then posted to the server as a completed turn so conversation history and insights stay whole.
4. **Edge sub-steps inside a server run:** cheap classification, extraction or reformatting a server agent would otherwise spend a call on — requested via `AutomaticCommands`, with fallback.
5. **Edge post-processing:** suggested follow-up questions, display reformatting, per-user summarisation of a long answer — after the authoritative answer exists, so nothing is at risk.
6. **Voice front end (later):** first-words generation and turn-taking on the edge while the server produces the grounded answer; the Prompt API reports audio input, and the tool-use flag is the enabler.

## 7. Where the code goes

**Client** — a browser-only package, e.g. `@memberjunction/ai-edge`:
- `EdgeInferenceService`: capability probe, session pool keyed by role with recycling, single queue, structured prompt helper, telemetry, and the activity log the experiment already has. The experiment's `BuiltInAIService` is 80% of this.
- `ChromeBuiltInLLM`: a `BaseLLM`-shaped adapter over `LanguageModel` so prompts defined in MJ metadata can be rendered and executed client-side through the same `AIPromptRunner` contract where that runner is browser-safe; otherwise a thin client-side runner that consumes rendered prompt text supplied by the server.
- Integration point: the conversation chat area (`mj-conversation-chat-area`) gets a pre-send hook and an `AutomaticCommands` handler for `EdgeInference`. Betty's chat host and Explorer both inherit it.

**Server:**
- `RunAIAgent` / conversation message mutation accept `edgeResults: EdgeStepResult[]`; validation + policy mapping live in one place.
- `BaseAgent`: a speculative-step launcher (start an action while the planning prompt runs; reconcile on decision) and the `EdgeInference` command emitter with timeout/fallback.
- `AIAgentRunStep.ExecutionLocation` + `EdgeModel` columns; cost 0; timings from the client.
- Feature toggles per tenant and per user (`Organization`/`User` settings) — default off.

## 8. Security and privacy

- Nothing that leaves the server for the edge may contain secrets, retrieval strategy, or another tenant's data. Tenant persona prompts and routing taxonomies are fine; scoped-search configuration is not.
- Edge results are untrusted: a hostile client can fabricate any `EdgeStepResult`. Policies therefore only ever let edge results *reduce* work, never *grant* anything (no scope changes, no skipped authorisation, no skipped RLS).
- Local-only turns still post to the server, so moderation and logging see them.
- Member data never leaves the device for edge steps; that is a selling point worth stating in tenant terms.

## 9. Evaluation loop

A replay harness against production traffic (kept outside the repository, since it needs the assistant's database) is the regression suite: agreement with the server decision, false-skip rate, per-step latency, per hardware class. Run it on every prompt change and on every new edge model, and keep the acceptance bar explicit (today: false skips ≤5% for anything `Authoritative`). Cadence: re-evaluate the edge landscape every three months; a monthly scan routine watches for new models/APIs.

## 10. Phasing

| Phase | Trigger | Scope |
|---|---|---|
| 0 — now, behind a toggle | This experiment | Capability probe + pre-send routing hint (`Advisory`); local smalltalk (`Authoritative`) with server post; measured live against the replay |
| 1 — when the 4B/12B models or tool use land in Canary | Replay shows false skips ≤5% on rule A | Speculative retrieval; tenant persona on the edge; edge sub-steps via `AutomaticCommands` |
| 2 — framework support | Web Prompt API leaves origin trial, or an extension path is chosen | Placement metadata, `ChromeBuiltInLLM`, `ExecutionLocation` telemetry, per-tenant toggles |
| 3 — voice | Audio input + tool use stable | First-words and turn-taking on the edge |

## 11. Open questions

- Extension vs web page: the extension surface is GA today and exposes more (params, Workers). Is a Betty companion extension an acceptable deployment for staff/admins before the web API ships?
- Which prompts are we comfortable exposing client-side per tenant?
- How does an edge step interact with plan mode and multi-agent runs — hints per turn only, or per sub-agent?
- Do we want cost/latency attribution for edge steps in Betty Insights (probably yes, at 0 cost)?
- Hardware floor: what share of member devices clear it? Needs telemetry from the capability probe before any member-facing rollout.

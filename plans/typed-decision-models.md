# Typed Decision Models in MemberJunction

**Status:** Proposed — not started
**Audience:** An engineer (with or without an AI coding agent) executing this end to end
**Owner:** TBD

---

## 0. Read this first

This plan has two halves that reinforce each other:

1. **A platform refactor.** Unify how MJ invokes *any* model behind one runner hierarchy, so model
   selection, credential resolution, failover and telemetry stop being reimplemented per modality.
   This ships value on its own and carries no AI risk.
2. **A new capability.** A *typed decision* model — one that returns enumerated answers with
   calibrated probabilities instead of text. This only becomes affordable once (1) exists.

**Do the phases in order.** Phase −1 can kill the second half cheaply; Phase 0 is a prerequisite for
everything after it. Each phase is independently valuable and independently revertible.

### House rules that apply to every phase

These are MJ-wide rules from `CLAUDE.md`. Violating them is worse than shipping late.

- **Never `git commit` without the user explicitly asking.** Each commit needs its own approval.
- **Never `git checkout -- <file>`, `git restore`, or `git reset --hard`** without explicit approval.
- Feature branches are cut from `next` and **must track `origin/<same-name>`**. Verify with
  `git branch -vv` before every push.
- This is a **pnpm** workspace. `pnpm install` at the repo root only, never inside a package.
- After changing a package: `cd packages/<Pkg> && pnpm run build`, then run its tests
  (`pnpm test`). Fix or update broken tests — never leave them broken.
- **No `any`.** No `as any`, no `: any`, no `unknown` as a shortcut. No `.Get()`/`.Set()` as a
  substitute for generated entity properties.
- **Never hand-edit anything under `src/generated/`** — CodeGen owns it.
- Migrations: `V<YYYYMMDDHHMM>__v<X.Y>.x__<Description>.sql`, filed in the `migrations/vN/` folder
  matching the **major version in the filename**. Hardcoded UUIDs, never `NEWID()`. Never include
  `__mj_CreatedAt`/`__mj_UpdatedAt` or FK indexes — CodeGen generates those.
- **Never hand-author `migrations-pg/**`.** PostgreSQL conversion is toolchain work done by the
  build engineer at release time.
- Run `mj sync push` **before** `mj codegen`, or CodeGen regenerates from stale JSONType definitions
  and silently deletes properties.
- **One database per engineer.** Confirm nobody else is using your `DB_DATABASE` before
  `mj migrate` / `mj codegen` / `mj sync push`.
- Every PR touching a published package needs a changeset (`pnpm exec changeset`). `minor` is
  reserved for branches carrying migrations or metadata; everything else is `patch`.
- **Definition of done:** the package's unit tests pass **and** the deterministic integration tier
  passes (`pnpm run test:integration`). Report pass/fail/skip counts.

### Verify, don't trust, the numbers in this document

Line numbers drift. Where this plan cites a count or a location, it also gives the command that
re-derives it. Run the command; do not copy the number forward.

---

## 1. Why — the evidence

MJ has already built a typed-decision call by hand, measured it, and deleted it for being too slow.
That is the whole business case, and it is already written down in this repo.

| Evidence | Where |
|---|---|
| **A hand-built System One call.** `Check Sage Intent` is a 3-way choice (`YES`/`NO`/`UNSURE`) plus a boolean plus an entity reference. Pinned to GPT-OSS-120B on Cerebras and Groq, `PowerPreference: Lowest`, prefill + stop-sequence JSON fencing, `MaxRetries: 1` because a retry blows the budget. Its description names the target: *"sub-500ms."* | `metadata/prompts/.sage-intent-check.json` |
| **It was then deleted for latency.** *"~300ms of latency on every message… the single largest source of non-inference overhead on the client."* Kept in comments *"so we can reintroduce intent checking in the future when browser-local inference is fast enough (~20-50ms)."* | `packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts` (search `COMMENTED OUT`) |
| **With a recorded cost/benefit.** *"Optimization 1: Eliminate Intent Check LLM Call — Savings: ~300ms \| Risk: Low… This is wasteful ~90% of the time."* ~300ms of classifier against ~400ms of real inference in a ~1,815ms round trip. | `plans/agent-latency-optimization.md` |
| **And a lost feature as collateral.** `targetArtifactVersionId` is now permanently `undefined`, so "regenerate version 2" no longer targets a version. | same component, the replacement heuristic |
| **`confidence` is requested every turn and read by nothing.** Declared on `LoopAgentResponse`, threaded through five code paths, persisted to step `OutputData` — and no branch anywhere compares it. | `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts`; verify: `grep -rn "\.confidence" packages/AI/Agents/src --include=*.ts \| grep -v __tests__` |
| **The framework distrusts the model's enum discipline.** `isValidLoopResponse` contains nine inference branches that reconstruct `nextStep.type` from whichever sibling field is populated, plus case normalisation, plus two "the AI forgot" repairs — above a three-stage JSON repair ladder ending in a second LLM call. | `packages/AI/Agents/src/agent-types/loop-agent-type.ts`, `isValidLoopResponse` |
| **Sage burns two turns on routing information it already has.** `ALL_AVAILABLE_AGENTS` is placed into the prompt data and **no template references it**; the prompt instead mandates a `Find Candidate Agents` semantic-search round trip. | `packages/ConversationsRuntime/src/agent-runner/ConversationAgentRunner.ts`; verify: `grep -rn "ALL_AVAILABLE_AGENTS" metadata/ packages/` |
| **A designed small-judgment call that was never wired.** `PayloadFeedbackManager.queryAgent` — a batched yes/no "did you intend this change?" judge over deterministically-flagged suspicious payload changes — is fully implemented with **zero call sites**. | `packages/AI/Agents/src/PayloadFeedbackManager.ts` |
| **Reranking has no cost telemetry at all.** `RerankerService` writes an agent run step tagged `StepType='Decision'` and records no `AIPromptRun` — no tokens, no cost, no model-selection trace. | `packages/AI/Reranker/src/RerankerService.ts` |

**The sockets already exist.** `MJAIAgentRunStep.StepType` includes `'Decision'` and `'Validation'`.
Flow state reserves `$confidence` as one of only three special fields. The task-graph gate is
already three-valued (`keep`/`drop`/`hold`) with a documented rationale — *"'false' and 'cannot
tell' must not share a branch"* — against a Boolean evaluator that can only say "cannot tell" by
throwing a `ReferenceError`.

**What is missing is a trustworthy source of judgment.**

---

## 2. Vocabulary

Use these terms consistently in code, comments and PR descriptions.

| Term | Meaning |
|---|---|
| **Primitive / driver base class** | An abstract class in `packages/AI/Core/src/generic/` that defines what a *kind* of model does. E.g. `BaseLLM`, `BaseEmbeddings`, `BaseReranker`. New: `BaseDecision`. |
| **Driver** | A concrete `@RegisterClass(BasePrimitive, 'DriverName')` implementation, usually one per vendor. E.g. `CohereReranker`, `LLMReranker`. |
| **Model type** | A row in `MJ: AI Model Types`. The data-level classification used to filter which models a given call may use. |
| **Runner** | A class in `packages/AI/Prompts/src/` that orchestrates a model call: selection, credentials, failover, execution, telemetry. New base: `AIModelRunner`. |
| **Decision** | A call that takes a *state* plus one or more typed *questions* and returns enumerated answers with probabilities. Produces no free text. |
| **Likelihood** | A decision question with a yes/no answer, returning `P(yes)` in `[0,1]`. The probability **is** the confidence — there is no separate confidence field. |
| **Choice** | A decision question that selects one label from an enumerated set, returning the label, per-option probabilities, and a confidence. |
| **Score** | A decision question that places the state on an ordered rubric, returning a continuous value, per-level probabilities, and a confidence. |
| **Calibration** | The property that stated probabilities match observed frequencies. Among answers given 0.9, about 90% should be correct. Untested calibration is a vendor claim, not a property. |

### A note on naming

The vendor whose model prompted this work calls the yes/no primitive a **"Noul"**. **Do not use that
name in MJ.** It is a vendor coinage, and the entire point of the `BaseDecision` abstraction is that
it outlives any one vendor — the same reason MJ says `BaseReranker` rather than `BaseCohereRerank`.
Use `Likelihood`, `Choice`, `Score`, and map vendor vocabulary at the driver boundary.

---

## 3. Target architecture

### 3.1 Runner hierarchy

```
AIModelRunner (new, abstract)
│   Owns the template method:
│     • candidate building, filtered by RequiredModelType
│     • credential hierarchy resolution
│     • execution bounds (timeout + cancellation)
│     • failover orchestration and error classification
│     • MJ: AI Prompt Runs lifecycle, tokens, cost, telemetry
│   Declares: protected abstract executeOnModel(...)
│   Declares: public abstract get RequiredModelType(): string
│
├── AIPromptRunner          RequiredModelType = 'LLM'
│   └── ParallelExecutionCoordinator   (existing subclass, unchanged)
├── AIDecisionRunner        RequiredModelType = 'Decision'
├── AIEmbeddingRunner       RequiredModelType = 'Embeddings'
├── AIRerankerRunner        RequiredModelType = 'Reranker'
├── AIImageGenerationRunner RequiredModelType = 'Image Generator'
├── AITextToSpeechRunner    RequiredModelType = 'TTS'
├── AISpeechToTextRunner    RequiredModelType = 'STT'   ← see §3.3, taxonomy dedupe
└── AIVideoRunner           RequiredModelType = 'Video'
```

**Realtime is deliberately excluded.** It is a full-duplex session in which the model owns the
listen-reason-speak loop, not a request/response call. Forcing it under this base would bend the
base. Leave `BaseRealtimeModel` and its bridge machinery alone.

### 3.2 The runner/primitive axis rule

**Runners are keyed on model type. Primitives are keyed on driver class. They are not 1:1, and the
plan does not force them to be.**

- A primitive may expose several operations for one model type (`BaseImageGenerator` has
  `GenerateImage`, `EditImage`, `CreateVariation`).
- A runner declares one `RequiredModelType`; it is not obliged to be the *only* path to a model.
  Direct driver use remains legal where a caller genuinely needs it. The hierarchy exists so the
  common path is coherent and instrumented, not to forbid every alternative.

One exception where the mismatch is worth fixing rather than tolerating: see §3.4.

### 3.3 Parallel params / result hierarchies

This is what makes the refactor **non-breaking**.

```
AIModelRunParams                     AIModelRunResult
  └── AIPromptParams  (unchanged)      { success, status, cancelled, cancellationReason,
  └── AIDecisionParams                   errorMessage, promptRun, executionTimeMS,
  └── AIEmbeddingParams                  promptTokens, completionTokens, tokensUsed,
  └── …                                  cost, costCurrency, modelInfo, modelSelectionInfo }
                                       │
                                       ├── AIPromptRunResult   { … + chatResult (STILL REQUIRED),
                                       │                          result<T>, rawResult,
                                       │                          validationResult, validationAttempts,
                                       │                          additionalResults, ranking,
                                       │                          judgeRationale, judgeMetadata,
                                       │                          cacheInfo, wasStreamed, media }
                                       ├── AIDecisionRunResult { … + answers, probabilities, confidence }
                                       └── AIEmbeddingRunResult{ … + vectors }
```

`ExecutePrompt` keeps returning `AIPromptRunResult` with `chatResult` non-optional. **No existing
caller breaks.** Only new callers of the base see the narrower type.

> Earlier framings of this work proposed relaxing `chatResult` to a union. Do not do that — it is a
> breaking change to a type consumed by ~20 call sites. Use the hierarchy.

### 3.4 Split `BaseAudioGenerator`

`BaseAudioGenerator` currently carries `CreateSpeech` (text-to-speech), `SpeechToText`, `GetVoices`,
`GetModels` and `GetPronounciationDictionaries` on one class — one primitive spanning two model
types. Split it:

- `BaseTextToSpeech` — `CreateSpeech`, `GetVoices`, `GetModels`, `GetPronounciationDictionaries`
- `BaseSpeechToText` — `SpeechToText`, `GetModels`

This is the one place where making the primitive axis match the model-type axis is worth the churn,
because otherwise `AITextToSpeechRunner` and `AISpeechToTextRunner` both instantiate the same class
through the ClassFactory under different type keys, which reads as a bug to anyone new.

**Three drivers register against `BaseAudioGenerator` today** (verified; re-run
`grep -rn "@RegisterClass(BaseAudioGenerator" packages --include=*.ts` to confirm):

| Driver | File | Likely split |
|---|---|---|
| `OpenAIAudioGenerator` | `packages/AI/Providers/OpenAI/src/models/tts.ts` | both — TTS and Whisper |
| `ElevenLabsAudioGenerator` | `packages/AI/Providers/ElevenLabs/src/index.ts` | primarily TTS |
| `GroqAudioGenerator` | `packages/AI/Providers/Groq/src/models/groqAudio.ts` | primarily STT (Whisper) |

Inspect each before splitting — a driver that genuinely does both should register against both
classes rather than being forced into one.

### 3.5 Decision capability

```
BaseDecision (packages/AI/Core/src/generic/baseDecision.ts)
  ├── LLMDecision   @RegisterClass(BaseDecision, 'LLMDecision')   — prompt-backed, ships first
  └── JevDecision   @RegisterClass(BaseDecision, 'JevDecision')   — native provider, Phase 2
```

This mirrors `BaseReranker` / `LLMReranker` / `CohereReranker` exactly, which is the proven in-repo
pattern for "same capability, purpose-built model or LLM fallback, chosen by metadata."

---

## 4. Non-goals

State these in the PR description. Scope creep here is expensive.

- **No in-run graph executor.** MJ deliberately removed one (see Phase 0, Task 0.7). Building
  another would produce a third implementation of traversal rules — the exact drift the convergence
  work existed to end.
- **No model call inside `IConditionEvaluator.Evaluate`.** It is synchronous by contract, and
  correctly so: *"traversal decisions must be cheap enough to make inside a tight loop."* Judgments
  resolve as steps; edges read their results.
- **No replacing routing that should be a driver.** Where transitions are knowable, write code.
  `packages/AI/FormBuilder/core/src/agents/form-builder-agent.ts` is the reference: it overrides
  `determineNextStep` to force Designer → Builder deterministically, with *"no LLM 'summarize'
  turn"* and `MAX_DESIGNER_ATTEMPTS = 3` bounded in code.
- **No Realtime migration.** See §3.1.
- **No incremental task-graph API.** Graph shape is currently decided one-shot, validation is
  all-or-nothing, and growth happens only via `continuation: 'reinvoke'` (capped at
  `MAX_REINVOKE_DEPTH = 5`). Making graphs incrementally appendable is a real feature and a
  different one.
- **No new caching implementation.** `MJ: AI Prompts` has a full cache schema and zero
  implementation (`CacheHit` is hardcoded `false`). Leave it alone; do not let it expand scope.

---

## Phase −1 — Feasibility spike (outside MJ)

**Goal:** decide, on evidence, whether a native decision provider beats MJ's existing fast path by
enough to justify a dependency. Days, not weeks. **No MJ code changes.**

**This phase can cancel Phases 1–4. That is its purpose.** Phase 0 proceeds regardless.

### Task −1.0 — Procurement and reachability (30 minutes, do this first)

Confirm an account is provisionable, a key is obtainable, and the API endpoint is reachable from
wherever the harness will run — directly or through a gateway MJ already uses. If it is not, stop
and report; everything downstream is blocked.

### Task −1.1 — Build the corpus from real traffic

**Do not use synthetic inputs.** The dominant risk in this whole plan is *state projection* — these
models degrade as the state grows with content irrelevant to the question. A harness fed toy inputs
measures nothing about MJ.

Extract real payloads for the candidate decisions. Start with the Sage intent check, because its
labels are free (see −1.2). Target several hundred examples minimum.

### Task −1.2 — Get labels behaviorally, not by hand

For the intent check, ground truth is recoverable from conversation history: **which agent actually
handled the next message** answers "did this message continue with the previous agent?" That yields
hundreds of labels from real traffic with no hand-labelling.

Verify the conversation model records agent-per-message before relying on this — inspect
`ConversationDetail` and the routing path in
`packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts`
(`routeMessage`, `findLastNonSageAgentId`). If that assumption does not hold, fall back to hand
labelling a smaller set, and say so in the results.

### Task −1.3 — Test decomposed *and* single-question

**This is the step most likely to be skipped and most likely to invalidate the result.**

Published independent benchmarks report the same task scoring **62.6% asked as one question and
95.0% split into five narrow questions** recombined by a fitted classifier. A harness that only asks
the single big question will conclude "not good enough" while measuring the wrong thing.

Run at least three arms:
1. One composite question (the naive port of the existing prompt).
2. Decomposed into narrow questions, combined by a **hand-written rule**.
3. Decomposed, combined by a **fitted combiner** (e.g. logistic regression) trained on a held-out
   split.

Report each separately. Arm 3 needs labelled training data — note how much, because that cost is
part of the decision.

### Task −1.4 — Measure calibration, not just accuracy

Produce a reliability curve and an expected-calibration-error figure, not only accuracy. If the
confidence numbers are not honest, the routing story (act above ~0.7, flag for review 0.35–0.7,
escalate below) collapses and most of the value goes with it.

### Task −1.5 — Set the correct baseline

The vendor's published comparisons are against Claude Haiku and reasoning models. **That is not
MJ's incumbent.** `Check Sage Intent` already ran **GPT-OSS-120B on Cerebras** and already achieved
sub-500ms. Benchmark against that, on the same corpus, same arms.

If the native provider cannot beat a small model on fast inference silicon, then **`LLMDecision` on
Cerebras is the product** — Phase 1 still ships, Phase 2's provider work does not, and the plan gets
simpler and cheaper. That is a good outcome, not a failure.

### Phase −1 exit criteria

A short written report containing: accuracy per arm per model, calibration curves, p50/p95 latency,
cost per 1,000 decisions, and an explicit recommendation of **native provider / LLM-backed only /
neither**. Store it at `plans/typed-decision-spike-results.md`.

---

## Phase 0 — Runner unification

**Goal:** one model-invocation stack. No new AI capability, no new vendor, no model behaviour
change. This is the phase that pays for itself regardless of what Phase −1 concludes.

**Ship this as a train of PRs, not one.** Suggested order below. Each PR builds, tests and passes
the integration tier on its own.

### Task 0.1 — Dedupe the model-type taxonomy *(prerequisite — do not skip)*

The baseline migration seeds `AIModelType` rows including `TTS` and `STT`; `metadata/ai-model-types/.ai-model-types.json`
later added `Speech to Text`. **`STT` and `Speech to Text` are the same concept with two rows.**

This is harmless today because `AIPrompt.AIModelTypeID` is advisory. It becomes a live bug the
moment `RequiredModelType` is a hard floor, because the floor matches one row and silently filters
out every model registered against the other.

1. Query the live database, not just the seeds:
   `SELECT ID, Name, Description FROM __mj.AIModelType ORDER BY Name`
2. Count models per type: `SELECT AIModelTypeID, COUNT(*) FROM __mj.AIModel GROUP BY AIModelTypeID`
3. Pick one survivor per duplicate pair. Write a migration that repoints `AIModel.AIModelTypeID`
   rows and removes the loser. **Hardcoded UUIDs; no `NEWID()`.**
4. Update `metadata/ai-model-types/.ai-model-types.json` to match.

**Acceptance:** every `AIModelType.Name` is distinct in meaning; no `AIModel` rows orphaned; the
migration is idempotent (`IF NOT EXISTS` / `WHERE NOT EXISTS`) and re-runnable.

**Guardrail:** this touches shared metadata. Confirm nobody else is using your database first.

### Task 0.2 — Fix the failover type filter

There are four places that filter model candidates by type. Three compare `AIModelTypeID` by ID;
the failover path resolves the type row and then compares **name strings** off a denormalised view
column. Make it compare IDs like the other three.

**File:** `packages/AI/Prompts/src/AIPromptRunner.ts` — find `selectFailoverCandidates` and the
block that builds `targetTypeName` / filters `aiEngine.Models` on `m.AIModelType`.

**Acceptance:** all four filter sites compare by `AIModelTypeID` using `UUIDsEqual`. Add a unit test
that a failover candidate list excludes models of a different type.

### Task 0.3 — Create the abstract base and re-parent `AIPromptRunner`

**This is the load-bearing task. Read this whole section before starting.**

**Direction of the refactor: pull down, do not extend up.** Today's `AIModelRunner` is the *weaker*
implementation — it resolves models by name string, falls back to "smallest `InputTokenLimit`"
instead of `PowerRank`, skips the `IsInferenceProvider` check, calls `GetAIAPIKey` directly rather
than the credential hierarchy, and has no failover at all. **Claim the name, retire the body.**

1. Create `packages/AI/Prompts/src/AIModelRunner.ts` as a **new abstract class** (move the existing
   embedding implementation aside first — Task 0.5 re-homes it).
2. Move these from `AIPromptRunner` into the base:
   - candidate building and type filtering (`buildModelVendorCandidates` and its helpers)
   - credential hierarchy (`resolveCredentialForExecution`)
   - execution bounds (`createExecutionBound`, the timeout/abort merge)
   - failover orchestration (`executeModelWithFailover`, `selectFailoverCandidates`,
     `shouldAttemptFailover`, `errorMatchesScope`, retry-delay calculation)
   - `MJ: AI Prompt Runs` lifecycle (`createPromptRun`, `updatePromptRun`, the
     `BaseEntitySaveQueue` wiring, token/cost accumulation)
   - error classification (`isFatalPromptError`, `isConfigurationError`)
3. Declare on the base:
   ```ts
   /** The model type this runner requires. A hard floor — AIPrompt.AIModelTypeID may narrow it
    *  or must match, and may never widen it. */
   public abstract get RequiredModelType(): string;

   /** The one varying step: invoke the resolved model. Subclasses own everything
    *  modality-specific — request shaping, response unwrapping, parsing. */
   protected abstract executeOnModel(
       context: ModelExecutionContext,
       params: AIModelRunParams
   ): Promise<AIModelRunResult>;
   ```
4. `AIPromptRunner extends AIModelRunner` with `RequiredModelType => 'LLM'`, retaining everything
   chat-specific: template rendering, `SystemPlaceholderManager`, `buildMessageArray`, response
   format, native tool calling, prefill, streaming, output parsing/validation/JSON repair,
   parallelization and the judge.
5. Introduce the params/result hierarchies from §3.3. **`AIPromptRunResult.chatResult` stays
   required.**

**`RequiredModelType` semantics — write this into the code comment:**
- The getter returns a model type **name** (code-stable and readable). Resolve it to an ID once in
  the base, then filter by ID everywhere.
- `AIPrompt.AIModelTypeID` may equal it or narrow further. It may **not** widen it.
- `AIPrompt.AIModelTypeID = NULL` stops meaning "any model" and starts meaning "whatever the runner
  requires." This closes a real footgun: a prompt that forgets to set the column currently draws
  models of every type.

**Acceptance:**
- `pnpm run build` clean across the AI packages.
- Every existing `AIPromptRunner` test passes unchanged.
- No call site of `ExecutePrompt` required an edit. Verify:
  `grep -rn "new AIPromptRunner()" packages --include=*.ts | wc -l` before and after — the count is
  unchanged and none of the files changed.
- A new unit test asserts that a runner refuses a model whose type does not satisfy
  `RequiredModelType`.

**Guardrails:**
- `ParallelExecutionCoordinator extends AIPromptRunner` and is resolved through the ClassFactory
  specifically to dodge a circular import. Do not disturb that registration. After this change the
  hierarchy is three deep — if the base starts accumulating chat-shaped concerns, stop and raise it;
  composition (a `ModelExecutionPipeline` both runners hold) is the fallback design.
- Do not "improve" behaviour while moving it. Move first, verify, then change in a separate commit.
  Refactor and behaviour change go in separate, independently revertible commits.

### Task 0.4 — Retire the vestigial classify surface

`packages/AI/Core/src/generic/classify.types.ts` defines `ClassifyParams extends ChatParams`,
`ClassifyTag { tag, confidence }` and `ClassifyResult`. `BaseLLM` declares
`public abstract ClassifyText(params): Promise<ClassifyResult>`, implemented as stubs by OpenAI,
Anthropic and Fireworks, and **reachable from nothing in the prompt engine**.

Decide explicitly and record the decision in the PR: either absorb it into `BaseDecision` (Phase 1)
or delete it. Do not ship `BaseDecision` alongside a live `ClassifyText` — two answers to one
question is how the next person gets lost.

Same treatment for `SummarizeText` if it is equally unreachable; check before assuming.

**Verify:** `grep -rn "ClassifyText\|ClassifyResult\|ClassifyParams" packages --include=*.ts`

### Task 0.5 — Re-home embeddings and migrate the direct call sites

1. `AIEmbeddingRunner extends AIModelRunner`, `RequiredModelType => 'Embeddings'`, exposing
   `RunEmbedding`. It should be thin — most of the old file's body is now in the base.
2. Migrate every direct `CreateInstance<BaseEmbeddings>` call site to the runner.

Find them: `grep -rn "CreateInstance<BaseEmbeddings>" packages --include=*.ts`

Known at time of writing (re-run the grep — this list will drift):
- `packages/DBAutoDoc/src/discovery/EmbeddingProvider.ts`
- `packages/AI/Knowledge/TagEngine/src/TagEngine.ts` (its own fallback path)
- `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts`
- `packages/AI/Vectors/Sync/src/models/entityVectorSync.ts`
- `packages/AI/Vectors/Sync/src/models/workers/VectorizeTemplates.ts`
- `packages/AI/Engine/src/AIEngine.ts` (two sites)
- `packages/AI/Prompts/src/AIModelRunner.ts` (the old body itself)

**Behaviour change to call out in the PR:** migrated callers **gain failover and full
`AIPromptRun` telemetry**. That is an improvement, but it is a change — embedding calls that
previously failed hard on one vendor will now try another, and cost rows will start appearing where
there were none. Say so.

**Acceptance:** the grep returns only the drivers themselves and the new runner. Vector sync and
dupe detection still pass their tests.

### Task 0.6 — Migrate the remaining modalities

In dependency order, each its own PR:

1. **Reranker** — `AIRerankerRunner`, `RequiredModelType => 'Reranker'`. Rework
   `RerankerService.getReranker()` to go through it. **This closes a real gap: reranking currently
   records no `AIPromptRun` at all**, so its tokens and cost are invisible to AI cost reporting.
   Keep `RerankerService`'s existing driverClass → ClassFactory branch between native
   (`CohereReranker`) and prompt-backed (`LLMReranker`) — that branch is the pattern `AIDecisionRunner`
   will copy.
2. **Image generation** — `AIImageGenerationRunner`, `'Image Generator'`.
3. **Audio** — split `BaseAudioGenerator` per §3.4, then `AITextToSpeechRunner` (`'TTS'`) and
   `AISpeechToTextRunner` (the survivor of Task 0.1).
4. **Video** — `AIVideoRunner`, `'Video'`.

`baseDiffusion.ts` appears to be a stub — confirm before giving it a runner.

**Acceptance per modality:** an `AIPromptRun` row is written for every call, with tokens or
`InputUnits`/`OutputUnits` and a resolvable cost. Note that `ModelUsage` already supports non-token
unit kinds (`Tokens | Seconds | Characters | Images`) and that cost calculation **refuses to price a
run whose unit kind no driver claims** rather than guessing — that refusal is correct behaviour, not
a bug to work around.

### Task 0.7 — Delete the legacy in-run flow walker

Flow agents now compile to a `TaskGraphSpec` and dispatch; the old in-run walker is retained
compiled-but-unreachable behind a single choke point that throws.

**What to delete**, in `packages/AI/Agents/src/agent-types/flow-agent-type.ts`:
- `refuseInRunFlowExecution` and its call site
- `createStepForFlowNode` and its per-`StepType` switch
- the flow-specific in-run ForEach/While bodies
- the `ActionInputMapping` / `ActionOutputMapping` application path used only by the walker
- the walker's own `buildConditionContext`

**Why the scary comment does not block this.** `packages/AI/Agents/src/agent-types/flow-graph-executor.ts`
warns that the walker is retained as the differential suite's oracle and that *"deleting it and the
suite in one change would remove the baseline at the exact moment regressions become likely."*

That suite is `packages/AI/CorePlus/src/__tests__/flow-differential.test.ts`. It lives in **CorePlus**
and imports `SelectOutgoingEdges` from the shared `GraphTraversalEngine`. It does **not** import
`FlowAgentType` — it cannot, wrong package. So the oracle it protects is the shared traversal
engine, which this deletion does not touch. **Confirm this yourself before cutting:**

```bash
grep -n "^import\|from '" packages/AI/CorePlus/src/__tests__/flow-differential.test.ts
grep -rn "createStepForFlowNode\|refuseInRunFlowExecution" packages --include=*.ts
```

**Both were run at the time of writing, and the result is reassuring.** The differential suite
imports only from `../task-graph/graph-traversal-engine`, `../task-graph/flow-graph-compiler`,
`../task-graph/graph-algorithms` and `../task-graph/task-graph-spec` — nothing from the Agents
package. And the walker is referenced from exactly **two** files:

- `packages/AI/Agents/src/agent-types/flow-agent-type.ts` — the code to delete
- `packages/AI/Agents/src/__tests__/flow-agent-type.test.ts` — the test to update

That is the entire blast radius. If your grep finds anything else, stop and reassess.

**Two bonuses that come free:** the `Human`-step coverage gap disappears (that switch has no
`Human` case and falls through to "Unknown step type"), and so does the second `buildConditionContext`,
whose `flowContext.completedSteps` semantics silently differ from the dispatcher's stub — same
grammar, different meaning across two engines.

**One decision to make before cutting, not after:** the dispatched path carries two hard refusals —
`agentTypeParams.startAtStep` and flow-as-sub-agent. Those are capabilities the dispatcher does not
have. Deleting the walker does not lose them (they are already refused), but it removes "just
re-route it" as a recovery option. If either is on a roadmap, file it as a dispatcher feature first.

The old code remains in git history; say so in the PR description with the deleting commit's parent
SHA.

### Task 0.8 — Fix the silent `While` failure *(do this before Phase 4 depends on it)*

In `packages/AI/Agents/src/base-agent.ts`, `executeWhileLoop` evaluates the loop condition via
`SafeExpressionEvaluator` and treats `!evalResult.success` **identically to `false`** — it breaks,
discards `evalResult.error`, and `completeWhileLoop` then finalises with `success: true` and
*"Completed While loop request … after 0 iteration(s)."*

**A malformed or disallowed condition produces a green, zero-iteration loop with no error surfaced
anywhere.** This is the exact silent-fail-open-at-a-decision-point class this plan exists to reduce,
and it is live today.

**Fix:** distinguish "evaluated false" from "could not evaluate." An unevaluable condition should
push an error onto `loopResults.errors` (so the loop finalises `success: false`) and surface
`evalResult.error` in `ErrorMessage`. A first-iteration unevaluable condition should fail the step,
not silently complete it.

**While you are in there**, note two further issues and decide whether to fix now or file:
- The condition context is **deep-cloned every iteration**, and `results` grows by a full
  `BaseAgentNextStep` (each carrying a payload) per iteration — O(n²) in iterations × payload size,
  paid even when the condition only reads `results.length`.
- `prompt` is declared as a valid ForEach/While loop body in the type but **is not implemented** —
  `executeSingleForEachIteration` / `executeSingleWhileIteration` branch only on `action` and
  `subAgent` and throw otherwise. The LLM can emit it.

**Acceptance:** a unit test asserting that a syntactically invalid While condition yields a failed
step whose message contains the evaluator's error.

### Phase 0 exit criteria

- One selection stack, one credential path, one failover implementation, one telemetry story.
- Every modality writes `AIPromptRun` rows with resolvable cost.
- `grep -rn "CreateInstance<Base\(Embeddings\|Reranker\|ImageGenerator\)>" packages --include=*.ts`
  returns only drivers and runners.
- The deterministic integration tier passes.

---

## Phase 1 — The decision capability, LLM-backed only

**Goal:** a working, measurable typed-decision capability with **zero vendor commitment**.

### Task 1.1 — The primitive

Create `packages/AI/Core/src/generic/baseDecision.ts` and `decision.types.ts`, modelled closely on
`baseReranker.ts` / `reranker.types.ts` — read those first; they are 60 and ~100 lines and are the
template.

```ts
export type DecisionQuestion =
    | { kind: 'Likelihood'; instructions: string }
    | { kind: 'Choice'; instructions: string; options: Array<{ value: string; description?: string }> }
    | { kind: 'Score'; instructions: string; levels: string[] };

export type DecisionParams = {
    /** The state the questions are asked about. Keep it narrow — see the projection rule. */
    state: string | Record<string, unknown>;
    /** Named questions, answered in one call. */
    questions: Record<string, DecisionQuestion>;
};

export type LikelihoodAnswer = { kind: 'Likelihood'; probability: number };
export type ChoiceAnswer     = { kind: 'Choice'; value: string; probabilities: Record<string, number>; confidence: number };
export type ScoreAnswer      = { kind: 'Score'; value: number; probabilities: Record<string, number>; confidence: number };

export type DecisionResult = BaseResult & {
    answers: Record<string, LikelihoodAnswer | ChoiceAnswer | ScoreAnswer>;
};
```

`BaseDecision extends BaseModel` with one abstract method, `doDecide(params): Promise<DecisionResult>`,
and `@RegisterClass(BaseDecision, 'ProviderName')` on implementations.

**Note the asymmetry deliberately:** `Likelihood` carries no separate `confidence`, because the
probability is the confidence. Do not add one for symmetry's sake — it would be a second, meaningless
number.

### Task 1.2 — Model type and configuration

1. Add a `Decision` row to `metadata/ai-model-types/.ai-model-types.json` with
   `DefaultInputModalityID` and `DefaultOutputModalityID` → `Text`, `SupportsPrefill: false`.
   Follow the `Realtime` row as the example — its description is the canonical statement of the
   pattern.
2. Add a `Decision` section to the model configuration bag in
   `packages/AI/Core/src/generic/modelConfiguration.ts` **and, in lockstep**, to
   `metadata/entities/JSONType-interfaces/IAIConfiguration.ts`. These two mirror each other and
   drive CodeGen's generated accessors — editing one without the other is a silent break.

   Capabilities to declare there (not as columns — the file's own rule is *"new capability knobs go
   in the bag; do not add a capability column per knob"*): max questions per call, max options per
   Choice, whether per-option probabilities are returned, max state size.

3. Optionally add a `Decision` row to `metadata/prompt-types/.prompt-types.json` — but know that
   **prompt type is decorative**: `AIPromptRunner` never reads `TypeID` or `Type`, and the only
   consumer repo-wide is the embedding lookup. It buys nothing by itself.

**Order of operations:** `mj sync push` **then** `mj codegen`. Reversing these regenerates from
stale JSONType definitions and silently drops properties.

### Task 1.3 — `AIDecisionRunner`

`extends AIModelRunner`, `RequiredModelType => 'Decision'`.

Owns: rendering the state, assembling questions, mapping the driver's result into
`AIDecisionRunResult`. **Owns no parsing, no schema validation, and no JSON repair** — a typed
decision cannot return malformed output, and reintroducing a parse step would give back exactly what
the model type exists to remove.

**State rendering reuses the existing template machinery**, which is already decoupled from the chat
path:
- `TemplateEngineServer.RenderTemplateSimple(templateText, data)` renders a raw string with
  arbitrary data — no prompt row, no model, no chat.
- Or reuse the pattern in `AIPromptRunner.renderPromptTemplate` (system placeholders <
  `params.data` < `params.templateData`), which is thin and chat-agnostic. The coupling begins one
  line later at `buildMessageArray`.

### Task 1.4 — `LLMDecision` driver

`@RegisterClass(BaseDecision, 'LLMDecision')`, modelled on
`packages/AI/Reranker/src/LLMReranker.ts` — read it first; it is the exact shape.

It holds a promptID and an `AIPromptRunner` internally, renders the questions into a prompt,
executes, and maps the response into `DecisionResult`. Yes, this one *does* parse — that is the
point: it is the compatibility shim that lets everything downstream be written against
`BaseDecision` before any native provider exists.

Ship a companion prompt under `metadata/prompts/` bound to fast models (follow
`.sage-intent-check.json`'s `SelectionStrategy: Specific` + `PowerPreference: Lowest` + Cerebras/Groq
bindings).

### Task 1.5 — Decide the config carrier, and write the decision down

Both existing runners use `MJ: AI Prompts` rows as the configuration carrier — `AIModelRunner` reads
`prompt.Type === 'embedding'` today. Reusing it for decisions buys model bindings via
`AIPromptModel`, the config cascade, `AIPromptRun` telemetry, category and status for free.

**Recommendation: reuse it.** Note in the PR that the entity name is being stretched (it already is,
for embeddings) and that `TemplateID` is `NOT NULL` — which is fine for a decision, since you want a
template to render state.

### Phase 1 exit criteria

`AIDecisionRunner` + `LLMDecision` answer a Likelihood, a Choice and a Score against a real prompt,
write an `AIPromptRun` with cost, and are covered by unit tests. No vendor account required to build
or test.

---

## Phase 2 — Measure before trusting

**Goal:** decide whether a native provider earns its dependency, using MJ's own harness rather than
vendor claims.

### Task 2.1 — Add a decision arm to the eval harness

MJ already has a `Prompt Eval` test type: *"Evaluates a SINGLE model decision from frozen mid-loop
state. No action ever executes — the runner returns the model reply and deterministic oracles read
the decision off whichever channel it used (envelope or native tool calls). This is the corpus
workhorse for the envelope baseline and the native comparison."*

A decision channel is a **third arm on an experiment that already exists**. See
`metadata/test-types/.prompt-eval-test-type.json` and its `DriverClass: PromptEvalDriver`.

### Task 2.2 — Build the frozen corpus

Use Phase −1's corpus, promoted into MJ's harness so it reruns on every change rather than living in
a one-off script.

### Task 2.3 — `JevDecision` (only if Phase −1 recommended it)

`@RegisterClass(BaseDecision, 'JevDecision')`, plus its `AIModel` / `AIModelVendor` / credential
metadata. Benchmark against `LLMDecision` on the frozen corpus.

### Task 2.4 — Publish calibration, and set thresholds from data

Produce reliability curves for whichever driver wins. **Only after** that, fix the routing
thresholds (act / review / escalate). Do not copy the vendor's suggested numbers — derive yours.

### Phase 2 exit criteria

A documented recommendation with measurements behind it, and thresholds derived from your own
corpus. If the answer is "LLM-backed is good enough," record that and skip the provider.

---

## Phase 3 — Consumers, narrow and revertible

Each of these is independently valuable and independently reversible. Do them one at a time, behind
a config flag where practical.

### Task 3.1 — Collapse Sage's two-turn agent discovery *(recommended first)*

Today: turn 1 emits `Find Candidate Agents`, turn 2 reads five rows and picks one. Turn 2 is a pure
routing judgment — the prompt even spells out the rubric (*"score >0.7 = strong, 0.5–0.7 =
moderate"*), which is a `Choice` with a confidence threshold written longhand.

Meanwhile `ALL_AVAILABLE_AGENTS` — the permission-filtered catalog — is already placed into the
prompt data by `ConversationAgentRunner` and **no template references it**.

Replace the round trip with one `Choice` over the catalog plus a `Likelihood` asking *"does any
agent apply at all?"* so "none" stays expressible.

**Acceptance:** delegation reaches the same agent as before on a regression set, in one turn instead
of two. Measure both.

### Task 3.2 — Resurrect the Sage intent check

The prompt row, its template and its three model bindings are all still live in metadata; only the
call site is commented out. Restore it against its own recorded bar — it was removed at ~300ms, so
the replacement must be materially faster — and **restore `targetArtifactVersionId` targeting**,
which was lost as collateral.

Files: `packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts`
(the commented block and `checkContinuityIntent`),
`packages/Angular/Generic/conversations/src/lib/services/conversation-agent.service.ts`
(`checkAgentContinuityIntent`).

**Keep the deterministic fast path** — `ConversationUtility.ContainsFormResponse(message)` returns
`YES` with no model call at all. Cheap beats fast.

**Fix the stale contract while you are there:** `metadata/prompts/output/sage/check-intent.example.json`
declares only `continuesWith` and `reasoning`, while the template documents four fields. Since
`OutputExample` is what drives shape validation, `modifyingArtifact` and `targetArtifactVersionId`
are currently unvalidated.

### Task 3.3 — Wire `PayloadFeedbackManager`

`queryAgent` is fully implemented with zero call sites. `PayloadChangeAnalyzer` already does the
deterministic pre-filter, producing `severity` and `requiresFeedback`, which flows to telemetry and
triggers nothing.

Point it at `AIDecisionRunner` as a batched set of Likelihood questions and wire it to the existing
`requiresFeedback` signal. The reason it was never switched on was economics: an extra LLM round
trip per suspicious payload change. A batched typed call changes that arithmetic.

### Task 3.4 — Make `confidence` load-bearing

`LoopAgentResponse.confidence` is requested every turn and read by nothing. Flow state already
reserves `$confidence`. Once calibration is measured (Phase 2), wire a threshold: act above, flag
for review in the middle band, escalate below.

**Do not do this before Phase 2.** Gating control flow on an unmeasured number is the failure this
plan exists to fix — and note that `memory-manager-agent.ts` already does exactly that, gating
durable memory writes on `minConfidenceThreshold: 80` from a self-reported score. Fixing that is
part of this task.

---

## Phase 4 — Control flow

**Goal:** let a judgment gate control flow without costing a reasoning turn.

**Prerequisite: Task 0.8 must be done.** A judgment-capable condition that fails open silently is
strictly worse than a Boolean one.

### Task 4.1 — Understand what already exists before designing anything

`executeWhileLoop` already iterates server-side with a condition evaluated between iterations and
**zero LLM turns**. Net cost of an N-iteration loop is one turn to emit it and one to consume the
aggregate. The zero-turn lever is `addConversationMessage = false` on the body plus one aggregated
`loop-result` message at the end; `_promptTurnCount` only increments in `executePromptStep`, so a
whole loop ages the message-expiration clock by zero.

**So "FinishIf" is not new machinery. It is `While` with a condition language that can express a
judgment.** Today that condition sees exactly three roots — `payload`, `results`, `errors` — and is a
pure Boolean over them.

The nearest existing ancestor is `executeClientToolsStep`'s `terminateAfterExecution`: *"If the LLM
already declared taskComplete=true alongside the client tools, honor that intent now that tools have
executed — no need for another LLM call."* That is already "pre-declared intent, honoured after
execution, no model call." This generalises it from a pre-commitment to an evaluation.

### Task 4.2 — Judgment as a pre-resolved source, never an inline call

**Hard constraint:** `IConditionEvaluator.Evaluate` is synchronous, and `SafeExpressionEvaluator`
explicitly forbids async. Never call a model from inside condition evaluation.

The design that respects this: a judgment resolves as a **step**, writing its answers into the
condition context; the condition remains a synchronous pure expression over already-computed facts.

For task graphs that means one new root in `CONDITION_ROOTS`
(`packages/AI/CorePlus/src/task-graph/condition-roots.ts`) and a matching addition to
`BuildConditionContext` (`packages/TaskGraph/src/condition-gate.ts`). **Those two are pinned to each
other by test rather than by hope** — the files say so. Edit both.

This preserves the property the codebase fought for: unknown roots stay decidable at **submit** time
rather than at run time.

### Task 4.3 — `Decision` as a task-graph node kind

`packages/AI/CorePlus/src/task-graph/task-graph-spec.ts` states the extension contract: *"Adding a
kind is one entry in `TaskGraphNodeConfigMap` plus one runner — the compiler then forces every
exhaustive `switch` over kinds to be updated, which is the point of the union."*

Touch points: the `TaskGraphNodeKind` union, `TaskGraphNodeConfigMap`, the `TaskNode` factory, the
required-config table in `task-graph-validator.ts`, the runner dispatch in `TaskGraphDispatcher`,
and the persisted `MJTask.StepType` value list.

Inherited for free: XOR-correct routing via `exclusiveGroup`, hold-on-unevaluable, the skip cascade,
submit-time validation, and the gate-decision observability stream.

Use `AIAgentRunStep.StepType = 'Decision'` for telemetry — the value already exists in the enum.
Note it is currently written loosely by `AgentManager` for a "Sync Agent Spec" operation that is not
really a decision; pin the semantics as part of this task.

### Task 4.4 — Exhaustiveness checking *(the capability that is genuinely new)*

Today an `exclusiveGroup` has no notion of coverage. If no edge is satisfied and none is
unevaluable, **every edge loses and the fork silently ends the branch**. Adding an unhandled case is
invisible, because a condition is untyped truthiness over whatever JSON happened to land in the
payload.

A `Choice` enumerates its options **at author time**. So the compiler can verify that a group's
edges cover the option set, and `task-graph-validator.ts` can reject an incomplete fork at submit
time.

**This is the strongest argument for the whole feature** — it is not a speedup, it is a correctness
property the current condition dialect structurally cannot have. Lead with it in the PR.

### Task 4.5 — Give the three-valued gate a real source

`condition-gate.ts` already distinguishes `keep` / `drop` / `hold`, with the rationale *"'false' and
'cannot tell' must not share a branch… Holding is the only reading that costs nothing but time, and
time is recoverable."* Today the only way to produce "cannot tell" is to throw a `ReferenceError`.

A Choice whose confidence falls below threshold is that third value, arriving properly. Wire it:
below-threshold → `unevaluable` → the group holds rather than guessing.

---

## 5. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **State projection is the actual work** | These models degrade as state grows with content irrelevant to the question. The loop agent's context is the opposite of a narrow projection. Skipping this produces a bad measurement, not a bad feature. | Build a per-question projection for every consumer. Budget for it explicitly. Phase −1 measures with real payloads specifically to expose this. |
| **Channel effects are measured and real** | `loop-agent-type.ts` records that declaring native tools *"drops envelope output sharply, and on GPT 4.1-mini it reaches zero — the model answers through whichever channel it was given."* Adding a third decision channel is not neutral. | Every consumer change goes through the `Prompt Eval` corpus before and after. |
| **Phase 0 touches the hottest path in MJ** | A 6,366-line class becomes the middle of a three-level hierarchy. | Move-then-change in separate commits. Integration tier green before each merge. If the base accumulates chat-shaped concerns, switch to composition. |
| **Calibration is a vendor claim** | Thresholding on an unmeasured probability is the exact failure mode already live in `memory-manager-agent.ts`. | Phase 2 gates Phase 3.4. No threshold ships before a reliability curve. |
| **Adversarial input** | Decision models do not treat state as hostile by default; injected instructions inside the state can move the answer. | Do not place a decision on a security boundary without a separate threat review. Guardrails are the most tempting and riskiest consumer. |
| **Model jaggedness** | Documented weaknesses: literal reading of scoping words and negations, unreliable counting, weak numeric precision, difficulty with indirection. | Keep arithmetic and counting in code — `SafeExpressionEvaluator` exists for exactly that. Never ask a decision model "how many retries have we done." |
| **Single vendor, closed model** | Vendor risk, and no public leaderboard verification. | `BaseDecision` from day one; `LLMDecision` always works. Phase 1 ships with no vendor at all. |

---

## 6. Open decisions

Record the answer and the reasoning in the PR that settles each.

1. **Inheritance vs composition for Phase 0.** Current lean: inheritance — what is shared is a
   genuine template method ("resolve → credential → execute-with-failover → record," only the
   execute step varies), and the `RequiredModelType` declaration only reads cleanly under
   inheritance. Switch to composition if the base starts carrying chat-shaped concerns.
2. **`MJ: AI Prompts` as the config carrier for non-prompt calls.** Current lean: reuse. It already
   is, for embeddings.
3. **Absorb or delete `classify.types.ts`.** Must be settled in Task 0.4, not deferred.
4. **Whether `startAtStep` and flow-as-sub-agent become dispatcher features** before Task 0.7 cuts
   the walker.
5. **Phase 0 as one PR or a train.** Current lean: a train, base + `AIPromptRunner` re-parenting
   first, each modality behind it.

---

## 7. Appendix — file reference map

Paths are relative to the MJ repo root. Symbols are given rather than line numbers where possible,
because line numbers drift.

### Model primitives — `packages/AI/Core/src/generic/`
| File | Role |
|---|---|
| `baseModel.ts` | `BaseModel` (holds only an API key), `ModelUsage`, `MODEL_USAGE_UNIT_KINDS` |
| `baseLLM.ts` | `BaseLLM`, capability getters, the vestigial `ClassifyText` / `SummarizeText` |
| `baseReranker.ts` + `reranker.types.ts` | **The template for `BaseDecision`.** Read first. |
| `baseEmbeddings.ts`, `baseImage.ts`, `baseAudio.ts`, `baseVideo.ts`, `baseDiffusion.ts`, `baseRealtime.ts` | The other primitives |
| `classify.types.ts` | Vestigial classify surface — Task 0.4 |
| `modelConfiguration.ts` | The config bag and its cascade; the column-vs-bag rule |

### Runners — `packages/AI/Prompts/src/`
| File | Role |
|---|---|
| `AIPromptRunner.ts` | ~6,366 lines. The stack that moves down into the base. |
| `AIModelRunner.ts` | ~412 lines. Today: embeddings only. The name to claim, the body to retire. |
| `ParallelExecutionCoordinator.ts` | `extends AIPromptRunner`; the judge (`selectResultWithPrompt`) |
| `nativeToolCallingGate.ts` | `ResolveNativeToolCalling` — capability > policy > preference |

### Types — `packages/AI/CorePlus/src/`
| File | Role |
|---|---|
| `prompt.types.ts` | `AIPromptParams`, `AIPromptRunResult` (note `chatResult` is required) |
| `prompt.system-placeholders.ts` | `SystemPlaceholderManager`, runtime-extensible |
| `task-graph/task-graph-spec.ts` | `TaskGraphNodeKind`, `TaskGraphNodeConfigMap`, the extension contract |
| `task-graph/graph-traversal-engine.ts` | `IConditionEvaluator` (**synchronous**), `GraphEdge`, `SelectOutgoingEdges` |
| `task-graph/condition-roots.ts` | `CONDITION_ROOTS`, `UnknownConditionRoots` |
| `task-graph/task-graph-validator.ts` | Submit-time validation; where exhaustiveness checking goes |
| `__tests__/flow-differential.test.ts` | The differential oracle — read before Task 0.7 |

### Agents — `packages/AI/Agents/src/`
| File | Role |
|---|---|
| `base-agent.ts` | ~15,651 lines. `executeAgentInternal`, `executeWhileLoop` (Task 0.8), `executeForEachLoop`, `executeClientToolsStep` |
| `agent-types/loop-agent-type.ts` | `DetermineNextStep`, `isValidLoopResponse`, `describeFold` |
| `agent-types/loop-agent-response-type.ts` | The decision envelope, including the unused `confidence` |
| `agent-types/flow-agent-type.ts` | Task 0.7's deletion target |
| `agent-types/flow-graph-executor.ts` | The cutover seam and its warning comment |
| `PayloadFeedbackManager.ts` | Task 3.3 — implemented, zero call sites |
| `memory-manager-agent.ts` | Task 3.4 — gates on uncalibrated confidence today |
| `realtime/realtime-turn-moderator.ts` | A future consumer; already "one fast prompt, stateless classification" |

### Elsewhere
| File | Role |
|---|---|
| `packages/AI/Reranker/src/LLMReranker.ts` | **The template for `LLMDecision`.** Read first. |
| `packages/AI/Reranker/src/RerankerService.ts` | `getReranker()` — the driverClass branch to copy; no `AIPromptRun` today |
| `packages/MJGlobal/src/SafeExpressionEvaluator.ts` | The condition sandbox; forbids async |
| `packages/TaskGraph/src/condition-gate.ts` | `DecideGate`, `BuildConditionContext`, the three-valued rationale |
| `packages/AI/FormBuilder/core/src/agents/form-builder-agent.ts` | The "when routing is knowable, write code" precedent |
| `metadata/prompts/.sage-intent-check.json` | The hand-built System One call |
| `metadata/prompts/templates/sage/check-intent.template.md` | ~250 lines of prose for four fields |
| `metadata/ai-model-types/.ai-model-types.json` | Where the `Decision` row goes; `Realtime` is the example |
| `metadata/entities/JSONType-interfaces/IAIConfiguration.ts` | Lockstep partner of `modelConfiguration.ts` |
| `metadata/test-types/.prompt-eval-test-type.json` | The eval harness Phase 2 extends |
| `plans/agent-latency-optimization.md` | Where the intent check was priced and cut |

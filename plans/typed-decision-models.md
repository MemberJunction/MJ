# Typed Decision Models in MemberJunction

**Status:** In progress. Phase −1 is complete; Phases 0 and 1 are in review (see §0.1).
**Audience:** An engineer (with or without an AI coding agent) executing this end to end
**Owner:** Colin Brockman

---

## 0. Read this first

This plan has two halves that reinforce each other:

1. **A platform refactor.** Unify how MJ invokes *any* model behind one runner hierarchy, so model
   selection, credential resolution, failover and telemetry stop being reimplemented per modality.
   This ships value on its own and carries no AI risk.
2. **A new capability.** A *typed decision* model — one that returns enumerated answers with
   probabilities instead of text. The probabilities must be calibrated against MJ's labels before
   anything thresholds on them (§1). This only becomes affordable once (1) exists.

**Do Phases −1 to 2 in order.** Phase −1 can kill the second half cheaply; Phase 0 is a prerequisite
for everything after it. Phases 3 to 5 are candidates, taken one at a time in the order each phase
gives. Each phase is independently valuable and independently revertible.

**The scope widened on 2026-09-28.** The plan began with decisions inside the agent loop. Amith's
review makes the decision model a general *fast judgment* layer for MJ, reached three ways:
1. **Automatically.** The framework uses it where it already makes small judgments: memory
   selection, which actions, sub-agents and skills to show an agent, duplicate detection, and routing
   a chat message to an agent (Phases 3 and 4).
2. **Explicitly.** An author calls it as a step: a flow step, a task-graph node, or an action (Tasks
   1.6 and 4.3).
3. **In bulk.** A Knowledge Hub feature pipeline runs the same typed questions over every record in a
   collection (Phase 5).

Applications built on MJ, Skip among them, get the first route without code changes, and can take
the other two where they fit. §1 gives the outside evidence behind the new scope, and §3.7 gives the
pattern most of the new consumers share.

### 0.1 Progress and corrections (2026-09-28)

| Task | PR | State |
|---|---|---|
| −1 Feasibility spike | #4660 (this PR) | Done. Recommendation: native provider, with `LLMDecision` as the fallback, on three conditions (`plans/typed-decision-spike-results.md`). |
| 0.1 One speech-to-text model type | #4764 | Merged |
| 0.2 + 0.3 (1/4) Extract `BaseModelRunner`; delete dead failover code | #4767 | In review |
| 0.3 (2/4) Split the prompt-run lifecycle into a generic core and a chat hook | #4775 | In review, stacked on #4767 |
| 0.3 (3/4) Make the failover loop generic | #4777 | In review, stacked on #4775 |
| 0.3 (4/4) Enforce `RequiredModelType` | not yet opened | Reviewed and verified; stacked on #4777 |
| 0.4 Deprecate `ClassifyText` / `SummarizeText` | #4714 | Merged |
| 0.8 An unevaluable `While` condition fails | #4765 | In review |
| 1.1 `BaseDecision` | #4776 | In review |
| 1.2 The `Decision` model type and configuration section | #4811 | In review |
| 1.4 `LLMDecision` and its `LLM Decision` prompt | #4812 | In review, stacked on #4776. Live on Cerebras: about 400 ms and $0.0004 per decision. |

### 0.2 The wrap-up milestone (2026-09-28)

Amith asked for the Jev work to be finished first. The milestone is **"MJ agents can call Jev"**,
and it lands as one PR from `train/typed-decisions`, which merges the in-review PRs above.

| Piece | Task | What it gives |
|---|---|---|
| `AIDecisionRunner` | 1.3 | Model selection, failover and prompt-run telemetry for decisions |
| `OpenRouterDecision` | 2.3 | The native Jev driver, through OpenRouter's Decisions API, pinned to a dated version |
| `Run Decision` action | 1.6 | Agents and flows call a decision as a step |
| `finishIf` on actions and sub-agents | 4.6 | A loop agent ends its run after an action or sub-agent without another LLM turn |
| `decisions` in the loop response | 4.7 | A loop agent asks typed questions at no turn cost, as it uses scratchpad |
| Metadata | — | The `Jev` and `LLM Decision` models, the `Default Decision` prompt, the action |

**Amith's direction on loop agents:** "loop agents just having this available will start using it
like how they started using scratchpad." So Tasks 4.6 and 4.7 move out of Phase 4 and into the
milestone, and are **on by default** for loop agents, as scratchpad is. Their safety comes from the
design, not from being switched off:
- a gate can only end a run early, never start work;
- it needs every action to have succeeded and every answer to clear a high threshold;
- anything else takes today's path;
- every gate is logged as a `Decision` step, so its false-finish rate can be measured from
  production runs.

The Flow agent `Decision` step type (Task 4.3) remains a later phase. Until then, a Flow agent
calls the `Run Decision` action.


**What building Phase 0 corrected in this plan.** The sections below are updated to match.

- **The base is `BaseModelRunner`, not `AIModelRunner`.** `AIModelRunner` is the exported
  embeddings runner, so reusing the name would break its callers. §3.1 and Tasks 0.3, 0.5 and 1.3
  now use `BaseModelRunner`.
- **Task 0.2's target was dead code.** The failover path that compared type names had no callers.
  The live path already compared IDs. #4767 deletes the dead path and adds a test that failover
  never crosses model types.
- **Task 0.3 shipped as four PRs.** The last three split the chat-shaped code out of the base, and
  only the fourth changes behaviour. There is no abstract `executeOnModel`. The model call's 13
  chat arguments would have forced a chat-shaped context type onto the base. Instead,
  `executeWithFailover<TResult extends BaseResult>` takes the model call and the error result as
  callbacks.
- **Task 0.4's surface is live, so it was deprecated rather than deleted.** Legacy AI Actions still
  reach it (`AIEngine.ExecuteAIAction`, the MJQueue `AIActionQueue`). `SummarizeText` is real on
  OpenAI, Anthropic, Azure and Fireworks. `ClassifyText` is real only on Azure. Deletion waits for
  the next major version.
- **Task 0.7 is withdrawn.** Commit e3db74f7cf (#4555), merged after this plan's base was cut,
  made the in-run flow walker live again. A Flow agent run as a sub-agent defaults to
  `executionMode: 'inRun'`, as do API callers that opt in, `startAtStep`, and Skip's Conductor.
  Deleting the walker would break all of them. See Task 0.7.
- **A pre-existing bug, found while enforcing the type floor:** since 55caf06fa8 (2026-06-17),
  `ExecutePrompt` always pre-selects a model. So `executePromptInParallel` never reaches the
  `ExecutionPlanner`, and the `ModelSpecific` and `StaticCount` parallel modes run a single model.
  This needs its own issue.

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

### Outside evidence, and where ours disagrees

An independent synthesis, *Jev Loop Engineering for Coding Agents* (September 2026), collects
TypeSafe's documentation and LangChain's posts on Jev. It is not affiliated with either company.
Its strongest evidence is LangChain's judge experiment:
- **Setup:** five frozen runs of one weather agent, each judged 100 times against a human oracle.
- **Agreement with the oracle:** Jev matched on **500 of 500** pass/fail decisions, against 99.8%
  for GPT-5.6 Terra, 96.4% for GPT-5.6 Luna and 80.0% for Claude Sonnet 4.6.
- **Consistency:** Jev's quality-score variance was 92–913× lower than the others'.
- **Speed and cost:** 0.44 s and $0.00035 per call.

The synthesis states its own limits:
- five cases, one agent, one domain;
- the LLM judges ran on provider defaults;
- the Jev version was not recorded.

Three points bear on this plan:

- **Neither measurement came near the vendor's headline.** TypeSafe reports up to 200× faster and
  400× cheaper on classification tasks.
  - **LangChain measured** about 5× on latency, and between 1.1× (against Luna) and 80× (against
    Claude) on cost.
  - **Our spike measured** 1.5× on latency and about 11× on cost against GPT-OSS-120B on Cerebras
    (`plans/typed-decision-spike-results.md` §1).
  - **The cheap LLM lost on accuracy in both:** by 3.6 points there, and by 9.2 balanced-accuracy
    points here. **Lead with accuracy, not price.**
- **It disagrees with our spike on calibration.** The synthesis presents Jev's probabilities as
  calibrated by training, so that a threshold set in code "means something consistent". On MJ's
  own decision, Jev's raw probability ranked well (AUC 0.951) but was badly calibrated (ECE 0.28).
  Platt scaling on our own labels fixed it (ECE 0.072). **Set thresholds in code, on probabilities
  calibrated against MJ's labels. Never threshold the raw number.**
- **It adds a property this plan did not measure: repeatability.** A judge can be perfectly
  consistent and consistently wrong. Claude returned the same wrong verdict on the same case every
  time, which is how an 80% accuracy can sit on a flat line. Phase 2 now measures both (Task 2.1).

Its adoption order puts evaluation first. Evaluation is the one placement where a decision changes
nothing the agent does. This plan adopts that order as Task 3.0.

### Field reports from the first ten days

*The AI Daily Brief*, "How People Are Actually Using Jev" (2026-09-25; the episode and its written
summary), collects early public uses. They are demos and posts, not controlled measurements. They
matter here because they show where the model is being used.

**The limits they report.** Task 1.2's model config declares these per model:

| Property | Reported value |
|---|---|
| Question kinds | Choice (up to 255 options), Score (2 to 10 levels described in words), and a yes/no probability. TypeSafe calls the yes/no kind "Noul", short for Bernoulli; MJ calls it `Likelihood` (§2). |
| Batching | 13 questions in one call ran 12.2× cheaper and 10× faster than one at a time, with identical answers. This agrees with the spike: 7 questions at 252 ms p50, against 246 ms for 1. |
| Price and speed | $0.042 per million input tokens; output is free; 70–500 ms per call |
| Evidence size | Text under 32,000 tokens |
| Stated weak spots | Multi-step questions, arithmetic and dates, and reading intent. It also has consistency limits. |

**Where people use it:**
1. **Analysing a collection.** The same questions are asked of every item, and the answers are
   counted. For example: 724 ads × 12 questions in 40 s for 9 cents.
2. **Searching by meaning.** Records are filtered on properties no index holds, such as
   architectural style or "is this about AI research timelines".
3. **Triage and routing.** "What is this, and where does it go?" Examples include inbox priority,
   lead scoring, incident severity and moderation.
4. **Checking work against rules.** Examples are evals, and a style guide turned into yes/no
   questions per paragraph. In one writing test Jev caught 6 of 7 planted mistakes, against 7 of 7
   for Fable 5.1, at about 1/580th of the cost. Against a frontier LLM, then, it gives up a little
   accuracy for a large saving. Against the small, fast LLM in our spike, it gave up none (see above).
5. **Speeding up agents.** Examples:
   - choosing a reasoning effort per step (reported to cut costs 50%);
   - putting only the matching skill into an agent's context (reported to cut tokens 88%);
   - moving repeated steps from LLM calls to code.
6. **Responding instantly.** For example, "smart paste" maps pasted text to form fields and keeps
   only confident matches.

**Four tests of a good decision task.** A task qualifies only if all four hold:
- the possible answers can be written down in advance;
- there is volume, as a pile or a stream;
- a wrong answer is cheap or easy to catch;
- the evidence fits as text under the driver's state limit.

§3.6 adds these as rule 7. **Question design** follows the same source: one judgment per question,
every Score level described in words, and a hand-labelled test (they suggest 50 items) before
production.

**The warning, in their words:** "a judgment model shouldn't be left to judge alone." A score for
hiring, money or security has no reasoning attached, which argues for sending borderline cases to an
LLM or a person. §3.6 rule 8 makes this a requirement.

**Not one vendor.** A fine-tuned small Gemma 4 model is reported to perform similarly. This
strengthens the case for `BaseDecision` over a Jev-shaped API. An open-weights driver could also
reach the browser-local 20–50 ms that the Sage intent check's comments name as the bar for bringing
it back (Task 2.5).

---

## 2. Vocabulary

Use these terms consistently in code, comments and PR descriptions.

| Term | Meaning |
|---|---|
| **Primitive / driver base class** | An abstract class in `packages/AI/Core/src/generic/` that defines what a *kind* of model does. E.g. `BaseLLM`, `BaseEmbeddings`, `BaseReranker`. New: `BaseDecision`. |
| **Driver** | A concrete `@RegisterClass(BasePrimitive, 'DriverName')` implementation, usually one per vendor. E.g. `CohereReranker`, `LLMReranker`. |
| **Model type** | A row in `MJ: AI Model Types`. The data-level classification used to filter which models a given call may use. |
| **Runner** | A class in `packages/AI/Prompts/src/` that orchestrates a model call: selection, credentials, failover, execution, telemetry. New base: `BaseModelRunner`. |
| **Decision** | A call that takes a *state* plus one or more typed *questions* and returns enumerated answers with probabilities. Produces no free text. |
| **Likelihood** | A decision question with a yes/no answer, returning `P(yes)` in `[0,1]`. The probability **is** the confidence — there is no separate confidence field. |
| **Choice** | A decision question that selects one label from an enumerated set, returning the label, per-option probabilities, and a confidence. |
| **Score** | A decision question that places the state on an ordered rubric, returning a continuous value, per-level probabilities, and a confidence. |
| **Calibration** | The property that stated probabilities match observed frequencies. Among answers given 0.9, about 90% should be correct. Untested calibration is a vendor claim, not a property. |
| **Repeatability** | How often two calls on identical state return the same verdict. It is distinct from accuracy: a judge can be perfectly repeatable and consistently wrong. |
| **Signal value** | Agreement with human labels × repeatability. LangChain's measure for comparing judges. It penalises a judge that is stable but wrong. |
| **Narrowing** | Shrinking a candidate set before an LLM or a person sees it: retrieve widely, judge each candidate with a decision, and present the few that pass (§3.7). |
| **Decision gate** | A set of decision questions written in advance, together with what each answer means for control flow. It is evaluated later, when its state exists, for example after an action returns (Task 4.6). |
| **Pipeline type** | A kind of Knowledge Hub feature pipeline, backed by a driver class: `LLM` today, `Decision` next (Phase 5). |

### A note on naming

The vendor whose model prompted this work calls the yes/no primitive a **"Noul"** (short for
Bernoulli). **Do not use that name in MJ.** It is a vendor coinage, and the entire point of the
`BaseDecision` abstraction is that it outlives any one vendor — the same reason MJ says `BaseReranker` rather than `BaseCohereRerank`.
Use `Likelihood`, `Choice`, `Score`, and map vendor vocabulary at the driver boundary.

---

## 3. Target architecture

### 3.1 Runner hierarchy

```
BaseModelRunner (new, abstract)
│   Owns:
│     • candidate building, filtered by RequiredModelType
│     • credential hierarchy resolution
│     • execution bounds (timeout + cancellation)
│     • failover orchestration and error classification:
│       executeWithFailover<TResult>(…, executeOnCandidate, createErrorResult)
│     • MJ: AI Prompt Runs lifecycle (createRunRecord / finalizeRunRecord, with
│       callbacks for modality-specific fields), tokens, cost, telemetry
│   Declares: public abstract get RequiredModelType(): string
│
├── AIPromptRunner          RequiredModelType = 'LLM'
│   └── ParallelExecutionCoordinator   (existing subclass, unchanged)
├── AIDecisionRunner        RequiredModelType = 'Decision'
├── AIEmbeddingRunner       RequiredModelType = 'Embeddings'
├── AIRerankerRunner        RequiredModelType = 'Reranker'
├── AIImageGenerationRunner RequiredModelType = 'Image Generator'
├── AITextToSpeechRunner    RequiredModelType = 'TTS'
├── AISpeechToTextRunner    RequiredModelType = 'Speech to Text'   ← Task 0.1's survivor
└── AIVideoRunner           RequiredModelType = 'Video'
```

As built, the base holds no chat types. A subclass supplies the model call and its error result as
callbacks to `executeWithFailover`, rather than overriding an abstract `executeOnModel` (§0.1).

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
  ├── JevDecision   @RegisterClass(BaseDecision, 'JevDecision')   — native provider, Phase 2
  └── (open-weights driver, optional)                             — self-hosted or local, Task 2.5
```

This mirrors `BaseReranker` / `LLMReranker` / `CohereReranker` exactly, which is the proven in-repo
pattern for "same capability, purpose-built model or LLM fallback, chosen by metadata."

### 3.6 What decides what — rules for every consumer

| Work | Belongs to | Why |
|---|---|---|
| Write, plan, explain, generate code | LLM | Open-ended generation |
| Arithmetic, counting, parsing, validation | Code | Deterministic and free (`SafeExpressionEvaluator`) |
| Route, classify, gate, judge: a small, known answer space | Decision | Bounded answer; one typed call |
| Irreversible or high-stakes action | Human | Accountability |
| A novel judgment with no rubric | LLM + human | No stable scale to score against |

Rules for every consumer in Phases 3 to 5:

1. **Separate criteria are separate questions.** "Is the answer correct, grounded and complete?" is
   three Likelihoods. Combine them in code, where the weighting is visible. This is not the same as
   breaking *one* judgment into sub-signals; for that, see the spike's correction to Task −1.3.
2. **Batch per state.** Every question about one snapshot travels in one call. The spike measured
   seven questions at 252 ms p50, against 246 ms for one. Questions cannot read each other's
   answers, so a question that needs a tool's result waits for the tool.
3. **Rebuild the options on every call.** Build a Choice's options from the agents, actions or
   models that exist and are permitted *now*. A menu cached from an earlier turn picks from a world
   that has since changed.
4. **Identifiers carry no meaning.** A question key or option value is a label for code. TypeSafe's
   guidance is that Jev never sees the question key. Everything the model needs goes in
   `instructions` and the option descriptions.
5. **Keep the probabilities.** Persist every answer with its full distribution (Task 1.3). Then a
   bad outcome shows whether the decision was confident and wrong, or close and unlucky.
6. **A decision reads state; it does not verify effects.** A confident "done" cannot prove that a
   record was saved or a message sent. Check outcomes in code.
7. **Pass the four tests before choosing a decision** (§1, field reports):
   - the answers can be written down in advance;
   - there is volume;
   - a wrong answer is cheap or easy to catch;
   - the evidence fits under the driver's state limit.

   A consumer that fails any of them is LLM work.
8. **Do not leave a decision to judge alone where a wrong answer is costly.** For money,
   permissions or people, a decision may narrow, rank or flag. Borderline cases go to an LLM or a
   person, with the probabilities attached.
9. **Write every Score level as a description.** A level such as `"blocked: no workaround exists"`
   is what the model reads (rule 4); a level such as `"4"` gives it nothing. The same holds for
   Choice option descriptions.

### 3.7 The narrowing pattern

Most of the consumers added on 2026-09-28 share one pattern: **retrieve widely, judge each
candidate, present few.**

```
candidates  ──(1) retrieve──►  top N   ──(2) judge──►  survivors  ──(3) present──►  LLM / UI / person
permissions,                  vector       decision:                 only what the
filters, catalog              search       one call                  judgment kept
```

1. **Retrieval supplies recall.** Vector search, filters and permissions stay exactly as they are.
   They are cheap and fast, but they rank by similarity, not by fitness for the task.
2. **The decision supplies precision,** in one of three shapes:
   - **Many candidates, keep several:** one call, with the request as the state and one Likelihood
     per candidate ("Is this memory relevant to the request?"). The questions run in parallel, so
     each added candidate costs tokens but little time (§3.6 rule 2), up to the model's
     questions-per-call limit (Task 1.2).
   - **Many candidates, pick one:** one Choice over the candidates, with up to 255 options, plus a
     Likelihood for "does any apply?". Agent routing is this shape.
   - **Many items, the same questions:** one call per item, with the item as the state. This is bulk
     analysis (Phase 5).
3. **Presentation shows only the survivors,** in probability order.

**Three rules specific to narrowing:**
- **Fail toward inclusion.** If the decision call fails, times out or returns a probability in the
  unsure band, present the retrieval result unchanged. That is today's behaviour. Narrowing is an
  optimisation, not a gate, so its failure must never hide something the LLM needed.
- **Snap into existing sockets.** Where a reranker already sits at step 2, add the decision as a
  `BaseReranker` driver (`DecisionReranker`, Task 3.6). Its score is the Likelihood's probability.
  After one small change in `RerankerService`, reranker consumers switch by configuration.
- **Label behaviourally.** Take the labels from what the un-narrowed system actually used, such as
  the actions an agent called with the full list in view. A label is only valid if the system being
  replaced did not make that choice itself (Task 3.9 shows how routing traffic fails this test). Then measure recall: how often narrowing
  would have hidden something that was needed. A narrowing step that loses recall saves tokens by
  producing wrong answers.

---

## 4. Non-goals

State these in the PR description. Scope creep here is expensive.

- **No new in-run graph executor.** MJ already has two traversal paths: the dispatcher, and the
  in-run flow walker that #4555 revived (Task 0.7). Building another would produce a third
  implementation of traversal rules — the exact drift the convergence work existed to end.
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

> **As built (#4767):** the name-string filter below was dead code; `buildFailoverCandidates` had no
> callers, and the live path already compared IDs. The PR deletes the dead path and adds a test that
> failover never crosses model types.

There are four places that filter model candidates by type. Three compare `AIModelTypeID` by ID;
the failover path resolves the type row and then compares **name strings** off a denormalised view
column. Make it compare IDs like the other three.

**File:** `packages/AI/Prompts/src/AIPromptRunner.ts` — find `selectFailoverCandidates` and the
block that builds `targetTypeName` / filters `aiEngine.Models` on `m.AIModelType`.

**Acceptance:** all four filter sites compare by `AIModelTypeID` using `UUIDsEqual`. Add a unit test
that a failover candidate list excludes models of a different type.

### Task 0.3 — Create the abstract base and re-parent `AIPromptRunner`

**This is the load-bearing task. Read this whole section before starting.**

> **As built, as four PRs** (§0.1):
> 1. #4767 moves the shared stack into `BaseModelRunner`, unchanged.
> 2. #4775 splits the prompt-run lifecycle into a generic core (`createRunRecord` /
>    `finalizeRunRecord`) and chat hooks.
> 3. #4777 makes the failover loop generic: `executeWithFailover<TResult extends BaseResult>`, with the
>    model call and the error result passed as callbacks.
> 4. A fourth PR enforces `RequiredModelType`.
>
> The first three change no behaviour. A prompt-run equivalence harness shows 0 of 16 scenarios
> differ, and the integration tier is 70/0/8 on each PR. Two departures from the design below:
> - the base is named `BaseModelRunner`;
> - there is no abstract `executeOnModel`.

**Direction of the refactor: pull down, do not extend up.** Today's `AIModelRunner` is the *weaker*
implementation — it resolves models by name string, falls back to "smallest `InputTokenLimit`"
instead of `PowerRank`, skips the `IsInferenceProvider` check, calls `GetAIAPIKey` directly rather
than the credential hierarchy, and has no failover at all. Its body retires in Task 0.5. Its name
stays, because it is exported and has callers.

1. Create `packages/AI/Prompts/src/BaseModelRunner.ts` as a **new abstract class**.
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

   ```
   The one varying step, invoking the resolved model, is a callback the subclass passes to
   `executeWithFailover`, not an abstract method (§0.1).
4. `AIPromptRunner extends BaseModelRunner` with `RequiredModelType => 'LLM'`, retaining everything
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

> **As built (#4714, merged):** deprecated, not deleted. The surface is live, reached through legacy
> AI Actions (`AIEngine.ExecuteAIAction`, the MJQueue `AIActionQueue`). `SummarizeText` is real on
> OpenAI, Anthropic, Azure and Fireworks, and `ClassifyText` is real on Azure. Both carry
> `@deprecated`, pointing callers at an AI Prompt run through `AIPromptRunner`. Deletion waits for
> the next major version. Once `AIDecisionRunner` ships, it is the replacement for classification.

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

1. `AIEmbeddingRunner extends BaseModelRunner`, `RequiredModelType => 'Embeddings'`, exposing
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
- `packages/AI/Prompts/src/AIModelRunner.ts` (the old body itself). Its exported name stays for
  existing callers: make it delegate to `AIEmbeddingRunner`, and mark it `@deprecated`.

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

### Task 0.7 — Delete the legacy in-run flow walker *(withdrawn)*

> **Withdrawn, 2026-09-25.** Commit e3db74f7cf (#4555), merged 2026-09-17 after this plan's base was
> cut, made the in-run walker live again (`FlowExecutionMode = 'dispatch' | 'inRun'` in
> `flow-agent-type.ts`). These run it today:
> - Flow agents run as sub-agents, which default to `'inRun'`;
> - API callers that opt in;
> - `startAtStep`;
> - Skip's Conductor.
>
> Deleting the walker would break all of them. The analysis below is kept as the record of why the
> task existed. The replacement question is whether the dispatcher should absorb those callers. That
> is a design task for the flow owners, not a cleanup, and nothing in Phases 1–5 depends on it.

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

> **As built (#4776):** the types use PascalCase members (`Kind`, `Instructions`, `Options`,
> `Value`, `Description`, `Levels`, `State`, `Questions`), following the naming-conventions gate. The
> extension point is `DoDecide`, with `ValidateParams` and `ValidateAnswers`. The sketch below keeps
> its original casing.

Create `packages/AI/Core/src/generic/baseDecision.ts` and `decision.types.ts`, modelled closely on
`baseReranker.ts` / `reranker.types.ts` — read those first; they are 60 and ~100 lines and are the
template.

```ts
export type DecisionQuestion =
    | { kind: 'Likelihood'; instructions: string }
    | { kind: 'Choice'; instructions: string; options: Array<{ value: string; description: string }> }
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

**Option descriptions are required.** `value` is an identifier for code; `description` is what the
model reads (§3.6, rule 4). A driver may render keys and values, but no driver may depend on them for
meaning. That way `LLMDecision` and `JevDecision` answer the same question.

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

   **Set them per model, from the vendor's published limits.** For Jev:
   - 255 options per Choice;
   - 2 to 10 levels per Score;
   - 32,000 tokens of state (§1, field reports).

   `BaseDecision.ValidateParams` (#4776) checks shape and minimums: a non-empty state, at least one
   question, instructions, known kinds, at least two unique options (each with a description) or
   levels. It checks no maxima. Those belong to the model, not the primitive, so `AIDecisionRunner` checks them
   against the resolved model's bag **before** the call. An oversized request fails with a message
   naming the limit, rather than being truncated silently. A consumer with more than 255 candidates
   narrows first (§3.7).

3. Optionally add a `Decision` row to `metadata/prompt-types/.prompt-types.json` — but know that
   **prompt type is decorative**: `AIPromptRunner` never reads `TypeID` or `Type`, and the only
   consumer repo-wide is the embedding lookup. It buys nothing by itself.

**Order of operations:** `mj sync push` **then** `mj codegen`. Reversing these regenerates from
stale JSONType definitions and silently drops properties.

### Task 1.3 — `AIDecisionRunner`

`extends BaseModelRunner`, `RequiredModelType => 'Decision'`.

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

**Persist the whole answer, not just the winner** (§3.6, rule 5):
- Write each answer's full distribution into `AIPromptRun.Result` as JSON.
- Write the vendor's resolved model version into `ModelSpecificResponseDetails`.

Both columns exist today, so no migration is needed. The version matters: during the spike, the alias
`~typesafe/jev-latest` resolved to the dated `typesafe/jev-1.13-20260917`. A run that records only
the alias cannot be reproduced.

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

Phase 5 leans on this choice too. The Feature Pipelines cache keys on a `PromptID` (NOT NULL). A
decision pipeline that points at a decision prompt row keeps the cache and its version hash working
unchanged.

### Task 1.6 — Make a decision callable as a step

Amith's second route (§0) is for authors who want a decision **explicitly**, as a named step in a
flow, rather than waiting for the framework to use one. Before the task-graph node kind (Task 4.3),
the cheapest way to support that is a thin Action.

- **`Run Decision` action.** Its inputs are a decision prompt (by ID or name) and a `State` (text or
  JSON). Its output is the answers as `BaseDecision` returns them:
  - a Likelihood's `Probability`;
  - a Choice's `Value`, `Confidence` and `Probabilities`;
  - a Score's `Value`, `Confidence` and `Probabilities`. The body is one `AIDecisionRunner` call. Per `packages/Actions/CLAUDE.md`, actions are
  boundaries for agents and flows, not internal APIs. This is that boundary, and code-to-code
  callers use `AIDecisionRunner` directly.
- **Flow agents branch on it at once.** A flow step runs the action, and its `ActionOutputMapping`
  puts the answers into the payload. The outgoing paths' conditions then read them, for example
  `payload.decision.route.Value == 'billing'` or
  `payload.decision.refund.Probability >= 0.8`. This needs no new flow machinery.
- **Thresholds wait for calibration.** A threshold a flow author types into a path condition is
  still a threshold, so the same rule applies: it is set against calibrated probabilities
  (Task 2.4). Until then, flows route on a Choice's or Score's `Value`, and a Likelihood, which has
  no `Value`, is information only.
- **Loop agents can call it as a tool.** That is legal, but it spends an LLM turn to request the
  decision. The turn-free route for a loop agent is Task 4.6; Task 4.2 is the task-graph one.

**Acceptance:** a flow agent in the test metadata routes on a Choice from `Run Decision`, using
`LLMDecision`, with no vendor account.

### Phase 1 exit criteria

`AIDecisionRunner` + `LLMDecision` answer a Likelihood, a Choice and a Score against a real prompt,
write an `AIPromptRun` with cost, and are covered by unit tests. A flow step can call one through
`Run Decision`. No vendor account required to build or test.

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

**Measure repeatability, not only accuracy.**
- **Repeat each case.** Run each frozen case many times; LangChain used 100 repeats per case.
- **Report both.** Give per-case variance and repeatability beside agreement with the labels
  (signal value, §2).
- **Fix the LLM arms' sampling.** Run every LLM arm with temperature and seed fixed. LangChain ran
  its LLM judges on provider defaults and names that as a limit of its own result.

Phase −1 called each item once per arm, so this is new measurement, not a rerun.

### Task 2.2 — Build the frozen corpus

Use Phase −1's corpus, promoted into MJ's harness so it reruns on every change rather than living in
a one-off script.

### Task 2.3 — `JevDecision` (only if Phase −1 recommended it)

`@RegisterClass(BaseDecision, 'JevDecision')`, plus its `AIModel` / `AIModelVendor` / credential
metadata. Benchmark against `LLMDecision` on the frozen corpus.

Two choices to make and record:
- **Access path.** The spike reached Jev through OpenRouter's alpha Decisions API. A direct TypeSafe
  connection removes one hop (spike results §8).
- **Version pinning.** Bind a dated model ID in the vendor metadata rather than a `-latest` alias.
  If you do use the alias, the resolved version on every run (Task 1.3) is the only record of what
  answered.

### Task 2.4 — Publish calibration, and set thresholds from data

Produce reliability curves for whichever driver wins. **Only after** that, fix the routing
thresholds (act / review / escalate). Do not copy the vendor's suggested numbers — derive yours.
Expect to need calibration: on the spike corpus, Jev's raw probabilities had an ECE of 0.28.

### Task 2.5 — An open-weights driver *(optional; take it when a candidate model is published)*

A fine-tuned small Gemma 4 model is reported to answer typed decisions about as well as Jev (§1).
If one is published with weights, it tests the vendor-neutral claim `BaseDecision` rests on, and it
opens two placements Jev cannot reach:
- **Self-hosted,** for installations that cannot send state to an outside API.
- **Browser-local.** The Sage intent check was cut because it cost ~300 ms, and its comments say it
  can return once browser-local inference reaches 20–50 ms (§1). A small local model is the only
  route to that number.

Build it as a third `BaseDecision` driver, behind the same metadata as the others. Benchmark it on
the frozen corpus (Task 2.2) with the same arms and the same calibration check (Task 2.4). A
repeatable model is not yet an accurate one (§2, signal value).

### Phase 2 exit criteria

A documented recommendation with measurements behind it, and thresholds derived from your own
corpus. If the answer is "LLM-backed is good enough," record that and skip the provider.

---

## Phase 3 — Consumers, narrow and revertible

Each of these is independently valuable and independently reversible. Do them one at a time, behind
a config flag where practical.

### Task 3.0 — A decision-backed judge oracle *(recommended first)*

Evaluation comes first. It is the one placement where a decision changes nothing the agent does,
so it can be measured against human labels before it is trusted with anything that acts.

MJ already has the socket:
- **`LLMJudgeOracle`** (`packages/TestingFramework/Engine/src/oracles/LLMJudgeOracle.ts`, type
  `llm-judge`) sends a list of criteria to an LLM. It asks for a 0–1 score and an explanation per
  criterion, then parses the JSON that comes back.
- **`AgentEvalDriver`** weights that oracle against the deterministic ones.

Add a sibling oracle, `decision-judge`. Register it next to `LLMJudgeOracle`, in the `TestEngine`
call `this.RegisterOracle(new LLMJudgeOracle())`. Then:
- Each criterion becomes one Likelihood question against the same trace, all in one call (§3.6,
  rules 1–2).
- The pass threshold lives in the oracle's config, not in the prompt.
- Per-criterion probabilities go into the oracle's result.

**Acceptance:**
1. Hand-label a set of agent-eval runs and freeze them. Start with 50–100.
2. Run `decision-judge` and `llm-judge` side by side on those runs.
3. For both judges, report agreement with the labels, repeatability across repeated runs
   (Task 2.1), latency and cost.

It changes no agent behaviour, so it is the safest place to learn how the decision model behaves on
MJ's data. It then becomes the instrument that measures Tasks 3.1–3.5.

### Task 3.1 — Collapse Sage's two-turn agent discovery *(first of the consumers that change behaviour)*

Today: turn 1 emits `Find Candidate Agents`, turn 2 reads five rows and picks one. Turn 2 is a pure
routing judgment — the prompt even spells out the rubric (*"score >0.7 = strong, 0.5–0.7 =
moderate"*), which is a `Choice` with a confidence threshold written longhand.

Meanwhile `ALL_AVAILABLE_AGENTS` — the permission-filtered catalog — is already placed into the
prompt data by `ConversationAgentRunner` and **no template references it**.

Replace the round trip with one `Choice` over the catalog plus a `Likelihood` asking *"does any
agent apply at all?"* so "none" stays expressible.

Build the Choice's options from that permission-filtered catalog on **every** call, never from a
cached list (§3.6, rule 3). Each option's description is the agent's description, not its name
(rule 4).

**Acceptance:** delegation reaches the same agent as before on a regression set, in one turn instead
of two. Measure both.

### Task 3.2 — Resurrect the Sage intent check

> **Generalised by Task 3.9.** Rather than a yes/no on "continue with the last agent", Task 3.9 asks
> one Choice over every agent in the conversation. Do this task as part of that one; the notes
> below still apply.

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

### Task 3.5 — Later candidates, in adoption order

These are candidates, not commitments. Take them in this order, because the cost of a wrong
decision rises down the list.

1. **Online evaluation.**
   - What: once `decision-judge` agrees with human labels (Task 3.0), run it on a sample of
     production agent runs to detect drift.
   - Caution: resample that agreement whenever the agent or its prompt changes. A cheap judge that
     is wrong produces bad feedback cheaply.
2. **The computer-use judge.**
   - Socket: `packages/AI/ComputerUse/src/judge/` has `BaseJudge`, implemented by `LLMJudge`,
     `HeuristicJudge` and `HybridJudge`. Each returns `Done`, `Impossible`, `Confidence` and
     per-criterion verdicts, on every step.
   - What: `Done` and `Impossible` are Likelihoods; `Feedback` is prose. A decision-backed judge
     answers the first two, and calls the LLM only for feedback when the run continues.
3. **Model-tier and effort routing.**
   - What: a Choice over model tiers, or a Score for difficulty, read from the latest request.
   - Socket:
     - The answer feeds the existing `AIPromptParams.override` (model and vendor),
       `configurationId`, or `effortLevel`.
     - Today `BaseAgent.preparePromptParams` resolves `effortLevel` on every prompt step, but from
       inputs that don't change: the runtime param, then the agent's default, then the child
       prompt's. So every step of a run gets the same effort.
     - A per-step Score placed before that block could raise effort when the agent is stuck, and
       lower it for routine steps. The field reports describe exactly this, with costs reported
       50% lower (§1).
   - When it's worth it: MJ already routes by metadata (`SelectionStrategy`, `PowerPreference`).
     A per-request router only pays where one prompt serves requests of very different difficulty.
   - Acceptance: spend falls on the Prompt Eval corpus with no loss of quality. Record the choice's
     probabilities on the run, so that a mis-route shows how close it was.
4. **A pre-execution action guard.**
   - When: last, and only after the threat review the risk table requires.
   - Socket: `BaseAgentType.PreProcessActionStep` is in the right place; `BaseAgent` calls it
     before any action runs.
   - Warning: **its contract fails open.** If it throws, `BaseAgent` logs the error and runs the
     actions unmodified. A guard needs a fail-closed path, where a failed or unevaluable check
     blocks or escalates.
   - Limits: a guard may only subtract. It may block or escalate, but never grant what permissions
     deny, and it must never be the only control.
5. **Relevance-based compaction.**
   - Today: `ConversationCompactionManager` builds a durable summary with a prompt.
   - What: a Score per older turn could drop irrelevant tool output before summarising.
   - Evidence so far: a demo (a near-1M-token session compacted to 86K in about a second), not a
     measurement. Measure it against the compaction layer's own tests (IT30) first.
6. **Selecting content in the UI.** Decide which records, cards or suggestions a screen shows
   first for this user and task. It is the narrowing pattern (§3.7) with a person as the reader. A
   wrong answer costs a scroll, so it can come early once Task 3.6's `DecisionReranker` exists.
7. **Smart paste.** Split pasted text (an email, a resume, meeting notes) into fragments. Then ask
   one Choice per fragment over the form's fields, with "none" as an option, and fill only the
   confident matches. The socket is the runtime entity-form components. (`packages/AI/FormBuilder`
   holds agents that author forms, not a layer that fills them.) The rule is to fill, never save: a
   person reviews before anything is written.

### Narrowing consumers *(added 2026-09-28)*

Tasks 3.6 to 3.9 apply the narrowing pattern (§3.7). Each one **fails toward today's behaviour**, so
they carry less risk than Tasks 3.1 to 3.4. They can start once Task 3.0 has shown that the model
agrees with labels on MJ's data, and they run in parallel with Tasks 3.1 to 3.4.

### Task 3.6 — Agent memory selection: a `DecisionReranker`

**Today.** Each agent run injects notes and examples in parallel with other setup:
- `BaseAgent.Execute` calls `InjectContextMemory`, which calls
  `AgentMemoryContextBuilder.InjectContextMemory`, which calls
  `AgentContextInjector.GetNotesForContext`.
- **Notes:** vector search (`AIEngine.FindSimilarAgentNotes`, minimum similarity 0.5) fetches
  `MaxNotesToInject × retrievalMultiplier` candidates. `RerankerService.RerankNotes` then scores
  them with the `BaseReranker` driver named by the agent's `RerankerConfiguration`, and keeps those
  at or above `minRelevanceThreshold`. Only Sage configures a reranker today: Cohere `rerank-v3.5`,
  30 candidates down to 10.
- **Examples** (`getExamplesViaSemanticSearch`) have **no second stage at all**.

**Change.** Add `@RegisterClass(BaseReranker, 'DecisionReranker')` in `packages/AI/Reranker`, next
to `LLMReranker`.
- It makes one `AIDecisionRunner` call: the agent's input is the state, and each candidate is a
  Likelihood question ("Does this note bear on the request?").
- Its `relevanceScore` is the probability.
- **`RerankerService.GetReranker` needs one change.** Today only `driverClass === 'LLMReranker'`
  receives a prompt ID and a user. Every other driver takes the "standard reranker" path, which
  needs an API key (`GetAIAPIKey`) and constructs the driver with `(apiKey, apiName)` alone. Give
  `DecisionReranker` the prompt-backed branch too, by generalising that branch, not by adding a
  second name check.
- **Then an agent opts in** by pointing `RerankerConfiguration.rerankerModelId` at a model whose
  driver is `DecisionReranker`. The injector does not change.
- **Search Scopes use a separate hierarchy.** Their reranker (`SearchEngine.runReRanker`) takes the
  search package's own `BaseReRanker` adapter, chosen by `ScopeConfig.reRanker.driverClass`. A thin
  adapter subclass wrapping `DecisionReranker` lets pre-execution RAG use it too.

Then add the missing stage to examples: the same driver, behind the same `RerankerConfiguration`.

**Two things to verify first:**
- **The model's questions-per-call limit** (Task 1.2). If it is below the candidate count, split
  the candidates across parallel calls.
- **Whether question text counts toward the state limit.** Each candidate note is carried in its
  question.

**Acceptance.**
1. Freeze a set of (input, 30 candidates) pairs from Sage runs, and hand-label relevance.
2. Compare `DecisionReranker`, Cohere and no reranker on recall and precision at 10, latency, and
   cost.
3. `minRelevanceThreshold` becomes a probability threshold, so set it from calibration (Task 2.4).
4. Every rerank now writes an `AIPromptRun` through `AIDecisionRunner`. That closes §1's "no cost
   telemetry" gap on this path.

### Task 3.7 — Narrow the actions, sub-agents and skills an agent sees

**Today, every agent sees its whole catalog on every turn.** `BaseAgent.gatherPromptTemplateData`
calls `buildAgentBaseCatalog`, which is cached per agent.
- It lists all active `AIAgentAction` rows, all active child agents and related agents, and the
  permitted skills.
- The only narrowing is static or caller-driven: `ExecuteAgentParams.actionChanges` and
  `subAgentChanges`, and `AcceptsSkills` with permissions.
- There is no tool-count cap.
- `Find Candidate Actions` / `Find Candidate Agents` are tools the LLM must spend a turn to call.
  They do not narrow anything automatically.

**Change.** Narrow the **presentation** of the catalog, not the permission to use it:
- **Where.** `buildAgentBaseCatalog` already formats the action and sub-agent details, and
  `gatherPromptTemplateData` reuses them unchanged when the run has no overrides. So:
  1. Narrow the cached lists with one call that asks a Likelihood per action and per sub-agent
     against the run's request.
  2. Re-format the narrowed lists the way the `actionChanges` override path already does.
  3. Cache the result per run. `gatherPromptTemplateData` runs on every step, so without the cache
     it would narrow again every turn.
- **Where the size limit goes.** `maxActionsInPrompt` / `maxSubAgentsInPrompt` are declared in
  `loop-agent-prompt-params.ts` (default −1) and read by nothing. They are the natural switch for
  "only narrow a large catalog".
- **Skills.** They are computed per step, outside the catalog. Use the hook that already exists:
  override `filterAvailableSkills(…, purpose: 'catalog', …)`. **Its contract fails closed:** an
  error means no skills at all. So the override must catch its own errors and return the skills it
  was given, or it breaks §3.7's inclusion rule.
- **Sage.** It filters `availableAgents` before `ALL_AVAILABLE_AGENTS` (Task 3.1).

**Rules:**
- **Hide, never forbid.** `_effectiveActions` / `_effectiveSubAgents` stay whole. The model can
  still call anything it is permitted to, and `Find Candidate Actions` stays available as the escape
  hatch.
- **Narrow once per run,** against the opening request, not per turn. A tool list that changes every
  turn defeats provider prompt caching, and it confuses the model mid-task.
- **Keep what the agent must use.** An action or sub-agent with `MinExecutionsPerRun` set is never
  narrowed out.
- **Only narrow a large catalog.** Below a configurable size, narrowing saves nothing. Leave it off.

**Acceptance.** Labels come from behaviour (§3.7): the actions and sub-agents that historical runs
actually called while the full catalog was in view (`MJ: AI Agent Run Steps`).
- **Report recall:** the share of runs where every item called would have been shown.
- **Report the tokens saved.** The field reports' skill suggester claims 88% fewer (§1). MJ's number
  is what matters.
- **The bar:** recall must hold at or near 100% on the Prompt Eval corpus before this goes on by
  default.

### Task 3.8 — Duplicate detection: from similar records to real candidates

**Today.**
- `DuplicateRecordDetector` takes the top 5 vector matches (`HybridQuery` when the provider supports
  it). It keeps those at or above `PotentialMatchThreshold`, which defaults to 0.7.
- When the entity document enables it, it can ask a `DuplicateReasoningProvider`, chosen by
  `EntityDocument.ReasoningMode`. `PromptReasoningProvider` makes one LLM call per candidate set,
  and returns `Merge` / `NotDuplicate` / `Uncertain` with a survivor and a field map.
- **Nothing checks a record as it is entered.** `CheckSingleRecord` exists and has no callers.

**Change, in two parts:**
1. **A `Decision` reasoning mode.** Register a `DecisionReasoningProvider` that asks one Likelihood
   per candidate: "Is this the same real-world entity as the new record?"
   - `ReasoningMode` is limited by a CHECK constraint to `'Agent' | 'Prompt'`, so a migration adds
     `'Decision'`, and the changeset is `minor`.
   - The provider only **recommends**: a probability per candidate, banded into `Uncertain` or
     `NotDuplicate`. It writes no survivor and no field map. Those remain LLM work.
   - **It never emits `Merge`** (§3.6 rule 8). `IsAutoMergeEligible` accepts
     `ReasoningRecommendation === 'Merge'` from any provider, so a provider that emitted it would
     make records auto-merge eligible. In `Decision` mode, duplicates are flagged for a person and
     never merged.
   - **A pre-filter needs explicit chaining.** `ResolveReasoningProvider` builds exactly one
     provider per `ReasoningMode`, so a new mode replaces the `Prompt` provider rather than feeding
     it. To keep auto-merge and let the decision drop implausible candidates first, add a chained
     mode: the decision filters, then `PromptReasoningProvider` reasons over the survivors.
2. **Check at entry.** This is Amith's real-time case. As a person enters a record, find vector
   candidates for the unsaved values, run the decision on them, and flag the survivors on the form.
   - **The overload is new work.** `CheckSingleRecord` takes a saved record's key, loads it with
     `RunView`, and throws when the record is not found. It also has no GraphQL resolver. It needs an
     overload that takes values, plus an endpoint.
   - **Flag only.** It never blocks a save, and it never merges.
   - **Stay inside the entry budget.** If the check misses it, it shows nothing. That is today's
     behaviour.

**Acceptance.**
- On a labelled set of known duplicate and non-duplicate pairs from an existing duplicate run,
  compare the `Decision` mode, the `Prompt` mode and the threshold alone. Report precision, recall,
  latency and cost.
- Entry-time flagging stays within its latency budget at p95.

### Task 3.9 — Route each message to the right agent in a multi-agent conversation

**Today.** `ResolveAgentTurn` (`packages/Angular/Generic/conversations/src/lib/utils/agent-turn-routing.ts`)
resolves in this order:
1. an @mention;
2. **continuity**, meaning the last agent other than Sage (`findLastNonSageAgentId`);
3. the conversation's default agent;
4. the host's default agent;
5. Sage.

So once any agent has answered, **every unmentioned message goes back to it**. That holds even
when the conversation has moved on to a different agent's subject. The intent check that used to
guard this (Task 3.2) is dead code.

**Change.** This generalises Task 3.2. At the continuity step, ask one Choice. Its options are:
- every agent that has taken part in this conversation;
- Sage, for "someone else".

Also ask a Likelihood for "continues the current thread".
- **Rebuild the options per message** (§3.6 rule 3). Each option's description is the agent's
  description, plus a line on what it did in this conversation.
- **Fail toward continuity.** A timeout, an unsure answer, or an error keeps today's routing.
- **The budget is Task 3.2's.** The intent check was cut at ~300 ms, so this must come in well
  under that, network included.
- The host hook `BeforeAgentTurn` already allows a redirect (`RedirectAgentId`). Use it if routing
  belongs on the host side.

Do Task 3.2's artifact-version targeting in the same change, because the same call can answer it.

**Acceptance.**
- **Take the labels from a person's choice, not the router's.** On today's traffic, the agent that
  handled an unmentioned message is whatever always-continue picked, so it is not a label (spike
  results §6).
- **Usable labels come from three sources:**
  - @mentions that override continuity;
  - conversations built with a known move per message, as the spike's corpus was;
  - a hand-labelled sample.
- **The routing must beat always-continue on accuracy,** and stay within the latency budget.

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

**Resolve a fork's judgments together.** Everything a fork needs is one call against one state
(§3.6, rule 2):
- one Choice for an `exclusiveGroup`;
- batched Likelihoods for independent edges.

Asking about every outgoing edge before knowing which will be taken costs almost nothing, because
questions in one call run in parallel. A judgment that needs another step's output waits for that
step. And if finishing depends on a side effect, the condition also checks the effect's recorded
result, not only the judgment (rule 6).

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

### Task 4.6 — Pre-declared post-action gates in the loop agent

> **Moved into the wrap-up milestone (§0.2), and extended to sub-agents.** `finishIf` may be
> attached to `nextStep.subAgent` as well as to `nextStep.actions`. After the sub-agent returns, the
> same check runs against its result. It is on by default for loop agents, with a conservative
> threshold (0.9 per question) set per agent, until Task 2.4's calibration replaces it.

This is Amith's example. The big model, when it asks for an action, also writes down in advance
what a good result looks like: *"if this action has a good result, stop."* After the action runs, a
decision model checks the result against that description, and the loop ends **without another LLM
turn**.

**Today, every action costs a turn.**
- `BaseAgent.executeActionsStep` runs the actions, then **always** returns `step: 'Retry'` ("Analyzing
  results from N completed action(s)…").
- The next LLM turn often only reads the result and declares the task complete.
- The loop response has no field for a post-action intent. Its `nextStep.actions` is
  `Array<{ name, params }>`.

**The precedents, both honoured without a model call:**
- **Client tools.** `terminateAfterExecution` returns `Success` once they finish, when the LLM set
  `taskComplete` alongside them.
- **Sub-agents.** `nextStep.subAgent.terminateAfter` ends the parent run after the sub-agent
  returns.

This task is the evaluated version of those two pre-commitments. Task 4.1's "FinishIf" is a
condition on a server-side `While` loop. This task applies the same idea to the step the loop agent
takes most often: a single round of actions.

**Design:**
1. **The envelope.** The actions step gains an optional `finishIf`:
   - `questions`: one to three Likelihood `instructions` about the action results, such as "The
     results include an invoice number" or "No result reports an error";
   - `message`: the reply to return if every question passes. It may reference action outputs
     through template placeholders, rendered in code.
2. **Evaluation,** in `executeActionsStep`, before it returns `Retry`:
   - **Code checks first** (§3.6 rule 6). Every action must report success. If one did not, the loop
     takes today's path.
   - **Then one decision.** The state is the action results, projected to their output parameters.
     The questions are the gate's.
   - **Combined in code** (§3.6 rule 1). The run ends only when every question clears the
     calibrated threshold. It then returns `Success` with the rendered message, as the client-tools
     branch does.
3. **Anything else keeps today's behaviour.** A failed check, an unsure answer or an error returns
   `Retry`, and the LLM takes its normal turn. A gate can only **remove** a turn. It never starts an
   action, and it never changes what happens next beyond ending the run early.
4. **Telemetry.** Record each gate as an `AIAgentRunStep` with `StepType = 'Decision'`, with the
   probabilities (Task 4.3 pins that step type's meaning).

**Touch points:**
- `LoopAgentResponse` and its validator. `isValidLoopResponse`'s repair branches must carry the new
  field, not drop it.
- The `taskComplete && !hasClientTools` short-circuit in `LoopAgentType.DetermineNextStep`, which
  runs before the actions case.
- The loop agent's system prompt and exemplars, so the model learns to write `finishIf`.

**Risks specific to this task:**
- **Channel effects** (§5). A new envelope field changes what the model writes. Run the Prompt Eval
  corpus before and after, with the gate recorded but not acted on.
- **Injected text in a result can push a gate to "done".** Code checks run first, and the worst
  outcome is an early, pre-written reply. Still, do not enable gates for agents whose actions touch
  money or permissions until the threat review in §5 is done.

**Acceptance.** The labels are behavioural: historical runs where the LLM's turn after an action
declared `taskComplete` without further actions are the cases a gate should have closed.
1. Replay those runs from frozen state, with the gate evaluated but not acted on.
2. Report:
   - the share of post-action turns that could have been skipped;
   - the false-finish rate: how often the gate passed where the LLM went on to act;
   - the latency and cost saved.

Then turn it on per agent, behind a flag.

**Prerequisite:** none for the milestone, which uses the conservative threshold above. Phase 2's
calibration then sets the threshold from data. Like Task 3.4, it gates control flow on a
probability.

### Task 4.7 — General decisions from the loop agent *(wrap-up milestone)*

This is Amith's second loop-agent route: the agent **asks for a decision** whenever a judgment suits
one. It uses the same mechanics as `scratchpad` and `artifactToolCalls`.
- **The envelope.** An optional `decisions` field on `LoopAgentResponse`: a list of requests, each
  a state (text, or a reference into the payload) plus typed questions.
- **Inline, at zero turn cost.** The framework answers them on the same turn through
  `AIDecisionRunner`, and injects the answers into the next turn's prompt, as artifact tool results
  are injected.
- **Why the agent would use it:**
  - to judge many items at once, which is cheap for a decision model and costly in the agent's own
    reasoning;
  - to get a consistent, logged judgment instead of prose;
  - to settle a routing or classification question with probabilities the agent can compare.
- **Gated like scratchpad.** Prompt params include it in the response type and the system prompt.
  It is on by default for loop agents.
- **Measure adoption and channel effects** on the Prompt Eval corpus (§5, channel effects).

---

## Phase 5 — Feature pipeline types *(bulk analysis in Knowledge Hub)*

**Goal:** give Knowledge Hub's Feature Pipelines more than one pipeline **type**, each backed by a
driver. The type that exists today becomes `LLM`. A new `Decision` type runs typed questions over
every record. It can do less than an LLM, but it is far cheaper and faster.

This is Amith's request, and it is the field reports' first and third use case (§1): the same
questions over every item in a collection, then counted or written back.

**Dependencies:** Phase 1 (`AIDecisionRunner`, `LLMDecision`). The `Decision` type works with
`LLMDecision` alone. Its economics need a native driver (Task 2.3) or an open-weights one
(Task 2.5). A `boolean` output's threshold needs Task 2.4's calibration before it writes to a field
people act on.

**Where it can go:** it can run in parallel with Phases 3 and 4. It changes no agent behaviour.
Its writes go to fields the author picks, and `dryRun` already exists. So, like Task 3.0, it is a
safe place to learn how the model behaves on MJ's data.

### 5.0 How Feature Pipelines work today

Verified on `next` at 9b8a84e409. #4636 built it.

- **A pipeline is not its own table.** It is an `MJ: Record Processes` row with `WorkType = 'Infer'`
  in the seeded "Feature Pipeline" category. Its spec (`DataFeatureSpec`) is JSON in
  `Configuration`.
- **The spec** has these fields: `Context` (entity document, query or fields), `PromptID`, `Outputs`,
  `Caching`, `Watermark`, `CaptureReasoning`, and `ProcessorExtensionKey`.
  - Each output has a `Constraint`, one of: `enum`, `lookup`, `numeric`, `money`, `date`, `boolean`
    or `freetext`.
  - Each output has a `Target`, one of: a `field`, a `child` record, or `tags`.
- **Execution** is in `packages/RecordSetProcessor/engine`, not in `@memberjunction/feature-pipelines`,
  which holds only contracts and the cache:
  1. `RecordProcessExecutor.BuildProcessor` builds an `InferProcessor`.
  2. `InferProcessor.ProcessBatch` groups records by cache key.
  3. `InferProcessor.ProcessRecord` makes one `AIPromptRunner.ExecutePrompt` call per distinct key.
  4. The result is validated against the constraints, cached (`FeatureValueCacheService`), written
     to history (`MJ: Feature Values`), and then materialised by `WriteBackProcessor`.
- **There is no pipeline type or driver today.** The two seams that exist don't fit:
  - `RecordProcessorRegistry` is keyed by `WorkType`, and a CHECK constraint limits `WorkType`.
  - `ProcessorExtensionKey` can only subclass the LLM processor.
- **An unused column fits a decision driver exactly:** `MJ: Feature Values.Confidence` (FLOAT)
  exists and is never populated.
- **`DataFeatureOutput.FeatureKind`** (`numeric`, `categorical`, `embedding`, `llm-derived`) is
  declared but only displayed.

### Task 5.1 — Pipeline types and the driver seam *(refactor, no behaviour change)*

1. **The type catalog.** Add an `MJ: Feature Pipeline Types` entity, seeded through metadata with
   an `LLM` row and a `Decision` row. Its columns are `Name`, `Description` and `DriverClass`. This
   follows MJ's metadata-plus-driver pattern (`MJ: AI Model Types`, `MJ: Test Types`): the UI can
   list the types, and a third type is a row plus a registered class, with no code switch.
2. **The spec names its type.** Add an optional `PipelineType` field to `DataFeatureSpec`. When it
   is absent, the type is `LLM`, so every existing pipeline is unchanged. Put it in the spec, not in
   a new `MJ: Record Processes` column. The column would mean nothing for the other four work types,
   and the spec already carries `ProcessorExtensionKey`.
3. **The driver contract.** Pipeline mechanics stay in `InferProcessor`: context building, cache
   keys and batching, watermarks, constraint validation, history and write-back. Only the step that
   turns one record's context into output values varies. It moves behind
   `BaseFeaturePipelineDriver`, which exposes:
   - `Capabilities`: the constraint types and target modes it supports, whether it returns reasoning
     or confidence, and its size limits;
   - `ValidateOutputs(spec)`: returns an error for each output the type cannot produce. It runs
     after, and in addition to, the existing free function `ValidateSpec` in
     `data-feature-spec.ts`, which `BuildProcessor` already calls;
   - `ComputeOutputs(record, context)`: returns each output's value, plus a confidence and
     distribution where the driver has one.

   This is the same move as Phase 0: shared stack, one varying step.
4. **`LLMFeaturePipelineDriver`** is today's `ExecutePrompt` call and prompt-data building, moved
   verbatim. `InferProcessor`'s lifecycle hooks (`beforePromptExecute`, `afterPromptExecute`, and
   the rest) and `ProcessorExtensionKey` keep working, so existing extensions don't change.

**Acceptance:** every existing pipeline test passes unchanged. A pipeline run before and after the
change writes identical `MJ: Feature Values` rows, compared the way #4775 compared prompt-run rows.
The changeset is `minor`, because the new entity needs a migration and metadata.

### Task 5.2 — `DecisionFeaturePipelineDriver`

One call per record, with every output as a question in that one call (§3.6 rule 2). The record's
rendered context is the state.

| Output constraint | Question | Value written | Also written |
|---|---|---|---|
| `boolean` | Likelihood | `Probability ≥ threshold` (the threshold is in the output spec, calibrated per Task 2.4) | `Confidence` = the probability |
| `enum` (≤ 255 values) | Choice | the winning value | `Confidence` = its probability |
| `numeric` with `Levels` (2–10 descriptions) | Score | the expected level, rescaled onto `Min`–`Max` | `Confidence` = the top level's probability |
| `numeric` without `Levels`, `freetext`, `money`, `date`, `lookup`, no constraint; `child` targets | — | **rejected by the driver's validation** | — |

- **Descriptions are required** (§3.6 rules 4 and 9).
  - An `enum` output takes its option descriptions from the entity field's value list, since
    `EntityFieldValue` has a `Description`, or from a new `ValueDescriptions` map on the
    constraint.
  - A `numeric` Score output needs `Levels`, written as descriptions. `Levels` is new; today the
    `numeric` constraint is `{ Min, Max, Integer, OnViolation }`.
  - An output without them fails validation. It is not guessed.
  - Field value lists: `EntityFieldValueInfo` has a `Description`, but its `toJSON()` and the
    validator's `FieldMetadataStub` drop it. Carry it through.
- **No reasoning.** The driver's validation rejects `CaptureReasoning: true`. The builder has no
  reasoning control today, so there is nothing to hide. What
  explains a decision is its distribution. That goes to `AIPromptRun.Result` (Task 1.3), and
  `MJ: Feature Values.AIPromptRunID` already links each value to that run.
- **Populate `Confidence`.** It is a column MJ already has and has never filled. The plumbing
  exists: `recordFeatureValuesHistory` accepts a `confidence`, and `FeatureValueCacheService`
  writes it through. No caller passes one yet.
- **Mark the provenance.** Add a `decision-derived` `FeatureKind`, so that Predictive Studio, which
  consumes these columns as model features, can tell a decision-made value from an LLM-made one.
- **Check the state limit per record.** A record whose rendered context exceeds the model's state
  limit fails with a clear error. It is never truncated silently. The fix is a narrower context: set
  `Context.Fields`, or use a smaller entity document. That is the projection rule (§5, risks).
- **The cache works, with one change to the hash.** The pipeline's `PromptID` points at the
  decision prompt (Task 1.5), and `computePromptVersionHash` already covers `Outputs`, from which the
  questions are generated. It does **not** cover the pipeline type. Add it, or a pipeline switched
  from `LLM` to `Decision` without changing its `PromptID` would be served cached LLM values.
- **`tags` targets are a follow-up.** A tag tree could become one Choice per level: up to 255
  children per node, walked from the root. Build it only after the flat types are measured.

### Task 5.3 — The builder

`mj-feature-pipeline-builder` (in `packages/Angular/Generic/record-process-studio`) gains a
pipeline-type picker at the top. Everything below it filters by the chosen driver's `Capabilities`:
- constraint types and target modes it cannot produce are hidden (today the picker offers none,
  `enum`, `numeric`, `boolean` and `freetext`);
- editors appear for `Levels` and option descriptions.

Switching an existing pipeline's type runs the driver's `ValidateOutputs`, and lists every output
that the new type cannot produce.

The Knowledge Hub list (`FeaturePipelinesResourceComponent`) shows each pipeline's type on its card.

**Separately, fix the stale regression test:** T105 expects a "Feature Pipeline" modal and an
"Edit" button. The current UI opens the entity form, and the button reads "View".

### Task 5.4 — Escalate borderline records *(optional)*

This is §3.6 rule 8, applied in bulk. A `Decision` pipeline may name an `LLM` pipeline to escalate
to, together with a confidence floor. Records below the floor are re-run through the LLM type, and
only those records. So the decision model handles the easy majority, and the LLM spends only on the
cases the decision model is unsure of.

### Task 5.5 — Measure it on a real pipeline

1. Pick one existing LLM pipeline whose outputs are all `enum`, `boolean` or leveled `numeric`.
2. Hand-label a sample. The field reports suggest 50; use more if the classes are unbalanced.
3. Run both types against that sample. Report for each:
   - agreement with the labels;
   - agreement between the two types;
   - repeatability (Task 2.1);
   - wall time and cost per 1,000 records.

Publish the result before recommending the `Decision` type for any pipeline that writes to a field
people act on.

### Phase 5 exit criteria

- A pipeline author can choose `LLM` or `Decision`.
- A `Decision` pipeline writes values, confidence and distributions for `boolean`, `enum` and
  leveled `numeric` outputs.
- Unsupported outputs are rejected when the pipeline is saved, not at run time.
- Task 5.5's numbers are published.

---

## 5. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **State projection is the actual work** | These models degrade as state grows with content irrelevant to the question. The loop agent's context is the opposite of a narrow projection. Skipping this produces a bad measurement, not a bad feature. | Build a per-question projection for every consumer. Budget for it explicitly. Phase −1 measures with real payloads specifically to expose this. |
| **Channel effects are measured and real** | `loop-agent-type.ts` records that declaring native tools *"drops envelope output sharply, and on GPT 4.1-mini it reaches zero — the model answers through whichever channel it was given."* Adding a third decision channel is not neutral. | Every consumer change goes through the `Prompt Eval` corpus before and after. |
| **Phase 0 touches the hottest path in MJ** | A 6,366-line class becomes the middle of a three-level hierarchy. | Move-then-change in separate commits. Integration tier green before each merge. If the base accumulates chat-shaped concerns, switch to composition. |
| **Calibration is a vendor claim** | Thresholding on an unmeasured probability is the exact failure mode already live in `memory-manager-agent.ts`. | Phase 2 gates Phase 3.4. No threshold ships before a reliability curve. |
| **Adversarial input** | Decision models do not treat state as hostile by default; injected instructions inside the state can move the answer. | Do not place a decision on a security boundary without a separate threat review. Guardrails are the most tempting and riskiest consumer. |
| **Model jaggedness** | Documented weaknesses: literal reading of scoping words and negations, unreliable counting, weak numeric precision, difficulty with indirection. TypeSafe also names multi-step questions and dates (§1). | Keep arithmetic, counting and date logic in code — `SafeExpressionEvaluator` exists for exactly that. Never ask a decision model "how many retries have we done." |
| **Single vendor, closed model** | Vendor risk, and no public leaderboard verification. | `BaseDecision` from day one; `LLMDecision` always works. Phase 1 ships with no vendor at all. |
| **Consistently wrong looks reliable** | Low variance is not accuracy. In LangChain's experiment Claude Sonnet 4.6 gave the same wrong verdict every time, and a cheap judge spreads its errors at scale. | Check agreement with human labels before scaling up. Report repeatability *and* agreement (Task 2.1). Recheck agreement when the agent or prompt changes. |
| **The vendor model floats** | A `-latest` alias resolves to a dated version that can change underneath you. | Pin a dated ID in metadata, or record the resolved version on every run (Tasks 1.3, 2.3). |
| **Narrowing hides what was needed** | A token saving that drops the one action, note or agent the task required produces a wrong answer, quietly. | Fail toward inclusion (§3.7). Hide, never forbid (Task 3.7). Measure recall on behavioural labels before turning anything on by default. |
| **Per-turn narrowing defeats prompt caching** | A tool list or system prompt that changes each turn invalidates the provider's cached prefix, which can cost more than the narrowing saves. | Narrow once per run (Task 3.7). Measure cost with caching on. |
| **Scope growth** | The plan now spans five phases and a dozen consumers. | Every consumer is independent, behind a flag, and fails toward today's behaviour. Phases 3 to 5 are candidates taken one at a time, not a release train. |

---

## 6. Open decisions

Record the answer and the reasoning in the PR that settles each.

1. **Inheritance vs composition for Phase 0.** Current lean: inheritance — what is shared is a
   genuine template method ("resolve → credential → execute-with-failover → record," only the
   execute step varies), and the `RequiredModelType` declaration only reads cleanly under
   inheritance. Switch to composition if the base starts carrying chat-shaped concerns.
   *Settled (#4767 to #4777):* inheritance, with the model call passed as a callback. The base now
   holds no chat types.
2. **`MJ: AI Prompts` as the config carrier for non-prompt calls.** Current lean: reuse. It already
   is, for embeddings.
3. **Absorb or delete `classify.types.ts`.** *Settled (#4714):* deprecate now, delete in the next
   major version.
4. **Whether `startAtStep` and flow-as-sub-agent become dispatcher features** before Task 0.7 cuts
   the walker. *Superseded:* Task 0.7 is withdrawn. The open question is whether the dispatcher
   should absorb the in-run callers, and it belongs to the flow owners.
5. **Phase 0 as one PR or a train.** *Settled:* a train. Task 0.3 alone is four PRs (§0.1).
6. **Where a feature pipeline's type lives.** Current lean: an optional `PipelineType` in
   `DataFeatureSpec`, resolved against `MJ: Feature Pipeline Types`. The alternative is a column on
   `MJ: Record Processes`, which would mean nothing for the other four work types.
7. **How a post-action gate phrases its reply.** Current lean: a message written in advance, with
   placeholders rendered from action outputs in code. The alternative is a cheap LLM call to word
   the reply, which gives back part of the saving.
8. **Narrowing cadence.** Current lean: once per run. Per turn follows the task better but defeats
   prompt caching. Measure both in Task 3.7 before settling.

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
| `BaseModelRunner.ts` | The shared runner base (Task 0.3): candidates, credentials, failover, run records |
| `AIModelRunner.ts` | ~412 lines. Today: embeddings only. The body retires in Task 0.5; the exported name stays. |
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
| `agent-types/base-agent-type.ts` | `PreProcessActionStep`: the pre-execution guard socket; fails open today (Task 3.5) |
| `ConversationCompactionManager.ts` | Summary-based compaction (Task 3.5) |

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
| `packages/TestingFramework/Engine/src/oracles/LLMJudgeOracle.ts` | Task 3.0: the judge a decision-backed oracle sits beside; registered in `TestEngine` |
| `packages/AI/ComputerUse/src/judge/` | Task 3.5: `BaseJudge` and its three strategies; `Done` / `Impossible` every step |
| `plans/agent-latency-optimization.md` | Where the intent check was priced and cut |

### Added 2026-09-28 — narrowing, gates and pipelines
| File | Role |
|---|---|
| `packages/AI/Agents/src/agent-memory-context-builder.ts` | Task 3.6: `InjectContextMemory` reads `RerankerConfiguration`, calls the injector |
| `packages/AI/Agents/src/agent-context-injector.ts` | Task 3.6: `GetNotesForContext`, `getNotesViaSemanticSearch`, `getExamplesViaSemanticSearch` (no rerank stage) |
| `packages/AI/Reranker/src/RerankerService.ts` / `config.types.ts` | Task 3.6: `RerankNotes`; `GetReranker`, whose `'LLMReranker'` branch must generalise; the per-agent config and its defaults |
| `packages/SearchEngine/src/generic/SearchEngine.ts` / `BaseReRanker.ts` | Task 3.6: `runReRanker` and the search package's own reranker adapter hierarchy |
| `packages/AI/Agents/src/agent-types/loop-agent-prompt-params.ts` | Task 3.7: `maxActionsInPrompt` / `maxSubAgentsInPrompt`, declared and unread |
| `packages/AI/Agents/src/base-agent.ts` | Task 3.7: `gatherPromptTemplateData`, `buildAgentBaseCatalog`, `filterAvailableSkills`. Task 4.6: `executeActionsStep`, `executeClientToolsStep` (`terminateAfterExecution`). Model-tier routing: `preparePromptParams` |
| `packages/ConversationsRuntime/src/agent-runner/ConversationAgentRunner.ts` | Tasks 3.1 and 3.7: `ALL_AVAILABLE_AGENTS` |
| `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts` | Task 3.8: `CheckSingleRecord` (no callers; saved records only), `IsReasoningGateOpen`, `ResolveReasoningProvider`, `IsAutoMergeEligible` |
| `packages/AI/Vectors/Dupe/src/reasoning/` | Task 3.8: `DuplicateReasoningProvider`, `PromptReasoningProvider` |
| `packages/Angular/Generic/conversations/src/lib/utils/agent-turn-routing.ts` | Task 3.9: `ResolveAgentTurn`, the continuity route |
| `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts` | Task 4.6: `nextStep.actions`, `subAgent.terminateAfter` |
| `packages/RecordSetProcessor/engine/src/RecordProcessExecutor.ts` | Phase 5: `BuildProcessor` |
| `packages/RecordSetProcessor/engine/src/processors/InferProcessor.ts` | Phase 5: the LLM call that becomes `LLMFeaturePipelineDriver` |
| `packages/AI/Knowledge/FeaturePipelines/src/spec/data-feature-spec.ts` | Phase 5: `DataFeatureSpec`, `DataFeatureOutput`, where `PipelineType` goes |
| `packages/Angular/Generic/record-process-studio/` | Phase 5: `mj-feature-pipeline-builder` |
| `packages/Angular/Explorer/dashboards/src/KnowledgeHub/components/feature-pipelines/` | Phase 5: the Knowledge Hub list |
| `migrations/v6/V202609212241__v6.2.x__Feature_Pipelines.sql` | Phase 5: `MJ: Feature Values` (the unused `Confidence`), `MJ: Feature Value Caches` |

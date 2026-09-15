# Gemini 3.8 Live + 3.8 Live Extended Thinking

**Status:** proposed — not started
**Branch:** `claude/focused-franklin-d1cy6w` (cut from `next` @ `e1fd4c1af0`)
**Owner:** `@memberjunction/ai-realtime-client`, `@memberjunction/ai-gemini`, `@memberjunction/ai` (Core contract)
**Shape:** ONE PR. Extend the existing Gemini driver with capability branching — **no new driver.**

> Protocol facts below are taken from Google's published model pages and the Live API
> capabilities guide (`gemini-3.8-live`, `gemini-3.8-live-extended-thinking`, "Live API
> capabilities guide", all dated 2026-09-15), **not** from the launch blog post and not from
> the SDK types (`ai.google.dev` and `blog.google` are both egress-blocked from the build
> session; the docs were supplied as saved pages). Anything not stated in those pages is
> marked **VERIFY** and must be confirmed against a live session before the code relying on
> it is considered done. This discipline exists because the GPT-Live PR lost a cycle to a
> wire-format claim reasoned from an adjacent protocol rather than read from the source.

---

## 1. Why this is not a new driver

GPT-Live needed `OpenAILiveClient` as a **second driver** because it was a genuinely second
protocol: zero event names overlapped with classic Realtime, tools existed only under
delegation, there was no turn-detection config and no response-terminal event.

Gemini 3.8 Live is the opposite case. It is **the same Live API** — same
`client.aio.live.connect` / `ai.live.connect` entry point, same `BidiGenerateContent` frames,
same `serverContent` / `toolCall` / `usageMetadata` shapes, same transport, and the same audio
formats (input 16 kHz PCM little-endian as `audio/pcm;rate=16000`, output 24 kHz PCM).
`packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts` already speaks it.

What differs between `gemini-3.1-flash-live-preview`, `gemini-3.8-live` and
`gemini-3.8-live-extended-thinking` is **which features are legal**, not how frames are named.
That is a capability matrix, and MJ already has the place to put one:
`BaseRealtimeModel` capability flags plus `ModelConfiguration.Realtime`.

A second driver here would duplicate ~790 lines of working session, audio, transcript and
barge-in handling to express three config differences. Capability branching in one driver is
the smaller interface and the smaller thing to own.

---

## 2. The two models (verified)

| | `gemini-3.8-live` | `gemini-3.8-live-extended-thinking` |
|---|---|---|
| Recommended for | default for most low-latency voice agents | when higher background reasoning is required |
| Inputs / Output | text, image, audio, video / text + audio | same |
| Token limits | 131,072 in / 65,536 out | same |
| Thinking | Supported (**interleaved reasoning**). `thinkingLevel` **NOT supported — must be omitted** | Supported. `thinkingConfig.thinkingLevel` ∈ `low`\|`medium`\|`high` (**`minimal` not supported**) |
| Thought summaries | not applicable | `thinkingConfig.includeThoughts: true` |
| Function calling | `behavior: NON_BLOCKING` is the **default**; `BLOCKING` still allowed for back-compat | **Async ONLY** — `BLOCKING` returns a **hard error** |
| Function scheduling | `SILENT`, `WHEN_IDLE`, `INTERRUPTED` supported | **not supported** |
| Idle signal | `turnComplete` (see §3.1 caveat) | `turnComplete: true` **no longer means idle** — use `interaction_status` ∈ `IN_PROGRESS`\|`IDLE` |
| Proactive audio | permanently on; `proactive_audio: false` **errors** | same |
| Affective dialogue | **removed from the API** — `enable_affective_dialog` must not be sent | same |
| Turn coverage | defaults to `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO` | **VERIFY** (stated on the 3.8-live page only) |
| Search grounding | Supported | Supported |
| Caching / code execution / structured outputs / image gen / Maps grounding / Batch | Not supported | Not supported |
| Session cap | audio-only sessions limited to **15 minutes** | same |

Both are **Stable** (no `-preview` suffix) as of September 2026.

---

## 3. What actually breaks, and what only looks like it breaks

### 3.1 `turn_complete=true` unconditionally interrupts generation — NOT a 3.8 change

The 3.8-live migration notes list this under "updates", which reads like a behaviour change.
It is not: the capabilities-guide comparison table states it **identically for all three
models, including `gemini-3.1-flash-live-preview`** — the model MJ runs today.

This matters because `geminiRealtimeClient.ts` deliberately uses `turnComplete: false` for
context notes and then *commits* with a `turnComplete: true` empty turn
(`sendToolResponseTurn`, `openClientTurn`). Its own doc comment says an open client turn makes
the server hold generation "until a `turnComplete: true` arrives" — i.e. it treats
`turnComplete: true` as a **release**, while the docs call it an **interrupt**.

Those two readings cannot both be right. **VERIFY against a live session before changing
anything.** Three outcomes, and the plan differs for each:
- the commit is genuinely interrupting a turn today → a **pre-existing bug on 3.1**, fix it here and say so;
- the server distinguishes an *empty* committing turn from a content-bearing one → the doc sentence is imprecise, add a comment recording that and move on;
- something else → design from what we measure.

Do not "fix" this from the doc sentence alone. It is the highest-risk item in the PR precisely
because it looks like a one-line change.

### 3.2 Turn serialization — the real work

```ts
/** True while a model turn is in flight; gates (queues) client-triggered sends. */
private responseActive = false;
/** Sends deferred while a turn is in flight; drained in order on turnComplete. */
private queuedSends: Array<() => void> = [];
```

That is one-turn-at-a-time, drained on `turnComplete`. Under Extended Thinking, `turnComplete`
arrives while the server is still reasoning and still issuing tool calls, and `NON_BLOCKING` is
the *only* legal mode. So the queue drains at the wrong moment and `responseActive` stops
describing anything real.

`IsBusy` is currently `return this.responseActive`. Busy has to become a function of the
session's actual outstanding work: reasoning in progress, tool calls outstanding, audio still
playing.

### 3.3 Config that now errors

`proactive_audio: false` and `enable_affective_dialog` both fail against 3.8. Audit
`parseSessionConfig` and anything that can inject either from `ModelConfiguration`. A config
key that used to be inert is now a session-mint failure — the same failure class as the
`SanitizeWireToolName` colon bug, which failed upstream of all UI code.

### 3.4 Video frames now default ON

`TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO` means frames ship to the model by default, billed
and consuming context. MJ must set turn coverage deliberately rather than inherit it.

---

## 4. What GPT-Live already solved (reuse inventory)

This is why one PR is realistic.

| Need | Already exists | Reuse |
|---|---|---|
| Many parallel async tool calls; exactly one continuation when the set drains; safety timeout; duplicate/unknown results must not re-fire | **`RealtimeToolBatchBarrier`** — `packages/AI/Core/src/generic/realtimeToolBatchBarrier.ts`, provider-agnostic, already used by `OpenAILiveClient` | **as-is** |
| "Model is done" with no terminal event | GPT-Live infers it: `playbackDrainInterval` + `drainSilenceStartTime` + `assistantSafetyBackstopTimer` | **do not port.** Gemini gives `interaction_status: IDLE` — an explicit signal. Use it, and keep a backstop timer only as a guard against a lost frame |
| Spoken progress narration as a distinct transcript kind | `Kind: 'narration' \| 'normal'` in `OpenAILiveClient`; `RequestSpokenUpdate?()` in the base contract (`baseRealtime.ts:560`) | **promote.** Direction differs: GPT-Live narration is *requested by us*; Gemini thought summaries *arrive from the model*. Same rendering, opposite trigger |
| Reasoning plane as config | Shipped in the GPT-Live PR and consumed by **no driver**: `RealtimeReasoningPlane = 'local' \| 'remote'`, `RealtimeRemoteReasoning` (effort level), `RealtimeReasoningSettings`, `BaseRealtimeModel.SupportedReasoningPlanes` | **first real consumer.** `thinkingLevel` maps onto the existing effort field |
| Per-model capability gating | `CanReconfigureTurnMode`, `CanReconfigureDelegationMode`, `SupportsParallelToolCalls`, `SupportsDynamicToolSet` | **extend** with the §2 matrix |
| Delegation/progress UI | `RealtimeDelegationCardVM` with `Kind: 'agent' \| 'action'`, streamed progress, expandable results, immutable-card discipline | **extend** with a third kind for model-authored narration/thinking |

The `interaction_status` signal is the good news of this whole change: GPT-Live had to *infer*
idleness from silence, and that heuristic is the least satisfying part of that driver. Here we
get told.

---

## 5. Design

### 5.1 Capability descriptor, not `if (model === ...)` — and NO new columns

**Corrected 2026-09-15 after checking the generated ORM.** The first draft of this section
proposed new capability fields. Most of what is needed already exists on the AI model entities,
so **this PR ships no DDL and no migration**:

| Need | Already on the entity |
|---|---|
| Is a thinking/effort level legal for this model | **`SupportsEffortLevel`** on both `MJ: AI Models` and `MJ: AI Model Vendors` |
| Which level, and its bounds | **`RealtimeRemoteReasoning.Effort`** — already enumerates `'none' \| 'minimal' \| 'low' \| 'medium' \| 'high' \| 'xhigh'`. Gemini's `low`/`medium`/`high` is a subset; "`minimal` not supported" is a capability gate, not a new type |
| Everything else per-model | **`ModelConfiguration`** — a typed JSON column on both entities, with a CodeGen'd accessor (`ModelConfigurationObject: MJAIModelVendorEntity_IAIModelConfiguration`) |

So the remaining flags live inside `ModelConfiguration.Realtime`, alongside the
already-shipped `Reasoning` and `TurnDetection` blocks, rather than becoming columns:

- `SupportsBlockingTools?: boolean` — `false` for Extended Thinking (`BLOCKING` is a hard error there)
- `SupportsFunctionScheduling?: boolean` — `false` for Extended Thinking
- `IdleSignal?: 'turnComplete' | 'interactionStatus'`
- `IncludeThoughtSummaries?: boolean`
- `TurnCoverage?: 'audioActivityOnly' | 'audioActivityAndAllVideo'`

The driver-facing half still belongs on `BaseRealtimeModel` as capability properties (the same
shape as the existing `SupportsParallelToolCalls` / `CanReconfigureTurnMode`), fed from that JSON.

Three rows, one driver. A fourth Live model next quarter is a metadata row, not a code change —
the same reason model IDs are already read from `AIModelVendor.APIName` (`args.Model`) rather
than hardcoded.

**Operational note, because it fails silently:** CodeGen reads JSONType definitions from the
**database**, not from `metadata/`. Extending `IAIModelConfiguration` requires `mj sync push`
**before** `mj codegen`, or CodeGen regenerates from the stale definition and *deletes*
properties from the generated type without erroring. That round-trip needs a live dev DB and so
happens on the maintainer's machine, not in CI.

### 5.2 Replace `responseActive` with an outstanding-work model

`IsBusy` becomes: reasoning in progress **or** tool batch non-empty **or** audio playing.
`interaction_status` drives the first; `RealtimeToolBatchBarrier` already owns the second;
`audioPlaying` already exists.

`queuedSends` loses its `turnComplete` trigger and drains on **idle** instead — which on
`gemini-3.8-live` is still `turnComplete`, and on Extended Thinking is `interaction_status:
IDLE`. That is exactly what `IdleSignal` selects, and it is why the flag is a capability rather
than a version check.

### 5.3 Thought summaries → the narration path that already exists

`includeThoughts: true` yields model-authored summaries. Route them to the narration transcript
kind rather than inventing a parallel channel, and surface them as a third delegation-card
`Kind`. The card work merged last week already handles streaming progress and expandable
detail; this is a new producer for it, not new UI machinery.

**VERIFY:** how a thought part is *marked* on the wire (a `thought` boolean on the part, a
separate part type, something else). The guide documents how to *enable* summaries but the saved
pages do not show a received frame. Read it off `@google/genai` v2.x types or a live session
before writing the parser.

### 5.5 Video / screen input — a new modality, NOT a new channel

Gemini 3.8 Live accepts **text, images, audio AND video** as input. Per the GPT-Live plan
(`gpt-live-1.md`), `gpt-live-1` is **Text+Audio in/out** — so live visual input is a capability
Gemini has and GPT-Live does not. Camera *or* screen share are the same mechanism to the model:
frames in.

**MJ cannot do this today, and the gap is narrow but real.** There is no video or image input path
anywhere in the realtime contract — no `SendVideo`, `SendImage` or `SendFrame` on
`BaseRealtimeClient` or `IRealtimeSession`. Two things make it an addition rather than a rebuild:

- **The billing side already models it.** `RealtimeUsageModalityDetail` carries an `Image` token
  field, commented "(image-modality tokens, input only on current providers)". Usage accounting
  anticipated image input before an input path existed.
- **Browser capture already lives in the right layer.** `RealtimeClient` owns `micCapture.ts` /
  `createPcmMicCapture` for audio, so frame capture (`getUserMedia` for camera,
  `getDisplayMedia` for screen) belongs beside it, not in Core and not in a host app.

**One correction to avoid building the wrong thing.** MJ's "multiple parallel channels" are
server-side channel *sessions* (`baseRealtimeChannelServer.ts` — Media channel, whiteboard):
separate surfaces with their own lifecycle. Video input is a **second input modality on one
session**, a different axis entirely. Modelling frames as a channel would give each frame stream a
session lifecycle it does not want, and would not reach the model at all.

### 5.6 Per-model parameters — the control surface, and what it is missing

There IS a cascade, and it is the right place for this: catalog `ModelConfiguration.Realtime`
(lowest) → the session `Config: JSONObject` bag under `realtime.session.*` → the runtime override,
translated per profile (`buildTurnDetection` in `openAIRealtime.ts` is the worked example). §5.1's
`TurnCoverage` rides that cascade and **is** the video on/off control for Gemini.

What is genuinely missing is a **declared** per-model parameter mechanism: today a new provider
knob needs a new typed field in `AI/Core` plus a profile translation, so every model-specific
parameter is a Core release. Options, to decide before step 4:

1. **Typed fields only** (status quo, what §5.1 does). Safest, discoverable, compiler-checked;
   costs a Core change per knob.
2. **A declared passthrough** — `ModelConfiguration.Realtime.ProviderParams?: JSONObject`, merged
   into the provider payload by the profile with an allow-list of legal keys per model. Lets a knob
   ship as metadata; the allow-list is what keeps it from becoming an untyped bag, which is the
   failure mode the persona plan already called out for `VendorSettings`.
3. Both: typed for anything MJ reasons about, passthrough for genuinely provider-private knobs.

Recommend **3**, with the allow-list mandatory. `TurnCoverage` is a case for typed, because MJ has
to reason about its cost, and because the default is wrong for us.

**Video must be OFF by default, and that takes an explicit act.** Gemini's own default is
`TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO` — video **ON**, billed at $0.002/min, consuming
context. So omitting the setting does NOT give us off; MJ has to *send*
`audioActivityOnly`. A default that requires action to obtain is exactly the shape that ships
silently, so: the Gemini profile sets audio-only unless the catalog or a caller opts in, and a unit
test asserts the absent-config case resolves to audio-only rather than inheriting the provider's.

### 5.4 SDK major skew — fix it here

`packages/AI/RealtimeClient` pins `@google/genai@^1.40.0`; `packages/AI/Providers/Gemini` pins
`^2.8.0`. Two majors, one repo. `thinkingConfig`, `interaction_status` and the scheduling enums
plausibly need v2+. Bump RealtimeClient to `^2.8.0` and **prove one copy on disk**
(`ls -d node_modules/.pnpm/@google+genai@* | wc -l` → 1), because a duplicate SDK is the same
class of failure as the duplicated `type-graphql` that breaks MJAPI schema build.

---

## 6. Work breakdown (one PR, ordered commits)

1. **Docs + capability contract.** This plan; capability flags in `AI/Core`; `ThinkingLevel` type. No behaviour.
2. **SDK bump** to `@google/genai@^2.8.0` in RealtimeClient; single-copy proof; fix any v1→v2 breaks.
3. **Protocol verification spike.** Read v2 types for `interaction_status`, thought-part marking, `behavior`/`scheduling` enums, turn coverage. Write findings into §3.1 / §5.3 and delete the VERIFY markers that are now answered. **Gate: no VERIFY item may remain unresolved at review.**
4. **Config correctness.** Never send `enable_affective_dialog`; never send `proactive_audio: false`; omit `thinkingLevel` for `gemini-3.8-live`; set turn coverage explicitly. Unit tests asserting each is absent/present per model.
5. **Idle model.** `IdleSignal`; `interaction_status` handling; `IsBusy` from outstanding work; `queuedSends` drains on idle. Backstop timer as a lost-frame guard only.
6. **Async tools.** `behavior: NON_BLOCKING`; wire `RealtimeToolBatchBarrier`; `BLOCKING` refused for Extended Thinking with a clear error rather than a wire failure; scheduling gated by capability.
7. **Thinking.** `thinkingConfig` from `ModelConfiguration.Realtime.Reasoning` — the plane's first consumer; `includeThoughts` behind a flag.
8. **Narration + UI.** Promote the narration transcript kind; third delegation-card `Kind`; design tokens only.
9. **Metadata.** `AIModel` + `AIModelVendor` rows for both models (`APIName` = `gemini-3.8-live` / `gemini-3.8-live-extended-thinking`), modality rows, cost rows. Declarative JSON under `metadata/` with `uuidgen` primary keys, **no `sync` block and no `*__Metadata_Sync.sql`** — that is release work (`metadata/CLAUDE.md` §1b).
10. **Tests + changeset.** See §7.

§3.1 is deliberately inside step 3, before any code depends on its answer.

---

## 7. Tests

- **Unit, per model, table-driven** over the §2 matrix: config assembled for `gemini-3.8-live` omits `thinkingLevel`; for Extended Thinking includes it and rejects `minimal`; neither ever sends `enable_affective_dialog` or `proactive_audio: false`; `BLOCKING` rejected for Extended Thinking.
- **Idle**: `turnComplete` while `interaction_status: IN_PROGRESS` must NOT drain `queuedSends` and must NOT clear busy; a later `IDLE` must do both. This is the regression test for the whole change.
- **Async tools**: parallel calls, out-of-order results, a duplicate result, a never-returned call hitting the barrier timeout.
- **Thought summaries**: a thought part becomes a narration transcript, not assistant speech.
- **Backstop**: a lost `IDLE` frame still unwedges the session.
- Existing `gemini-realtime-client.test.ts` / `-extended.test.ts` must stay green, or change with a stated reason — 3.1 behaviour is not being dropped.
- Full repo unit tier + deterministic integration tier, per the Definition of Done.
- **Changeset**: `minor` (ships metadata).

---

## 7a. Cost model — Gemini is 2.2x-5.6x cheaper on the voice plane

**Gemini 3.8 Live / Extended Thinking / 3.1 Flash Live Preview**, paid tier (all three share one
price sheet). Google quotes audio two ways and they agree — input $0.005/min / $3.00 per 1M =
1,667 tokens/min (~28/s); output $0.018/min / $12.00 per 1M = 1,500 tokens/min (25/s):

| | Input | Output (**including thinking tokens**) |
|---|---|---|
| Text | $0.75 / 1M | $4.50 / 1M |
| Audio | $3.00 / 1M — or **$0.005/min** | $12.00 / 1M — or **$0.018/min** |
| Image / video | $1.00 / 1M — or $0.002/min | n/a |

Google Search grounding: 5,000 free requests/month **shared across all Gemini 3.x models**, then
$14 per 1,000.

**GPT-Live** prices the voice plane as one wall-clock rate: **$0.05/min**, billed per second, not
rounded up — **plus delegated reasoning tokens billed separately**, reported from a different
place, plus a 15-second pre-bill on WebRTC session creation.

So the two are not blendable as a single rate: GPT-Live quotes one number for the session while
Gemini splits input from output, which makes the answer depend on the talk-time split.

| Talk split | Gemini / min | vs GPT-Live $0.05 |
|---|---|---|
| Both directions continuously (Gemini worst case) | $0.023 | 2.2x cheaper |
| 50/50 conversation | $0.0115 | 4.3x cheaper |
| Model speaks 70% (agent-heavy) | $0.0141 | 3.5x cheaper |
| Model speaks 30% (user-heavy) | $0.0089 | 5.6x cheaper |

**Two effects widen the gap beyond that table.** Gemini's output rate *includes thinking tokens*,
whereas GPT-Live bills delegated reasoning on top — so a reasoning-heavy agent diverges further.
And GPT-Live's 15-second pre-bill is 50% overhead on a 30-second interaction, where Gemini's
metering has no floor.

**Two cost traps, both defaults rather than rates.** Video input is cheap ($0.002/min) but
`TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO` is the DEFAULT, so it is billed unless opted out —
+17% on a 50/50 audio blend, and the reason §5.1 makes `TurnCoverage` explicit. And search
grounding at $14/1,000 after a 5,000/month allowance *shared across the whole Gemini 3.x estate*
is ~500 sessions/month at one search per turn over ten turns.

For the `MJ: AI Model Costs` rows in step 9: the seconds-vs-tokens split is why the GPT-Live PR's
`UsageBases?: readonly ('tokens' | 'seconds')[]` is deliberately a list and not an exclusive enum.
Gemini is token-metered with a per-minute equivalence; GPT-Live is second-metered with separate
token billing for delegation. Both need both bases.

## 8. Out of scope

- Live carrier/telephony media for these models (needs real credentials; separate).
- The `Metadata_Sync` release migration (build engineer).
- PostgreSQL counterparts (toolchain, at release).
- Retiring `gemini-3.1-flash-live-preview` — it stays supported; the capability matrix is what makes that cheap.
- Gemini 3.8 Flash (non-Live) — different surface, not this PR.

---

## 9. Open questions

1. **§3.1** — is our `turnComplete: true` commit interrupting generation on 3.1 today? Highest risk in the PR.
2. How is a thought part marked on the wire? (§5.3)
3. Does `interaction_status` appear on `gemini-3.8-live` too, or only Extended Thinking? The comparison table names it only for the latter; if it is universal, `IdleSignal` collapses to one value and the code gets simpler.
4. Is turn coverage configurable per session, and what does MJ want as its default given the cost of always-on video?
5. Video/screen input (§5.5): does it land in this PR or the next one? It is additive and the
   architecture has room, but it is a new modality with a capture surface, a consent/permission
   story, and a bandwidth/cost profile of its own — a strong candidate for its own PR once the
   audio path is proven on 3.8.
6. Per-model parameters (§5.6): typed, declared passthrough, or both? Blocks nothing until step 4,
   but the answer decides whether each future provider knob is a Core release.
7. Does `RequestSpokenUpdate`'s "narration is disposable, skip when a response is in flight" collision rule still make sense when the model can speak and reason at once?

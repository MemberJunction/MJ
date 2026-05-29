# Streaming & Voice Architecture — analysis and plan critique

**Author:** Pranav Rao
**Date:** 2026-05-29
**Branch:** `feature/voice-channels`
**Status:** Analysis / discussion input for the MJ Voice Agents group (Amith, Ethan, Arie, Dray, John)

This document does three things:

1. Reports what the working-tree prototype on `feature/voice-channels` actually builds.
2. Lays out the streaming model I think MJ should converge on, and why.
3. Critiques the three MJ design docs in play — AN's channels plan (PR #2489), AN's inter-turn streaming plan (PR #2576), and my own counter-take — and proposes a direction.

The headline is at the top. Everything after it is the supporting argument.

---

## TL;DR

- **The prototype works end-to-end for cascaded voice** (Deepgram STT → loop agent → ElevenLabs TTS, with barge-in, VAD, turn detection, filler policy, and a LiveKit-backed Angular widget). That's real and demonstrable.

- **There is one load-bearing flaw.** MJ's loop agent emits its entire turn as a single structured-JSON envelope (`LoopAgentResponse`). To stream *anything* to the user you have to reach inside that JSON mid-flight. The prototype does this with a hand-written char-by-char JSON path filter (`MessageFieldExtractor`) whose own header comment says it exists because *"piping LLM tokens to TTS spoke the entire JSON envelope, which is the bug this class fixes."* PR #2576 attacks the same problem from the other side — it adds a *separate* `streamingMessage` field so the model emits a short progress string the loop can forward. **Both are workarounds for the same root cause: the response is an opaque blob, so the structure you want to stream (spoken text vs. reasoning vs. tool calls vs. progress) isn't in the event types — it's buried in JSON you have to re-parse.**

- **The fix:** put the structure in the *event stream*, not in a JSON payload. A normalized, content-block event model — typed `TextDelta` / `ThinkingDelta` / `ToolCallDelta` events that each provider normalizes into — means "stream the spoken answer to TTS" is just *forward the `TextDelta` events*. No JSON parsing, no `MessageFieldExtractor`, no `streamingMessage` field, no model-compliance risk, and the first token reaches TTS immediately instead of after you've parsed enough JSON to locate the `message` key.

- **The catch — and it's real:** MJ's loop agent is a *conductor*. It needs structured control flow (`taskComplete`, `nextStep`, `payload`) that a flat tool-calling loop doesn't have. So MJ can't just delete structured output. The resolution is the one my counter-take already gestures at: **voice (and any latency-sensitive streaming surface) should run on a streaming-native path that uses native tool-calling + content-block events, not the conductor's JSON envelope.** The conductor is the wrong substrate for low-latency speech.

- **Latency is the real requirement, and the team already named it.** On #2489, Ethan flagged ~300–500ms of pre-execution overhead (sequential DB writes + `Execute()` init) *before the first token* on a fresh session. AN replied that voice needs to *"keep the 'run' open … rather than each message being an agent run."* Both fixes — a **persistent session** and a **content-block stream that puts the first token straight to TTS** — point at the same streaming-native path. The conductor's per-message JSON envelope works against both. So this isn't a fight with AN's design; it's extending a conclusion he's already reached out loud (see §4).

- **On the channels-vs-minimal debate (2489 vs my take):** the prototype has *already paid* most of the abstraction cost, and it works. The pragmatic move is not "rebuild smaller" — it's "keep the channel/transport scaffolding, fix the streaming substrate inside the engine." That's where the leverage is.

---

## 1. What the prototype actually is

The working tree implements **AN's `audio-agent-architecture.md`** (the PR #2489 plan), phases 1(a)–1(c), to a genuinely working cascaded-voice slice.

**Data model** (`migrations/v5/V202605221341__v5.36.x__Voice_Channels_Schema.sql`): three new tables — `AIAgentChannel` (channel-type lookup with `DriverClass` + config-schema discriminator), `AIAgentChannelConfig` (agent×channel join with sparse JSON overrides + voice-profile FK + latency budget), `AIVoiceProfile` (portable persona: language, style hint, sample audio, per-provider overrides JSON). Plus `AIAgentRun.AIAgentChannelID` and `ConversationDetail.AIContentTypeID`. All additive.

**Runtime** (`packages/AI/AgentChannelRuntime/`):
- `ChannelSession` — loads metadata, deep-merges `DefaultConfigJSON ⊕ per-agent override ⊕ caller override`, validates against the config schema, resolves the engine via `ClassFactory`, creates the `AIAgentRun`, runs.
- `BaseChannelEngine` → `TextChatChannelEngine`, `CascadedChannelEngine` (the real one, ~400 lines).
- Strongly-typed discriminated-union config (`types/channel-config.ts`) over five `ChannelKind`s.
- `AudioFrameBus` (multicast frame bus), `EnergyVAD` + `SileroVAD` (latter is a stub that throws), `SilenceTurnDetector`, `InterruptChannel` (barge-in).
- Transports: `WebRTCTransport` (LiveKit), `WebSocketTransport`, `TextInputAudioOutputTransport` (test).

**Streaming primitives in the prototype today** — note the split:
| Concern | Primitive | Where |
|---|---|---|
| STT output | `AsyncIterable<TranscriptEvent>` | `baseAudio.ts` `TranscribeStream`, Deepgram impl |
| TTS input/output | `AsyncIterable<string>` → `AsyncIterable<AudioFrame>` | `baseAudio.ts` `SynthesizeStream`, ElevenLabs impl |
| Realtime S2S | **callbacks** (`OnAudio`, `OnTranscript`, `OnToolCall`) | `baseRealtimeSpeech.ts:115-128` |
| Agent → spoken text | **hand-rolled JSON filter + callback** | `MessageFieldExtractor.ts` + `transcript-event.ts` |
| Transcript display | **callbacks** (`ChannelTranscriptListener`, 4 event kinds) | `transcript-event.ts:30-86` |

**Core abstractions** (`packages/AI/Core/`): `BaseRealtimeSpeech` (duplex S2S contract), `BaseAudioGenerator` extended with optional `TranscribeStream`/`SynthesizeStream`, `ActionEngine` gains `OnProgress` + `ChannelContext`.

**What works E2E:** text chat, cascaded voice (Deepgram+ElevenLabs), streaming STT/TTS, barge-in, filler policy, tool calls via the existing `ClientToolRequestManager`, the Angular voice widget.

**What's stubbed:** `SileroVAD` inference, the realtime engine (only the contract exists), all phone/SIP transports, Cartesia/AssemblyAI/Azure providers, and the realtime providers (gpt-realtime, Gemini Live).

---

## 2. The streaming model we should converge on

The streaming layer is where the leverage is, and the right shape is well-understood — it's essentially what the major model SDKs already expose once you normalize across providers. The properties that matter:

**(a) One normalized event union; every provider normalizes into it.** A single discriminated union covering the content kinds a turn can produce — text, reasoning ("thinking"), and tool calls — each with a `start` / `delta` / `end` lifecycle, addressed by a `contentIndex` into the message's content array. Each provider (Anthropic, OpenAI, Gemini, …) has a thin adapter that maps its idiosyncratic wire format onto this *one* union. Consumers code against the union, never the provider.

```ts
// The shape (MJ-flavored further down in §5.2)
type StreamEvent =
  | { kind: 'TextStart'|'TextDelta'|'TextEnd';         contentIndex: number; ... }
  | { kind: 'ThinkingStart'|'ThinkingDelta'|'ThinkingEnd'; contentIndex: number; ... }
  | { kind: 'ToolCallStart'|'ToolCallDelta'|'ToolCallEnd'; contentIndex: number; ... }
  | { kind: 'Done';  reason: 'Stop'|'Length'|'ToolUse'; ... }
  | { kind: 'Error'; reason: 'Aborted'|'Error';         ... };
```

The single most important property: **the spoken text, the reasoning, and the tool calls are *different event types*, separated at the boundary** — not interleaved inside one JSON string the consumer has to re-parse.

**(b) Every event carries the full message-so-far.** Each delta event includes the accumulated partial message, not just the increment. Consumers re-render the partial; they never fold deltas themselves. Kills a whole class of accumulation bugs.

**(c) Errors are values, not exceptions.** Once a stream starts, the producer never throws — failures arrive as a terminal `Error` event carrying the partial message and a reason (`Aborted` / `Error`). Consumers have zero try/catch around the stream; abort and failure are ordinary terminal states. **For voice this is not optional** — a provider hiccup mid-utterance must degrade gracefully, not tear down the call.

**(d) A dual stream/result primitive.** A stream object that is simultaneously an `AsyncIterable<event>` (the deltas) *and* exposes `.result(): Promise<final>` (the assembled message). A caller picks `for await` (incremental, for voice) or `await stream.result()` (just give me the answer, for batch) — one object, no second code path, no duplicated assembly logic.

**(e) Two-layer nesting.** The multi-turn agent loop emits a richer event union (turn boundaries, tool-execution lifecycle, agent start/end) and the per-message content events ride *inside* it. Turn/tool orchestration is cleanly separated from token streaming — which is exactly the separation voice needs (turn boundaries → progress UI; text deltas → TTS).

**(f) A forgiving partial-JSON parser** for streaming *tool arguments* — cascading repair that never throws (worst case returns `{}`), so the UI can render tool args mid-stream as they accumulate.

**(g) Cancellation via `AbortSignal` threaded everywhere**, surfacing as an `Error('Aborted')` terminal event. Resumption is at the *conversation* level (continue from existing context), not byte-level mid-stream resume.

None of this is exotic; it's the boring, correct shape. MJ doesn't have it today because the loop agent's structured-JSON envelope sits *in front of* the stream rather than the stream carrying typed structure.

---

## 3. The central insight: structured-output JSON is fighting your streaming

This is the part that matters most, so I'll be explicit.

MJ's loop agent returns **one JSON envelope per turn**:
```json
{ "taskComplete": true, "message": "Hi there!", "reasoning": "...", "nextStep": {...}, "payload": {...} }
```

The user-facing spoken text is `message`. But the *token stream* from the LLM is the serialized JSON, in key order, with `reasoning` and `nextStep` interleaved. So to feed TTS you must:

1. Wait for `"message"` to appear at depth 1,
2. Track string/escape/nesting state to know when its value starts and ends,
3. Emit only those inner characters.

That is exactly what `MessageFieldExtractor` (220 lines, char-by-char state machine, full `\uXXXX` handling) does. Its docstring is the confession:

> *"Naively piping LLM tokens to TTS spoke the entire JSON envelope, which is the bug this class fixes."*

Independently, PR #2576 hits the *same wall* from the other direction. Its premise:

> *"True LLM token streaming through every turn would mostly leak internal reasoning JSON and noise. The right granularity is one user-facing message per turn."*

So #2576's fix is to add a **separate** `streamingMessage?: string` field that the model populates each turn, conditionally injected into the schema only when an `onStreaming` hook is wired (clever — zero token cost when off). The loop forwards that string between turns.

Step back and look at what's happening:

- `MessageFieldExtractor` exists because you **can't cleanly stream the answer** out of the JSON.
- `#2576` exists because you **can't cleanly stream progress** out of the JSON.
- A voice agent would end up running **both at once**: the extractor pulls `message` out for TTS, *and* `streamingMessage` carries progress — two streaming mechanisms layered onto one structured blob.

A content-block event model dissolves all of it. If your events are typed by content kind:
- **Spoken answer** = forward `TextDelta` events to TTS. No JSON parsing. First token hits TTS immediately (lower latency — a real win for voice, where you otherwise can't start speaking until you've parsed past whatever keys precede `message`).
- **Reasoning** = `ThinkingDelta` events you choose to show or suppress. Never leaks into the spoken stream by construction.
- **Progress / turn boundaries** = turn-start/turn-end/tool-execution events from the agent layer. No extra model field, so **#2576's Risk #1 ("models may omit `streamingMessage`") disappears** — turn boundaries are emitted by *your* loop, not the model's goodwill.
- **Tool calls** = `ToolCallDelta` events, with a forgiving partial-JSON parser if you want live args.

**The structure you want to stream lives in the event types instead of in a JSON string you re-parse mid-flight.**

### The legitimate objection

MJ's loop agent is a **conductor**, not a flat chat loop. It genuinely needs `taskComplete` / `nextStep` / `payload` for control flow, sub-agent delegation, and planning. A flat tool-calling loop has none of that — tool calls are native, there's no "nextStep" to express. So **MJ cannot simply drop structured output**; the conductor needs it.

That's the real tension, and it's the same one my counter-take (`voice-channels-fn-take.md`) names:

> *"AN's original draft had the right insight — the fast layer was an LLM with tools, not the conductor. The channel-based rewrite collapsed this by forcing everything through `BaseAgent`, and lost the insight."*

The conclusion isn't "make the conductor stream cleanly" (you can't, cheaply — the JSON envelope is intrinsic to it). It's **"don't put voice on the conductor."**

---

## 4. Engaging AN's two PRs directly

Both #2489 and #2576 are plan-only, and AN explicitly invited disagreement: *"Comment on any design decisions you disagree with… debate various approaches and finalize."* This section is in that spirit. Notably, the two most useful things in these PRs aren't in the plan files — they're in the review threads.

### 4.1 The latency budget — AN and Ethan already found the real problem

On #2489, EL-BC (Ethan) raised the point that matters most for an LXP voice tutor:

> *"`RunAgentInConversation` has a sequence of 3–4 sequential DB writes … before the agent even starts, and then `BaseAgent.Execute` has its own initialization phase on top of that — we're looking at potentially 300–500ms before the first LLM token is generated on a fresh session. For voice that needs to feel conversational, that's a big chunk of the total latency budget before the model has said a word."*

AN's reply is the important part:

> *"I think we need to keep the 'run' open in audio mode rather than each message being an agent run is the key difference."*

That is AN agreeing, in his own words, that **the per-message-as-an-agent-run model is wrong for voice.** It's the same conclusion this analysis reaches from the streaming angle, arrived at independently from the latency angle. Put them together and you have the whole latency story for a conversational tutor — two additive costs, both on the critical path:

| Latency source | Cost | Fix |
|---|---|---|
| Pre-execution DB writes + `Execute()` init, *per message* | ~300–500ms before first token (Ethan) | One **persistent session/run** for the call (AN), not a fresh agent run per utterance |
| Structured-JSON envelope: can't speak until the `message` key is parsed out of the stream | first-token-to-speech delayed by however many keys precede `message` | **Content-block `TextDelta`** stream → first token straight to TTS |

The channels plan addresses neither directly today, and the prototype's `MessageFieldExtractor` *adds* to the second. A streaming-native, persistent-session path attacks both at once — which is why it's the right v1 substrate for LXP, not a nice-to-have.

### 4.2 #2576 already tried — and rejected — token streaming. A content-block stream is a third option neither version names.

#2576's own commit history is instructive:

- **v0** (`9f5c826`): *"raw token streaming through `AIPromptRunner.executeModel` + per-provider native streaming."* **Superseded.**
- **v2** (`05d1959`): the `streamingMessage` field. Current.

AN rejected v0 because raw token streaming *"leaks internal reasoning JSON and noise."* **He's right that v0 was wrong — but for a reason that doesn't generalize.** v0 streamed the *raw serialized tokens of the JSON envelope*, so of course it leaked the envelope. A content-block model doesn't stream raw tokens; it streams **events that are already separated by content type** — text vs. thinking vs. tool-call — because normalization happens at the provider boundary, before anything reaches the consumer.

So there are three designs on the table, not two:

| Design | What streams | Leaks reasoning? | First-token-to-TTS | Model-compliance risk | Extra tokens |
|---|---|---|---|---|---|
| **#2576 v0** (rejected) | raw JSON-envelope tokens | yes | — | none | none |
| **#2576 v2** (current) | a model-written `streamingMessage` summary, per turn | no | — (not the real answer) | yes — model may omit field | ~1 field/turn |
| **prototype `MessageFieldExtractor`** | `message` value parsed out of JSON mid-stream | no | delayed by parse | none | none |
| **content-block events** (proposed for voice) | provider-normalized `TextDelta`/`ThinkingDelta`/`ToolCallDelta` | no — separated by construction | immediate | none | none |

The last row is strictly better than the other three *for voice*, and it's the one neither PR considers. v2 stays the right answer for text-chat progress pings on the conductor (where you genuinely don't want the real tokens). They serve different surfaces — not competitors.

### 4.3 The merge AN requested exposes the contradiction

AN's instruction on #2576: *"Merge this branch into #2489 then close this PR."* Fine — but note what merging them puts side by side:

- #2576's design explicitly lists, under *"What this design avoids"*: **"No streaming JSON parser, no field extraction, no SSE handling."**
- The #2489 prototype ships `MessageFieldExtractor` — **a streaming JSON parser that does field extraction.**

Same branch, opposite philosophies. That's not a mistake to scold — it's the tell that **two different surfaces are being forced through one mechanism.** Text-chat progress (#2576) genuinely doesn't need to parse the stream; voice TTS (the prototype) genuinely does — *as long as the answer is trapped in the envelope.* Resolve it by giving voice its own content-block stream, so neither surface parses JSON. Then #2576's "no field extraction" promise holds everywhere and `MessageFieldExtractor` is deleted rather than merged in.

---

## 5. Proposed direction

### 5.1 Split the substrate by latency, not by modality

A loop/conductor agent and a streaming-native agent are different runtimes. Voice rides the second one.

- **Conductor path (existing `BaseAgent` + `LoopAgentType`):** structured JSON, planning, sub-agents, `nextStep`. Keep it. #2576's `streamingMessage` field is a *fine tactical patch here* — for text chat where you're stuck with the envelope and just want cheap "Searching the knowledge base…" pings between turns. Ship #2576 for that. Just don't let it become the voice streaming story.

- **Streaming-native path (my `runStreamingAgent`):** native tool-calling, content-block event stream, clean text out. This is what `CascadedChannelEngine` and the realtime engine should consume. When such an agent needs heavy lifting (a real plan, sub-agents), it *delegates* to the conductor as a tool call — which is AN's own original "fast layer delegates to standard agents transparently" insight.

This makes `MessageFieldExtractor` **deletable** on the voice path (it remains only if you ever must voice-enable a pure conductor agent, as a degraded fallback).

### 5.2 Define a normalized content-block event union for the streaming-native path

Concretely (PascalCase per MJ conventions, no `any`):

```ts
export type AgentStreamEvent =
  | { Kind: 'TurnStart' }
  | { Kind: 'TextStart';     ContentIndex: number; Partial: AssistantTurn }
  | { Kind: 'TextDelta';     ContentIndex: number; Delta: string; Partial: AssistantTurn }
  | { Kind: 'TextEnd';       ContentIndex: number; Content: string; Partial: AssistantTurn }
  | { Kind: 'ThinkingDelta'; ContentIndex: number; Delta: string; Partial: AssistantTurn }
  | { Kind: 'ToolCallStart'; ContentIndex: number; ToolName: string }
  | { Kind: 'ToolCallDelta'; ContentIndex: number; PartialArgs: Record<string, unknown> }
  | { Kind: 'ToolCallEnd';   ContentIndex: number; ToolCall: ToolCall }
  | { Kind: 'ToolResult';    CallID: string; Result?: unknown; Error?: string }
  | { Kind: 'TurnEnd';       Turn: AssistantTurn }
  | { Kind: 'Done';   Reason: 'Stop'|'Length'|'ToolUse'; Final: AssistantTurn }
  | { Kind: 'Error';  Reason: 'Aborted'|'Error'; Error: AssistantTurn };
```

The three properties to insist on (§2 a/b/c):
1. **`Partial` on every event** — kills delta-folding bugs; the widget re-renders `Partial` instead of accumulating.
2. **Errors-as-values** — for voice this is not optional. A provider hiccup mid-utterance must be a recoverable `Error` event (fall back, retry, "sorry, didn't catch that"), not an exception that tears down the session. This is the biggest robustness gap in the prototype's current throw-based paths (`SileroVAD` throws; streaming providers throw).
3. **A dual stream/result primitive** — give `AIPromptRunner`/the streaming agent one object that is both `for await`-able (voice) and `await .result()`-able (batch).

### 5.3 Reconsider the callback sprawl

The prototype delivers transcript display and realtime audio via **fire-and-forget callbacks** — `ChannelTranscriptListener` (4 event kinds) and `BaseRealtimeSpeech`'s `OnAudio`/`OnTranscript`/`OnToolCall`. `transcript-event.ts` defends this ("engines already own their per-turn state machine; a callback keeps wiring local"). It's a reasonable call, but it has costs the event-stream model avoids:
- Callbacks **can't apply backpressure** — if the widget/transport is slow, events pile up with no flow control. An awaited `for await` loop lets a slow subscriber throttle the producer.
- Ordering across *multiple* callbacks (`OnAudio` vs `OnTranscript` vs `OnToolCall`) is implicit; a single event union makes interleaving explicit and testable.
- You can't `for await` a callback, so composition (tee to TTS *and* to transcript *and* to logging) is manual.

Recommendation: model the realtime session and the transcript feed as **one `AsyncIterable<event>` each**, and let the consumer fan out. Keep callbacks only at the very edge (the GraphQL resolver → PubSub), not as the engine's internal contract.

### 5.4 Two correctness flags (not voice-specific)

- **Reasoning signature round-tripping.** Reasoning models (o-series, Gemini thinking) return opaque continuation tokens alongside their thinking that must be replayed verbatim on the next turn for the conversation to stay valid. A content-block model treats thinking as a first-class block and carries those signatures; MJ's `LoopAgentResponse` collapses reasoning into a plain JSON field — I suspect we're **dropping these signatures across turns**, which is a latent correctness bug for reasoning models regardless of voice. Worth an explicit check.
- **Use a forgiving partial-JSON parser** wherever MJ parses partial model JSON (today: `MessageFieldExtractor`; tomorrow: any partial tool-args rendering). A cascading-repair parser that never throws is more robust than the bespoke extractor.

---

## 6. Plan-by-plan verdict

**PR #2489 (`audio-agent-architecture.md`, channels):** The abstraction is sound and the prototype proves the cascaded path. Its weakness is *internal*, not structural: the engine streams by parsing the conductor's JSON. Keep the channel/transport/engine scaffolding; swap the engine's input from "conductor JSON + `MessageFieldExtractor`" to "streaming-native agent + content-block events." The big-abstraction-vs-minimal question (phone/SIP/multi-participant in v1?) should be answered by the **LXP use case**, which is browser-voice-first — phone/SIP are **out of this window** for Ethan's tutor. But since the scaffolding is already built and working, the cost of keeping it is sunk; I wouldn't tear it out.

**PR #2576 (`agent-content-streaming.md`, inter-turn `streamingMessage`):** Good tactical patch for the **text-chat conductor** case. The conditional-schema/zero-token-when-off design is genuinely nice. Ship it *there*. But recognize it for what it is — a workaround for the opaque-envelope problem — and **do not adopt it as the voice streaming mechanism**. For voice you need the real answer streamed to TTS (content-block `TextDelta`), and you want turn boundaries from your own loop, not a model-populated field that Risk #1 admits models will sometimes omit.

**My counter-take (`voice-channels-fn-take.md`, streaming-native `runStreamingAgent`):** the core instinct holds — a streaming-native runtime alongside the conductor, not through it. Where I'd revise my own doc: don't frame it as "minimal vs AN's big plan / 0 tables vs 3 tables." The prototype already built AN's scaffolding and it works; the metadata-driven channel/voice-profile model is more appropriate for MJ's multi-tenant world than my config-file approach. **Merge the two:** keep AN's channel/transport/profile metadata + engine structure, and put *my* `runStreamingAgent` (re-shaped to the content-block event union) underneath the engines as the thing they actually stream from. That's the synthesis.

---

## 7. Voice-specific concerns the streaming model doesn't address

These are MJ's own problems — the prototype is already strong here and they sit outside the streaming-layer discussion:
- VAD / turn detection / barge-in / filler policy (voice-specific; well-modeled already).
- Transport abstraction for audio (WebRTC/LiveKit/SIP).
- `AIVoiceProfile` portability across providers — a genuinely good MJ-specific abstraction.
- Metadata/DB-driven config — appropriate for MJ's multi-tenant world.

One voice-specific point worth stating outright: **structured output adds speech latency.** With the conductor envelope you cannot emit the first phoneme until you've parsed past every JSON key preceding `message`. A clean `TextDelta` stream lets TTS start on the first token. For a real-time tutor, that's the difference between snappy and laggy — another reason voice belongs on the streaming-native path.

---

## 8. Open questions for the group

1. Do we commit to a **persistent voice session** (one open run per call) over per-utterance agent runs — the thing AN already flagged on #2489? This is the single biggest latency lever.
2. Do we accept the **two-runtime split** (conductor vs streaming-native), with voice on the latter and delegation back to the conductor for heavy work?
3. Are we willing to define and standardize the **normalized `AgentStreamEvent` union** + adopt errors-as-values across streaming paths? (Highest-leverage change; touches `AIPromptRunner`.)
4. Is **phone/SIP** truly out of LXP v1? (My read: yes, out of this window.) If so, the channel abstraction is "keep but don't extend."
5. Should we audit **reasoning-signature round-tripping** before it bites us on reasoning models?
6. Ship **#2576 for text chat** independently, decoupled from the voice path? (I think yes.)

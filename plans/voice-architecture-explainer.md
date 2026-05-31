# Voice Agents — How It Works (Demo Explainer)

**What you recorded:** you spoke to Sage, asked it to "bring in Code Smith and calculate the loan interest," a **Delegating to Code Smith…** block appeared and turned into **done ✓**, and Sage spoke the real answer. This doc explains every layer that made that happen.

---

## 1. The one-paragraph version

Every agent conversation runs over a **Channel** (text-chat, voice-cascaded, voice-realtime…). A channel is just metadata that says *which engine drives it* and *with what config*. For voice-realtime, the engine opens a live **speech-to-speech session** with a model (Gemini Live / GPT Realtime) and acts as a **bridge**: your words go in, the model's audio comes out, and — critically — when the model decides to **call a tool**, the engine runs **real MemberJunction work** (an action, or *delegating to another agent*) and streams the progress back as **blocks**. "Blocks" is the unifying idea: one typed event stream that carries text, audio cues, *and* tool calls — so the same mechanism gives you low-latency speech **and** real capability **and** visible progress.

---

## 2. The layers (who talks to whom)

```
┌─────────────────────────────────────────────────────────────────────┐
│ BROWSER  (Explorer :4205)                                             │
│   <mj-voice-widget>                                                   │
│   • mic → Web Speech API (STT) → debounced text                       │
│   • plays agent audio (Web Audio API)                                 │
│   • renders transcript + TOOL-CALL BLOCKS                             │
└───────────────┬───────────────────────────────────────────────────────┘
                │  GraphQL (mutations + graphql-ws subscriptions)
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MJSERVER / MJAPI  (:4005)   ChannelSessionResolver                    │
│   mutations:  StartChannelSession · SubmitChannelTextTurn · End       │
│   subs:       ChannelAudioOut (audio) · ChannelTranscript (text+blocks)│
│   picks the TRANSPORT, publishes audio/blocks over PubSub             │
└───────────────┬───────────────────────────────────────────────────────┘
                │  in-process
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ @memberjunction/ai-agent-channel-runtime                              │
│   ChannelSession  → loads metadata, merges config, creates AIAgentRun,│
│                     resolves the ENGINE by DriverClass (ClassFactory) │
│   ┌──────────────────────────┐   ┌──────────────────────────────────┐ │
│   │ CascadedChannelEngine    │   │ RealtimeChannelEngine            │ │
│   │ STT → loop agent → TTS   │   │ bridges a live S2S session       │ │
│   │ (StreamToTTS = blocks    │   │ text/audio in · audio out ·      │ │
│   │  → TTS as they stream)   │   │ TOOL CALLS → real MJ work        │ │
│   └──────────────────────────┘   └───────────────┬──────────────────┘ │
└───────────────────────────────────────────────────┼───────────────────┘
                                                     │ BaseRealtimeSpeech
                                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Provider drivers (implement one contract: BaseRealtimeSpeech)         │
│   GeminiLiveRealtimeSpeech   (@google/genai .live, v1alpha)           │
│   OpenAIRealtimeSpeech       (OpenAIRealtimeWebSocket)                 │
│   SendAudio · SendText · OnAudio · OnTranscript · OnToolCall · Cancel │
└─────────────────────────────────────────────────────────────────────┘
```

The engine never knows *which* model it's talking to — it only knows `BaseRealtimeSpeech`. The model never knows about MJ — it just emits tool calls. The engine is the bridge between those two worlds.

---

## 3. The demo, step by step (voice-realtime + delegation)

```
 You speak ─▶ browser STT ─▶ (pause ~1.4s) ─▶ SubmitChannelTextTurn(text)
                                                       │
                                                       ▼
   RealtimeChannelEngine receives it as a "user-text" control event
                                                       │  session.SendText(text)
                                                       ▼
   ┌────────────── Gemini Live session (open WebSocket) ──────────────┐
   │  decides: this needs Code Smith → emits a FUNCTION CALL:         │
   │     delegate_to_agent(agent_name="Code Smith", task="…loan…")    │
   └───────────────────────────┬──────────────────────────────────────┘
                               │  session.OnToolCall(call)
                               ▼
   RealtimeChannelEngine.routeToolCall → delegateToAgent:
     1. emit BLOCK  → "Delegating to Code Smith…"  (status: running)   ─▶ widget
     2. fuzzy-match "Code Smith" → real agent "Codesmith Agent"
     3. AgentRunner.RunAgent(Codesmith, task)   ← REAL sub-agent run (14.7s)
     4. emit BLOCK  → "Codesmith Agent done (14.7s) ✓"  + result      ─▶ widget
     5. return the real answer to the model  (sendToolResponse)
                               │
                               ▼
   Gemini resumes, SPEAKS the real number  ─▶ OnAudio frames ─▶ ChannelAudioOut ─▶ browser plays
                                            └▶ OnTranscript ─▶ ChannelTranscript ─▶ widget shows text
```

The key beat: **step 3 is real.** There's an `AIAgentRun` row in the database for "Codesmith Agent — Completed." The model didn't pretend; the engine made MJ actually do the work and fed the truth back.

---

## 4. "Blocks" — the idea that ties it together

A **block** is one typed unit in the stream. The conversation isn't a blob of text — it's a sequence of blocks, each with a kind and a lifecycle:

| Block kind        | What it carries                  | What it drives                          |
|-------------------|----------------------------------|-----------------------------------------|
| **text**          | words of the answer (deltas)     | TTS speaks them *as they arrive* (low latency) |
| **thinking**      | model reasoning                  | hidden from speech by construction      |
| **tool-call**     | a function the agent invokes     | **executes real work** + shows progress |
| **tool-result**   | the outcome                      | fed back to the model + shown as "done" |

Because tool calls are *first-class blocks* (not buried inside a JSON string), the same stream simultaneously: (a) feeds audio out with no parsing delay, (b) carries executable capability, and (c) renders as visible progress. That's why "delegate to Code Smith" can be **low-latency, real, and visible at once** — they're all just blocks.

- The normalized block union lives in `ai-core-plus/src/agent-stream-events.ts` (`AgentStreamEvent`).
- The UI-facing block events ride the `ChannelTranscript` subscription (`ToolCallBlockEvent`, `assistant-text`, `user`).

---

## 5. Cascaded vs Realtime (two engines, one abstraction)

| | **voice-cascaded** | **voice-realtime** |
|---|---|---|
| Pipeline | STT → MJ loop agent → TTS | one model does speech↔speech |
| The "brain" | MJ's conductor/loop agent (full planning, sub-agents) | the realtime model (Gemini/OpenAI) |
| Text streaming | `StreamToTTS`: agent text blocks → TTS as they stream | model streams native audio directly |
| Tools | the loop agent's normal tool/sub-agent machinery | model emits tool calls → engine routes to MJ |
| Latency | higher (3 hops) | lowest (1 model) |
| Today's demo | works (Anthropic + ElevenLabs) | **this is what you recorded** (Gemini Live) |

Same channel abstraction, same block stream, same widget — you swap the engine by changing one metadata row.

---

## 6. The metadata model (no code to add a channel)

```
AIAgentChannel        ── "voice-realtime" → DriverClass "RealtimeChannelEngine"
AIAgentChannelConfig  ── Sage × voice-realtime → { Realtime.AIModelID: "Gemini 2.0 Flash Live" }
AIModel               ── "Gemini 2.0 Flash Live" (type RealtimeSpeech)
   └─ AIModelVendor   ── DriverClass "GeminiLiveRealtimeSpeech", APIName "gemini-2.5-flash-native-audio-latest"
```

To switch Sage from Gemini → GPT Realtime: change one lookup (`Gemini 2.0 Flash Live` → `GPT Realtime 2`) and push. No code.

---

## 7. Component reference (where each piece lives)

| Component | File |
|---|---|
| Block event union (the substrate) | `packages/AI/CorePlus/src/agent-stream-events.ts` |
| Channel orchestrator | `packages/AI/AgentChannelRuntime/src/ChannelSession.ts` |
| Cascaded engine (StreamToTTS) | `packages/AI/AgentChannelRuntime/src/engines/CascadedChannelEngine.ts` |
| Realtime engine (+ delegate tool) | `packages/AI/AgentChannelRuntime/src/engines/RealtimeChannelEngine.ts` |
| S2S driver contract | `packages/AI/Core/src/generic/baseRealtimeSpeech.ts` |
| Gemini Live driver | `packages/AI/Providers/Gemini/src/geminiLive.ts` |
| GPT Realtime driver | `packages/AI/Providers/OpenAI/src/models/realtime.ts` |
| Tool-call block event | `packages/AI/AgentChannelRuntime/src/types/transcript-event.ts` |
| GraphQL surface + transport pick | `packages/MJServer/src/resolvers/ChannelSessionResolver.ts` |
| Browser widget | `packages/Angular/Generic/voice-widget/src/lib/voice-widget.component.ts` |

---

## 8. Honest caveats (so you don't oversell on camera)

- **Turn-based, not full-duplex.** Input is browser speech-to-text → text turn → model. The ~1.4s pause debounce makes it feel conversational, but you can't interrupt it by talking over it yet (that needs streaming raw mic audio into the model's own VAD).
- **One tool wired** (`delegate_to_agent`). `run_action` / `run_query` slot in identically.
- **Realtime model role-plays Sage** via a system prompt built from the agent's name/description — it isn't the MJ loop agent itself. The *delegated* sub-agent (Code Smith) IS a real MJ agent run.
- Prototype caliber, as intended — not ship-ready.
```

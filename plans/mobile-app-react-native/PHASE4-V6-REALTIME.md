# Mobile App — Phase 4: v6 Completion, Realtime Co-Agents, and the Runtime Extraction

**Branch:** `an-mobile-app-v6-complete` (cut from `origin/next` @ `099b4d9634`, v6.1.0-edge.6)
**Predecessors:** PR #2617 (Phase 1) and the Phase 2/3 work — **both merged to `next`**.
**Revision 2** (2026-09-13) — rewritten after studying PR #4397 (GPT-Live-1, direct actions,
capability-gated tool calling) and auditing the Angular realtime layer. §3 and §4 changed
materially; Revision 1's transport argument was right by accident and is corrected in §3.2.

---

## 0. The governing principle

> **Use the MJ Realtime framework everywhere. Implement the thinnest possible UX layer to make
> it mobile-native. Throw out mobile-specific code that duplicates a core primitive.**

Every item below is measured against that. Where MJ has a primitive, mobile consumes it. Where a
primitive exists but is *trapped* in an Angular package, we **propose** extracting it (§4) rather
than forking it into the mobile app — a fork is how the two surfaces drift.

---

## 1. Completeness audit of the prior plan

Verified against v6 source, not the prior session's notes.

### Genuinely complete

| Item | Evidence |
|---|---|
| Phase 1 in full — Apollo removal, `markdown-core`, interactive components, dashboards, profile | 134 files, Maestro-verified |
| Auth (Auth0 PKCE / MSAL / dev-JWT), navigation, conversation list, chat thread, artifacts, Explorer | Screenshot-verified |
| P2.4 Biometric app lock | `AppLockGate` + `useAppLock` + toggle, 10 tests |
| P2.5 Record editing | `RecordForm` + `BaseEntity.Validate()`, 12 tests; upstream has since fixed its composite-PK handling |
| P3.2 Offline mutation queue | MMKV-persisted queue + replay, 11 tests |

### NOT complete — carried forward

| # | Gap | Evidence | Severity |
|---|---|---|---|
| **G1** | **Voice is non-functional.** `enableRealtimePcmAudio()` is never called anywhere in the codebase, so `isRealtimePcmAudioSupported()` is permanently `false` and the service short-circuits to "voice unavailable" (`realtime-voice-service.ts:175`). | Blocking |
| **G2** | **Attachment bytes never upload.** `Status='Pending'` catalog row; composer falls back to inline text. | High |
| **G3** | **Push tokens use a single-row hack**, not per-device. Server delivery never exercised. | High |
| **G4** | **Android never verified.** No Gradle build, no emulator run. | High |
| **G5** | **Live progress is polled**, 2.5 s × 24 — `graphql-ws` never worked under RN. | Medium |
| **G6** | **E2E covers Phase 1 only**; Maestro was unrunnable (no JDK — now fixed). | Medium |
| **G7** | Dashboard parts render best-effort. | Low |
| **G8** | Default agent ignored on first message. | Low |

---

## 2. What v6 changed for realtime (PR #4397, merged 2026-09-12)

### 2.1 GPT-Live-1 — full duplex, and it retires the VAD hack

`gpt-live-1` is a **co-model architecture**: `gpt-live-1` converses while *delegating* reasoning to
a backend Responses model. It is a different protocol from GPT Realtime, not a profile of it — the
plan is explicit that two event names (`response.create`, `session.update`) exist in both with
**different meaning**, so a find-and-replace port compiles, connects, and misbehaves.

What matters for a phone:

| Concern | Legacy Realtime | **GPT Live** |
|---|---|---|
| Turn detection | `server_vad` / `semantic_vad` + thresholds | **None — the model owns turn-taking** |
| Barge-in | Client/provider VAD signal | Model-owned; **no interrupt event exists** |
| Response end | `response.done` | **No response-terminal event at all** — client tracks playback |
| Cancellation | `response.cancel` | **No cancel mechanism — it is entirely ours** |
| Transcription | Opt-in, needs a model | Both directions, timestamped, no model to configure |
| Browser/mobile auth | Ephemeral secret carried **to OpenAI by the client** | Client POSTs `{sdp}` to a **first-party MJ route**; the API key never leaves our server |

**Barge-in is prompt-steerable, not opaque.** `Interruption policy:` and `Backchannel policy:` are
named lines in OpenAI's prompt template — so barge-in quality is a **persona/config surface MJ
owns**, not client-side signal processing. That is the right place for it, and it is why VAD
tuning does not belong on the phone.

### 2.2 Capability-gated direct actions — the framework change

Previously a co-agent could only `invoke-target-agent` — correct for writes and complex work, but
2–5 s of latency for "what's the status of order 1234". PR #4397 added **direct actions**: drivers
whose profile reports `SupportsDynamicToolSet` project the target agent's allowed actions straight
into the realtime tool set, executed via `ActionEngine.RunAction` with per-call timeouts.

```jsonc
{ "realtime": { "directActions": {
    "enabled": true,
    "actionNames": ["LookupOrder", "CheckInventory"],   // or ["*"]
    "timeoutMs": 10000 } } }
```

Strictly closed by default; `'*'` must be explicitly authored. Capability-gated, so it degrades
correctly on connect-bound providers (ElevenLabs, Gemini Live, HuggingFace) which keep the stable
`invoke-target-agent` set.

**Mobile consequence: zero mobile code.** This is metadata on the agent, projected server-side.
The phone gets sub-second answers for lookups and full delegation for real work, for free. It does
change the *UX*: two visually distinct classes of agent activity to render (§5/R4).

### 2.3 Cancellation is now our responsibility

GPT Live has no cancel API, and a spoken interruption does **not** cancel backend work. The plan
requires MJ to build a task-revision counter independent of `delegation_id`, supersede-and-discard
for late results, **idempotency keys on consequential actions**, and a confirm-before-announcing
gate. This is core work, not mobile work — but the mobile call UI must reflect it honestly (never
say "cancelled" before cancellation is confirmed).

---

## 3. Realtime on native mobile

### 3.1 Why this belongs on a phone more than a desktop

Desktop has a progress pane you can watch; a phone is in your pocket. **Progress narration** — the
co-agent *speaking* "I'm pulling that up now", paced ≥5 s in and ≥8 s apart, digesting floods,
first-person, never repeating — is the mobile-shaped solution to agent latency, and its value is
higher here than where it was built. Add: one co-agent voices any agent (target is a runtime
parameter), delegation is a normal `AIAgentRun`, transcripts persist as `Conversation Detail` rows
so a call lands in the same thread the user scrolls later, and session continuity via
`LastSessionID` carries memory across legs.

### 3.2 Transport — the protocol decides, not echo cancellation

**Revision 1 argued for WebRTC on acoustic echo cancellation. That reasoning was muddled** — it
conflated AEC (a physical, signal-processing concern) with VAD (a turn-taking concern), and VAD is
the part GPT Live makes obsolete. The correct argument is simpler and stronger:

**GPT Live's client transport *is* WebRTC, and PCM on the data channel is forbidden.**
`session.input_audio.append` / `session.output_audio.delta` are explicitly not allowed there —
media rides the tracks. There is therefore **no PCM audio plane to build on RN at all**. The gap
that blocked G1 for a whole phase simply does not exist on this path.

Mechanics that matter (from the plan, verified against OpenAI's guides):
- Create the `oai-events` data channel **before** `createOffer()`.
- ICE is **non-trickle** — wait for `iceGatheringState === 'complete'`.
- The **HTTP POST starts the session**; never send `session.start` on the data channel.
- Omit `audio.format` entirely (SDP negotiates).
- **A WebRTC session pre-bills 15 s of voice**, credited back once it runs → **mint at first
  speech, not when the call screen opens.** A direct mobile UX requirement.

AEC/NS/AGC still come free from the platform's WebRTC stack. That is now a *consequence* of the
choice, not the reason for it.

### 3.3 The mobile driver is ~50 lines

Audited both `openAIRealtimeClient.ts` and `openAILiveClient.ts` (815 lines). Their browser
coupling is identical and tiny:

- `createPeerConnection()` — already a `protected` factory (*"Production returns a real
  `RTCPeerConnection`"*), built for substitution.
- `attachRemoteAudio()` — one `document.createElement('audio')`. On RN this is a **no-op**:
  `react-native-webrtc` routes remote audio to the output device automatically.

→ An RN subclass overriding those two methods reuses **all 815 lines** of wire protocol, tool loop,
transcript handling, playback-drain finalization and dedupe. The same shape works for GPT Live,
GPT Realtime, and Grok Voice (xAI reuses the OpenAI protocol profile).

### 3.4 Honest constraints

- **No realtime provider API key in this environment** — `.env` has Gemini and Cerebras LLM keys
  only. I will build and unit-test against the drivers' injectable connection seams (every shipped
  driver does this), and flag clearly when a live call needs a key.
- **Simulator microphone input is host-provided** and unsuitable for proving barge-in quality.
  Model-owned turn-taking means there is less client behaviour to prove, but I will state what is
  device-only rather than claiming it.
- **Server-bridged topology still has no client media plane** upstream. Client-direct is the audio
  path on mobile as on web — not a mobile limitation.

---

## 4. 🚩 PROPOSED CORE REFACTOR — Realtime Runtime Extraction

**Proposal only. Not started. Needs approval.**

### The finding

`@memberjunction/ng-conversations` holds ~16,600 lines of realtime code. Measuring Angular and DOM
coupling per file:

| File | Lines | Angular refs | DOM refs |
|---|---|---|---|
| `services/realtime-session.service.ts` | **2,768** | **2** | **1** |
| `components/realtime/realtime-session-state.ts` | 459 | 1 | 0 |
| `components/realtime/channels/base-realtime-channel-client.ts` | 422 | 1 | 1 |
| `components/realtime/realtime-ui-config.ts` | 430 | 2 | 0 |
| `components/realtime/realtime-disclosure.ts` | 261 | 0 | 0 |
| `services/realtime-pairing.ts` | 234 | 0 | 0 |
| `utils/realtime-session-timeline.ts` | 159 | 0 | 0 |

The session service — the entire client-side orchestration: mint, driver resolution, connect,
transcripts, tool relay, narration pacing, delegation cancel, channel lifecycle, teardown — is
**2,768 lines whose complete Angular surface is:**

```ts
import { Injectable } from '@angular/core';     // line 1
@Injectable({ providedIn: 'root' })             // line 312
```

…and whose complete DOM surface is one line:

```ts
this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });   // line 865
```

That call is **already defined as the host's job** — the co-agents guide states "the host acquires
the mic (it owns the permission UX)". It is a seam that was never cut.

### Why this is the right call

There is direct precedent: [`plans/conversations-runtime-extraction.md`](../conversations-runtime-extraction.md)
made exactly this argument for chat orchestration and produced `@memberjunction/conversations-runtime`
— pure TS, zero UX deps, consumable from browser, React Native, or server. That plan explicitly
noted realtime was landing *in parallel* (PR #2787) and would need to be Sessions/Channels-aware.
Realtime landed — and stayed in Angular. Mobile is the forcing function that finishes the job.

Without extraction, "thinnest possible UX layer" is impossible: the mobile app would reimplement
2,768 lines of orchestration that already exist, and the two would drift on the next protocol
change. With GPT Live having just proven that protocol changes are real and frequent, that drift
is not hypothetical.

### Shape of the proposal

1. **New package `@memberjunction/realtime-runtime`** (or a `realtime/` module inside
   `conversations-runtime` — naming is the maintainers' call). Pure TS, no Angular, no DOM.
2. **Move, largely mechanically:** the session service body, `realtime-session-state`,
   `realtime-pairing`, `realtime-disclosure`, `realtime-session-timeline`, and the portable half of
   `realtime-ui-config`.
3. **Cut two host seams** the code already implies:
   - `IRealtimeMediaHost` — `acquireMicrophone()` / `createPeerConnection()`. Browser returns
     `getUserMedia` + `RTCPeerConnection`; RN returns the `react-native-webrtc` equivalents.
   - `IRealtimeChannelHost` — channel-plugin resolution, so `BaseRealtimeChannelClient` stops
     living in an Angular package. **This is why mobile cannot have channels today**, and it also
     blocks any non-Angular host (React, Vue, a CLI harness, a test rig).
4. **`RealtimeSessionService` becomes a thin Angular adapter** — the `@Injectable` shell, RxJS
   surface, and browser media host. Target: a few hundred lines. **No behaviour change, no
   regression risk to Explorer** — it is the same code behind a decorator.
5. Mobile consumes the extracted runtime and implements only the RN media host + RN UX.

### Scope, risk, and honesty about it

This is the largest single item in the phase and it touches shipping Explorer voice. I would do it
**behind the existing test suites** (the realtime layer has extensive vitest coverage including
DOM tests) and verify Explorer voice still works before mobile consumes it. If you would rather I
not touch Explorer's critical path, the fallback is a mobile-side adapter that duplicates the
orchestration — I would build it, but I want it on record as the worse outcome.

### Further coupling to watch for (propose, don't do)

As I proceed I will log any other primitive that is portable-in-principle but Angular-bound, and
propose rather than unilaterally refactor. Early candidates already visible: `realtime-pcm-wav.ts`
(222 lines, 2 DOM refs — WAV encoding is pure), and the session **review/replay** service
(780 lines) whose timeline logic is framework-free.

---

## 5. Mobile code we delete

Consuming core primitives means **removing** mobile-specific duplicates, not layering on them.

| File | Lines | Fate |
|---|---|---|
| `src/voice/realtime-voice-service.ts` | 490 | **Delete** → extracted realtime runtime |
| `src/voice/rn-audio-adapter.ts` | 273 | **Mostly delete** → WebRTC needs no PCM plane. Keep only mic permission + iOS audio-session configuration |
| `src/data/services/agents.ts` | 253 | **Delete** → `ConversationAgentRunner` / `DefaultAgentResolver` |
| chat polling loop in `app/chat/[id].tsx` | ~60 of 504 | **Delete** → `ConversationStreaming` (kills G5) |
| `app/voice-mode.tsx` | 331 | **Rewrite** as a thin native call surface over the runtime |

≈ **1,300 of 13,156 lines deleted** and replaced by shared primitives, before new features are
added. Net mobile-specific code should *fall*.

---

## 6. Workstreams

| # | Workstream | Contents |
|---|---|---|
| **W0** | Foundation | pnpm ✅, build 305/305 ✅, clean DB `MJ_6_1_0_mobile_v6complete` ✅ (84 migrations, 390 tables, 388 entities, sync 0 errors, **no schema drift**), MJAPI, native rebuild, JDK 21 + Maestro ✅, Android SDK ✅ + AVD |
| **W1** | Core extraction (§4) | **Approval-gated.** Extract realtime runtime; prove Explorer voice unaffected |
| **W2** | Conversations Runtime adoption | Replace hand-rolled dispatch. Kills G5, G8 |
| **W3** | Realtime mobile | RN media host, ~50-line driver, native call UX, mobile lifecycle, direct-action + delegation UI. Kills G1 |
| **W4** | Carry-forward gaps | G2 attachments, G3 push, G4 Android, G7 dashboards |
| **W5** | v6 capability surface | Skills, Plan Mode approvals, User Routines → push, search, artifacts |
| **W6** | World-class bar | Dark mode + tokens, motion, haptics, full a11y pass, `FlashList`, 60 fps, cold-start + bundle budget, empty/error/offline states |
| **W7** | Verification | Maestro on iOS **and** Android for every feature, screenshot regression, unit + live-API integration, deterministic integration tier, docs rewritten to verified reality |

**Sequencing:** W0 → W1 (unblocks the rest) → W2 → W3 → W4 in parallel → W5 → W6 → W7 continuous.

---

## 7. Definition of done

- Every §1 gap closed or explicitly renegotiated — none quietly dropped.
- Net mobile-specific LOC **down**, with every deletion traceable to a core primitive.
- `pnpm test` green in every touched package; deterministic integration tier green, real counts reported.
- Explorer voice verified unregressed after §4.
- Maestro green on iOS **and** Android for every feature.
- `PLAN_CHECKLIST.md` / `WORKING_MEMORY.md` rewritten to verified reality — no aspirational checkmarks.

---

## 8. Follow-on deliverable — the Mobile App as an APP HOST (requested 2026-09-13)

**First commit of PR #2 (after the extraction PR lands) must be a new plan document** covering:

1. **Executive summary** of the mobile app's goals — what it is for, who it serves, what it
   deliberately is not.
2. **The hosting paradigm.** MJ Explorer is not a monolithic product — it is a *host* that runs
   many applications (Applications + nav items + `@RegisterClass(BaseResourceComponent, …)` driver
   classes + dashboards, all metadata-driven). The mobile app must express **the same paradigm with
   a different deployment**: one native shell that hosts many MJ-built apps, so an app already
   running in MJE has a short, well-lit path to putting its mobile-appropriate surfaces on a phone.
   This is explicitly *not* "customization" — it is hosting.
3. **The porting path** — what an MJ/MJE app author has to do to appear on mobile, what carries
   over untouched (entities, agents, actions, queries, permissions, metadata), what needs a native
   surface, and what should deliberately stay desktop-only.
4. **Worked examples**, including **Sidecar's LXP** (`learn.sidecar.ai`, an AI-native LMS built on
   MJ/MJE, launching now) — showing which LXP surfaces port to mobile and how they would register
   into the native host.

The architecture chosen in this phase must not foreclose this. Concretely: the registry-driven,
metadata-resolved patterns (ClassFactory driver classes, Application nav metadata, channel plugins)
are the mechanism — mobile should consume the same metadata rather than hardcoding its screens.

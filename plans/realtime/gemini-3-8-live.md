# Gemini 3.8 Live + Extended Thinking, on a real media-track architecture

**Status:** building
**Branch:** `claude/focused-franklin-d1cy6w` · **PR:** #4512 · base `next`
**Owner:** `@memberjunction/ai` (Core contract), `@memberjunction/ai-realtime-client`,
`@memberjunction/ai-gemini`, `@memberjunction/ai-agents` (channels)
**Architecture rationale:** [`media-tracks-and-modalities.md`](media-tracks-and-modalities.md)

> **Sourcing rule.** Protocol facts come from Google's published model pages and the Live API
> capabilities guide (2026-09-15), never from the launch blog and never from an adjacent protocol.
> Anything unverified is marked **VERIFY** and may not survive to merge. The GPT-Live PR lost a
> cycle to a wire-format claim reasoned from a neighbouring API instead of read from the source.

---

## 1. What ships

Two new stable models on the **existing** Gemini Live API, plus the media-track architecture that
makes them worth more than a model swap.

**The proof point:** when a model supports inbound video, any channel that can produce frames
streams them to the model — so the agent **watches the whiteboard it is drawing on and corrects
itself as it goes**, and **watches the remote browser it is driving** instead of polling
screenshots through a tool. Where the model has no video track, everything falls back to today's
behaviour unchanged.

## 2. Decisions taken (closed — do not re-litigate)

1. **One driver, capability-branched.** Not a second driver: 3.8 Live is the same Live API as
   `gemini-3.1-flash-live-preview` — same connect call, same `serverContent`/`toolCall`/
   `usageMetadata` frames, same 16 kHz-in / 24 kHz-out PCM. The models differ in which features
   are *legal*, which is a capability matrix.
2. **No DDL, no migration.** Channel track capability is declared in **code** on the plugin
   (direct precedent: `GetServerToolDefinitions()` — channel tools are code, not metadata). Model
   capability goes in `RealtimeSessionCapabilities` (code); model policy in the existing typed
   `ModelConfiguration.Realtime` JSON; per-channel transport in the existing
   `MJ: AI Agent Channels.TransportType`, which already carries `'WebRTC'` documented as
   *"binary media"*. A DB-backed modality registry is **deferred** until a customer needs a
   modality without a release (§9.1).
3. **Generalize then map.** Every provider knob is a normalized provider-neutral setting plus a
   per-profile mapping with graceful degradation — the `RealtimeTurnDetectionMode` /
   `buildTurnDetection` pattern. Gemini is simply the first profile that maps `TurnCoverage`. A
   passthrough bag is an allow-listed escape hatch for provider-private knobs only, never for
   anything MJ reasons about (cost, consent, behaviour).
4. **Audio is retrofitted as two declared tracks**, changing no behaviour — the honesty test for
   the abstraction.
5. **`TurnCoverage` stays separate from track establishment.** A track is session transport;
   coverage is per-turn context. Conflating them would mean tearing down a negotiated track just
   to stop including frames.
6. **Video is OFF unless requested.** Structural, not a default value: an unrequested track is not
   established. Gemini's own default is video ON and billed, so omission must not mean "inherit".

## 3. The two models (verified)

| | `gemini-3.8-live` | `gemini-3.8-live-extended-thinking` |
|---|---|---|
| Inputs / Output | text, image, audio, video / text + audio | same |
| Tokens | 131,072 in / 65,536 out | same |
| Thinking | interleaved; `thinkingLevel` **not supported — omit** | `thinkingConfig.thinkingLevel` ∈ low/medium/high (**no `minimal`**) |
| Thought summaries | n/a | `thinkingConfig.includeThoughts` |
| Function calling | `NON_BLOCKING` default; `BLOCKING` allowed | **async only** — `BLOCKING` = hard error |
| Function scheduling | `SILENT`/`WHEN_IDLE`/`INTERRUPTED` | **not supported** |
| Idle signal | `turnComplete` | **`interaction_status`** ∈ `IN_PROGRESS`/`IDLE`; `turnComplete` ≠ idle |
| Proactive audio | permanently on; `false` errors | same |
| Affective dialogue | **removed** — never send `enable_affective_dialog` | same |
| Turn coverage | defaults `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO` | **VERIFY** (stated on 3.8-live only) |
| Session cap | audio-only 15 min | same |

Price (both, paid tier): audio in **$0.005/min** ($3.00/1M) · audio out incl. thinking tokens
**$0.018/min** ($12.00/1M) · image/video in $0.002/min ($1.00/1M) · text $0.75 / $4.50 per 1M ·
Search grounding 5,000/month free **shared across all Gemini 3.x**, then $14/1,000. GPT-Live for
comparison is $0.05/min wall-clock **plus** separately-billed delegated reasoning, plus a 15-second
WebRTC pre-bill — so Gemini is 2.2×–5.6× cheaper on the voice plane depending on talk split, and
more once reasoning is counted.

## 4. Three hazards

**4.1 — `turn_complete=true` unconditionally interrupts generation.** Our driver uses an empty
`turnComplete: true` turn as a *release* for committed context notes (`openClientTurn`,
`sendToolResponseTurn`); the docs call it an *interrupt*. Both cannot be right. The comparison table
states this **identically for all three models including the 3.1 preview we run today**, so it is
not a 3.8 change — it is either a pre-existing bug or an imprecise sentence. **Verified live before
any code depends on it (task 7).** It looks like a one-line change and is not.

**Escalated 2026-09-15.** The Extended Thinking page now states it in *prose*, not only in the
comparison table: *"Setting turn_complete=true immediately interrupts active generation."* That
removes the "imprecise table cell" reading for the new model. V1's remaining unknown is narrower and
sharper: whether the same is already true on the 3.1 preview we ship today — i.e. whether this is a
3.8 constraint to design around or a live bug we have been carrying.

**4.2 — turn serialization.** `responseActive` gates sends into `queuedSends`, drained on
`turnComplete`. Under Extended Thinking, `turnComplete` arrives while the server is still reasoning
and still issuing tool calls. `IsBusy` must become outstanding-work-based.

**4.3 — video collapses the vendor session cap from 15 minutes to 2.** Live API capabilities guide,
*Limitations → Session duration*: *"Audio-only sessions are limited to 15 minutes, and audio plus
video sessions are limited to 2 minutes."* The escape hatch it names is session management for
"unlimited extensions", i.e. session resumption.

This lands directly on the F-phase proof point. An agent watching a whiteboard it is drawing on, or a
page it is driving, is a *long* interaction; 2 minutes makes the headline feature a demo that dies
mid-sentence. And the failure shape is the bad one — nothing is wrong at build time, nothing is wrong
for the first two minutes.

What we have today: the **mint** side forwards `sessionResumption` opaquely
(`geminiRealtime.ts:353`), and the **client** side consumes none of it — `grep` for
`goAway|sessionResumption|generationComplete` in `geminiRealtimeClient.ts` returns nothing, and
`baseRealtime.ts` has no reconnect contract (its two `reconnect` hits are prose about
`Reconfigure`). So continuity is half-plumbed: configurable, never consumed. Audio-only sessions
already die silently at 15 minutes; video makes that 7.5x more likely to be hit, which converts a
rare edge case into a guaranteed one. Tracked as **F7**.

## 5. Reuse (why one PR is realistic)

| Need | Exists | Use |
|---|---|---|
| Parallel async tool calls, one continuation on drain, timeout, duplicate-proof | `RealtimeToolBatchBarrier` (`AI/Core`, provider-agnostic) | as-is |
| "Model is done" with no terminal event | GPT-Live infers from playback drain + silence | **don't port** — Gemini states `IDLE` |
| Narration as a transcript kind | `Kind: 'narration'`, `RequestSpokenUpdate?()` (`baseRealtime.ts:560`), delegation cards | promote |
| Reasoning plane | `RealtimeReasoningPlane` / `SupportedReasoningPlanes` — shipped, unconsumed | first consumer |
| Per-channel binary media transport | `TransportType: 'WebRTC'` — already documented as binary media | first consumer |
| Usage split across bases | `UsageBases?: readonly ('tokens'\|'seconds')[]` — already a list, not an enum | extend with `frames`/`bytes` |

---

## 6. BUILD LIST — numbered, each independently verifiable

### Phase A — contracts (no behaviour change)

- [x] **A1.** `ModelConfiguration.Realtime` gains `Tooling` (`SupportsBlockingExecution`,
  `SupportsScheduling`), `IdleSignal`, `TurnDetection.Coverage` (+ `RealtimeTurnCoverage`),
  `Reasoning.IncludeThoughtSummaries`. *(commit `35ba627ee7`)*
- [x] **A2.** `RealtimeSessionCapabilities` gains `ProvidesThoughtSummaries`,
  `SupportsAsynchronousReasoning`. *(commit `35ba627ee7`)*
- [x] **A3.** Track contract in `AI/Core`: `RealtimeTrackDirection`,
  `RealtimeTrackDescriptor` (`Modality`, `Direction`, `Encoding`, `Rate`, `UsageBasis`,
  `RequiresConsent`), `RealtimeTrackState`, `RealtimeTrack`. *(commit pending)*
- [x] **A4.** Modality registry as a **code** registry (`BaseSingleton`) seeded with well-known
  keys `audio`/`video`/`image`/`text`; unknown keys transportable but not reasoned about.
- [x] **A5.** `RealtimeSessionCapabilities` gains `SupportedInboundTracks` /
  `SupportedOutboundTracks`.
- [x] **A6.** `ModelConfiguration.Realtime.RequestedTracks?: RealtimeTrackDescriptor[]` — the
  request side of negotiation (absent ⇒ audio only).
- [x] **A7.** Channel contract gains optional `SourcesTracks` / `SinksTracks` on
  `BaseRealtimeChannelServer` (+ client mirror).
- [x] **A8.** `UsageBases` / `UsageBasis` extended with `'frames' | 'bytes'`.

### Phase B — SDK and audio retrofit

- [x] **B1.** `@google/genai` converged on `^2.8.0` across all four dependents; one version on
  disk. *(commit `f613a6c3a1`)*
- [ ] **B2.** Audio expressed as two declared tracks in the Gemini and OpenAI drivers, asserted
  byte-identical in behaviour. **Honesty test — if this is awkward, A3 is wrong.**
- [ ] **B3.** Track negotiation in `BaseRealtimeClient`: request → intersect with model capability
  → establish → report. Unrequested ⇒ not established.

### Phase C — Gemini config correctness

- [x] **C1.** Never send `enable_affective_dialog` (removed from the API).
- [x] **C2.** Never send `proactive_audio: false` (errors).
- [x] **C3.** Omit `thinkingLevel`/`thinkingConfig` for `gemini-3.8-live`; send low/medium/high for
  Extended Thinking; reject `minimal` locally with a clear message.
- [x] **C4.** Set turn coverage explicitly from `TurnCoverage`; **audio-only when absent.**
- [x] **C5.** Refuse `BLOCKING` locally for Extended Thinking rather than emitting a frame the
  server hard-errors.

### Phase D — idle and async tools

- [ ] **D1.** Honour `IdleSignal`: `generationComplete` (typed) for `gemini-3.8-live`, `interaction_status` (untyped, narrow it) for Extended Thinking. See V3.
- [ ] **D2.** `IsBusy` = reasoning in progress **or** tool batch non-empty **or** audio playing.
- [ ] **D3.** `queuedSends` drains on **idle**, not `turnComplete`.
- [ ] **D4.** Backstop timer for a lost `IDLE` frame (guard only, not the primary signal).
- [ ] **D5.** `behavior: NON_BLOCKING` + `RealtimeToolBatchBarrier` wired for Gemini.
- [ ] **D6.** Function scheduling gated by `Tooling.SupportsScheduling`.

### Phase E — thinking and narration

- [ ] **E1.** `thinkingConfig` from `ModelConfiguration.Realtime.Reasoning` — the plane's first
  consumer.
- [ ] **E2.** `includeThoughts` behind `IncludeThoughtSummaries`.
- [ ] **E3.** Thought parts → narration transcript, **not** assistant speech. **VERIFY** the wire
  marking first (task 7).
- [ ] **E4.** Narration promoted to the shared transcript contract.
- [ ] **E5.** Third delegation-card `Kind` for model-authored narration; design tokens only.

### Phase F — video tracks, the proof point

- [ ] **F1.** Frame capture beside `micCapture.ts`: `getUserMedia` (camera), `getDisplayMedia`
  (screen), consent-gated via `RequiresConsent`.
- [ ] **F2.** Gemini driver sends frames as inbound video when the track is established.
- [ ] **F3.** **Whiteboard channel sources inbound video** when the model supports it — the agent
  sees what it draws. Falls back to today's tool-only behaviour otherwise.
- [ ] **F4.** **Remote browser channel sources inbound video** when supported — the model watches
  the page continuously while the agent still acts through tools. Falls back to
  screenshot-as-tool-result.
- [ ] **F5.** One shared "channel → inbound video" path; F3/F4 must not be two implementations.
- [ ] **F6.** Per-track cost accounting so video's $0.002/min is attributable.
- [ ] **F7.** **Session continuity, or video is a 2-minute demo** (§4.3). Handle `goAway` and
  `sessionResumptionUpdate` on the client and resume across the cap. Gates whether F3/F4 are
  shippable features or just demos. Not optional the moment a video track is established.

### Phase G — metadata and close-out

- [ ] **G1.** `AIModel` + `AIModelVendor` rows for both models (`APIName` = `gemini-3.8-live`,
  `gemini-3.8-live-extended-thinking`), modality rows, `AIModelCost` rows from §3's price sheet.
  Declarative JSON, `uuidgen` primary keys, **no `sync` block, no `*__Metadata_Sync.sql`** — that
  is release work.
- [ ] **G2.** Changeset `minor` (ships metadata).
- [ ] **G3.** Full repo unit tier + deterministic integration tier.
- [ ] **G4.** Every **VERIFY** resolved or the PR does not merge.

## 7. Verification tasks (must precede the code that depends on them)

- [ ] **V1.** §4.1 — is our empty `turnComplete: true` commit interrupting generation on 3.1 today?
  Gates D1–D3. Highest risk in the PR. **Narrowed 2026-09-15:** the vendor now states the interrupt
  behaviour in prose for Extended Thinking, so the only open question is 3.1's *current* behaviour —
  design-around vs. live bug. Still needs a live session; nothing in the SDK types answers it.
- [x] **V2.** RESOLVED from `@google/genai@2.8.0` types (`dist/genai.d.ts:9214-9218`): a thought part
  is a normal `Part` carrying `thought?: boolean` — *"Indicates whether the `part` represents the
  model's thought process or reasoning"* — plus an opaque `thoughtSignature?: string` for reuse in
  later requests. Request side is `thinkingConfig.includeThoughts`. **E3 is no longer gated** and
  needs no live session: the marker is typed, so summaries can be split from spoken response and
  unit-tested now.
- [x] **V3.** ANSWERED, and it does **not** collapse — keep the per-model `IdleSignal`.
  `interaction_status` is documented *only* on the Extended Thinking page (under "Upgrading to
  Gemini 3.8 Live Extended Thinking"); neither the plain 3.8 Live page nor the Live API capabilities
  guide mentions it. **But it carries a typing trap that would otherwise cost an `any`:**
  `@google/genai@2.8.0` does not model `interactionStatus` on `LiveServerMessage` or
  `LiveServerContent` at all. The only `InteractionStatusUpdate` in the SDK belongs to the unrelated
  **Interactions API** (an SSE surface, `InteractionSSEEvent`) — so grepping the SDK for it finds a
  type from a different API and wires the wrong thing. Read it as a **narrowed `unknown`**, reusing
  the `readObject`/`readString` narrowers already in `geminiRealtime.ts`; never `as any`, and never
  silently fall through to `turnComplete`, which would report idle mid-reasoning and look like it
  works. The SDK *does* type three adjacent signals the driver currently ignores —
  `generationComplete`, `turnCompleteReason` (incl. `NEED_MORE_INPUT`) and `waitingForInput` — and
  `generationComplete` ("model is done generating", fires before playback drain) is the better
  **typed** basis for plain `gemini-3.8-live` than `turnComplete`. D1 should prefer it.
- [x] **V4.** RESOLVED from `@google/genai@2.8.0` types: `RealtimeInputConfig.turnCoverage` is
  settable per session; the enum is `TURN_COVERAGE_UNSPECIFIED` / `TURN_INCLUDES_ONLY_ACTIVITY` /
  `TURN_INCLUDES_ALL_INPUT` / `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO`, so `audioActivityOnly`
  maps to `TURN_INCLUDES_ONLY_ACTIVITY`. **Conflict found and made irrelevant:** the SDK's enum doc
  says coverage defaults to `TURN_INCLUDES_ONLY_ACTIVITY` while the 3.8 model page says the default
  includes all video. Stating coverage on every session means we never depend on which is right.
- [x] **V5.** RESOLVED; doc and SDK agree, and the path is first-class rather than an escape hatch.
  Live API capabilities guide, *Sending video*: *"Video frames are sent as individual images (e.g.,
  JPEG or PNG) at a specific frame rate (max 1 frame per second)."* Wire shape is
  `sendRealtimeInput({ video: { data: <base64>, mimeType: 'image/jpeg' } })`, typed as
  `LiveSendRealtimeInputParameters.video?: BlobImageUnion`. **F1/F2 are unblocked.** Two
  consequences: 1 fps is a *ceiling*, so frame capture needs a throttle rather than a rAF loop and
  `RealtimeTrackDescriptor.Rate` carries it; and "individual images" means the `image` modality and
  the `video` modality differ by cadence, not by encoding — which is why `UsageBasis` needed
  `'frames'`.

## 8. Tests

1. Table-driven per model over §3: `thinkingLevel` omitted for 3.8-live, present and
   `minimal`-rejecting for Extended Thinking, `enable_affective_dialog` and
   `proactive_audio: false` never sent, `BLOCKING` refused for Extended Thinking.
2. **Idle regression:** `turnComplete` while `IN_PROGRESS` must neither drain `queuedSends` nor
   clear busy; a later `IDLE` must do both.
3. Async tools: parallel calls, out-of-order results, a duplicate, a never-returned call hitting
   the barrier timeout.
4. Thought summaries land as narration, never as assistant speech.
5. Lost `IDLE` still unwedges the session.
6. **Track negotiation:** absent config ⇒ audio-only established, video **not** established.
7. Video-capable channel + non-video model ⇒ falls back with no error and no frames sent.
8. Existing Gemini tests stay green or change with a stated reason.

> **Known local-environment failure, not ours:** 3 Gemini socket-close tests fail with
> `ReferenceError: CloseEvent is not defined` on Node v22 (`CloseEvent` is a Node 23 global).
> Proven by reproducing them with the pre-bump pin. CI runs a newer Node.

## 9. Deferred, with reasons

1. **DB-backed modality registry.** The code registry (A4) covers every modality we can name.
   A table earns itself when a customer must add one without a release — then it is
   `MJ: AI Realtime Modalities` plus a `MediaTracks` column on `MJ: AI Agent Channels`, and it is
   additive.
2. **Outbound non-audio tracks** (avatar video, haptics). The contract admits them (direction is a
   property); no provider in play emits them yet.
3. Live carrier/telephony media for these models — needs real credentials.
4. The release `Metadata_Sync` migration — build engineer.
5. PostgreSQL counterparts — toolchain, at release.
6. Retiring `gemini-3.1-flash-live-preview` — the capability matrix makes keeping it cheap.

---

## Appendix — implementation notes for phases C5, D, E, F

Per-task file paths, the existing symbols to change, and the traps. §6 says *what*; this says
*where*. Line numbers are as of commit `455d0606f1` and will drift — find the symbol, not the line.

**The one file you will spend most of your time in:**
`packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts` (the browser-side driver). Note
that the *session config* is minted SERVER-side in
`packages/AI/Providers/Gemini/src/geminiRealtime.ts` — config changes go there, message handling
goes in the client. Getting this backwards costs an hour.

### C5 — refuse `BLOCKING` locally for Extended Thinking
Server side, `geminiRealtime.ts`. `MapToolsToFunctionDeclarations` is where tools become
`FunctionDeclaration`s. `ResolveGeminiLiveProfile(model).Tooling.SupportsBlockingExecution` is
already available and already `false` for Extended Thinking. Emit `behavior: NON_BLOCKING` and, if
anything requests blocking on a model that forbids it, log and force non-blocking rather than
sending a frame the server hard-errors. **Start here** — it needs no live session and validates your
whole loop (build → test → commit → push) before you hit the parts that need a real model.

### D1 — honour `IdleSignal`
Client, `handleServerMessage` (~:482). Today it fans out on `serverContent` / `toolCall` /
`usageMetadata`. Read the model's idle signal from the config bag key `idleSignal`, defaulting to
`'turnComplete'`.

**This note used to say "read the wire field name off the SDK types before writing the parse". That
check has now been done, and the answer is the trap** (V3): `@google/genai@2.8.0` does **not** type
`interactionStatus` on `LiveServerMessage` or `LiveServerContent`. Grepping the SDK for it *does*
return a hit — `InteractionStatusUpdate` — which belongs to the unrelated **Interactions API** (SSE,
`InteractionSSEEvent`). Importing that type would compile, look right in review, and never match a
Live frame. So:

- **Extended Thinking** — `interaction_status` is real on the wire but absent from the typed surface.
  Reach it by narrowing `unknown` (the `readObject`/`readString` helpers in `geminiRealtime.ts` are
  the in-repo pattern), never `as any`. Accept both `interaction_status` and `interactionStatus`, since
  the docs are snake_case and the SDK's convention is camel — a one-line tolerance that costs nothing
  and survives the SDK adding the field later.
- **Plain `gemini-3.8-live`** — prefer `serverContent.generationComplete`, which **is** typed and means
  "model is done generating" (it fires before playback drain; `turnComplete` waits for playback). Two
  further typed signals arrived in 2.8.0 and are worth knowing about even if D1 does not use them:
  `turnCompleteReason` (notably `NEED_MORE_INPUT`) and `waitingForInput`.
- **Never** fall through to `turnComplete` when the expected signal is missing. That is the one failure
  mode that looks like success: the session reports idle mid-reasoning, drains its queue early, and
  only misbehaves under load.

### D2 — `IsBusy` from outstanding work
Client, `IsBusy` (~:384), currently `return this.responseActive`. Make it the OR of: reasoning in
progress (from `interaction_status`), tool batch non-empty (`RealtimeToolBatchBarrier.IsEmpty` is
false), audio still playing. `openAILiveClient.ts` `IsBusy` (~:80) is the shape to copy.

### D3 — drain on idle, not `turnComplete`
Client, `flushQueuedSends` (~:687) and its call site inside the `turnComplete` path. Move the
trigger behind the resolved idle signal. **Trap:** on `gemini-3.8-live` the signal still IS
`turnComplete`, so this must not change that model's behaviour at all — the existing tests are your
guard.

### D4 — backstop timer
Client. Copy `assistantSafetyBackstopTimer` (~:72 in `openAILiveClient.ts`). It is a GUARD for a
lost `IDLE` frame, never the primary signal — if you find yourself relying on it, D1 is wrong.

### D5 — async tools via the barrier
Client, `handleToolCallFrame` (~:604) and `sendToolResponseTurn` (~:729). `RealtimeToolBatchBarrier`
is in `AI/Core`, already provider-agnostic, already used by `openAILiveClient.ts` — see
`toolBatchBarrier.TrackPendingCall` / `.RecordResult` / `.Clear` there. Do not write a second
barrier. `pendingToolCallNames` (~:184) already exists because Gemini's `sendToolResponse` needs the
function name; keep it.

### D6 — scheduling gated by capability
Server, `geminiRealtime.ts`. Gate on `profile.Tooling.SupportsScheduling` — `true` only for plain
`gemini-3.8-live`.

### E1/E2 — thinking config
Already wired in `applyModelLegality`. E1/E2 are only about confirming the values reach the wire on
a live session; no new code expected.

### E3 — thought parts to narration
Client, `handleServerContent` (~:513). **Gated on V2** — how a thought part is MARKED on the wire is
unverified. Do not guess: read it from a live session or the SDK's `Part` type. A thought rendered as
assistant speech attributes the model's scratch reasoning to it as an answer, which is worse than
not shipping the feature.

### E4/E5 — narration promotion and the card
`Kind: 'narration'` exists in `openAILiveClient.ts`; promote it to the shared transcript type. The
delegation card is `packages/Angular/Generic/conversations/src/lib/components/realtime/` —
`realtime-delegation-card.component.ts/.html` already branches on `Kind: 'agent' | 'action'`; add a
third. Cards are IMMUTABLE — every event REPLACES the object, never mutates it. Design tokens only,
no hardcoded colours.

### F1 — frame capture
New file beside `packages/AI/RealtimeClient/src/audio/micCapture.ts` — that file is the pattern for
browser capture in this package. `getUserMedia` for camera, `getDisplayMedia` for screen. Gate on
`RealtimeTrackDescriptor.RequiresConsent`.

### F2 — send frames
Client. The existing `sendMicChunk` sends `{ audio: { data, mimeType } }` via
`session.sendRealtimeInput`. Video rides the same call's `media` slot — the `FakeLiveSession` in the
Gemini tests already captures `media`, so it is testable with no network. **Gated on V5** (encoding
and cadence).

### F3/F4/F5 — channels sourcing video
`packages/AI/Agents/src/realtime/whiteboard-channel-server.ts` and
`packages/AI/RemoteBrowser/Server/src/remote-browser-channel.ts`, plus their client halves. Override
`GetSourcedTracks()` (already on the base, defaults to `[]`). **F5 is the important one:** write the
"channel → inbound video" path ONCE and have both channels use it. Two implementations of this is
the failure mode to avoid, and reviewers will look for it specifically.

### F6 — per-track cost
Attribute video's $0.002/min separately. `RealtimeUsageModalityDetail` already has an `Image` field;
`UsageBases` now includes `'frames'`.

### F7 — session continuity (§4.3)
The 2-minute audio+video cap is the constraint that decides whether F3/F4 ship. Client,
`handleServerMessage` (~:482): neither `goAway` nor `sessionResumptionUpdate` is handled today, and
`grep` confirms neither string appears in the driver. The mint side already forwards
`sessionResumption` (`geminiRealtime.ts:353`), so the config half exists and nothing consumes the
handle — store the resumption handle off `sessionResumptionUpdate`, and on `goAway` reconnect with it
rather than tearing the conversation down. There is no reconnect contract in `baseRealtime.ts` to
inherit, so decide deliberately whether this belongs in the Gemini driver or in the base — it is the
kind of thing every long-session provider will want, and `openAIProtocolClient.ts` already has
reconnect machinery worth reading first.

Test it by asserting the handle is captured and reused, not by waiting two minutes.

### Non-negotiables for every task above
1. No `any`, no `as any`, no `.Get()`/`.Set()` for typed fields.
2. Build the package you changed (`cd packages/... && pnpm run build`) and run its tests before
   committing. A pre-existing local failure: 3 Gemini socket-close tests fail on Node 22 with
   `ReferenceError: CloseEvent is not defined` (a Node 23 global) — not yours, do not "fix" it.
3. An unbuilt workspace dep looks exactly like a broken change. If you see
   `Cannot find module '@memberjunction/...'` or `Failed to resolve entry for package`, build that
   dep first (`npx turbo build --filter=<pkg>`) before believing the error.
4. Never send a frame a model rejects when a local check could have caught it. Session-mint failures
   are upstream of all UI and cost the whole session.
5. Every `catch` logs with context, throws, or returns a failure result. No silent fallback.

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

## 4. Two hazards

**4.1 — `turn_complete=true` unconditionally interrupts generation.** Our driver uses an empty
`turnComplete: true` turn as a *release* for committed context notes (`openClientTurn`,
`sendToolResponseTurn`); the docs call it an *interrupt*. Both cannot be right. The comparison table
states this **identically for all three models including the 3.1 preview we run today**, so it is
not a 3.8 change — it is either a pre-existing bug or an imprecise sentence. **Verified live before
any code depends on it (task 7).** It looks like a one-line change and is not.

**4.2 — turn serialization.** `responseActive` gates sends into `queuedSends`, drained on
`turnComplete`. Under Extended Thinking, `turnComplete` arrives while the server is still reasoning
and still issuing tool calls. `IsBusy` must become outstanding-work-based.

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
- [ ] **C5.** Refuse `BLOCKING` locally for Extended Thinking rather than emitting a frame the
  server hard-errors.

### Phase D — idle and async tools

- [ ] **D1.** Honour `IdleSignal`; parse `interaction_status`.
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
  Gates D1–D3. Highest risk in the PR.
- [ ] **V2.** How is a thought part marked on the wire? Gates E3.
- [ ] **V3.** Does `interaction_status` appear on `gemini-3.8-live` too, or only Extended Thinking?
  If universal, `IdleSignal` collapses to one value and D1 simplifies.
- [x] **V4.** RESOLVED from `@google/genai@2.8.0` types: `RealtimeInputConfig.turnCoverage` is
  settable per session; the enum is `TURN_COVERAGE_UNSPECIFIED` / `TURN_INCLUDES_ONLY_ACTIVITY` /
  `TURN_INCLUDES_ALL_INPUT` / `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO`, so `audioActivityOnly`
  maps to `TURN_INCLUDES_ONLY_ACTIVITY`. **Conflict found and made irrelevant:** the SDK's enum doc
  says coverage defaults to `TURN_INCLUDES_ONLY_ACTIVITY` while the 3.8 model page says the default
  includes all video. Stating coverage on every session means we never depend on which is right.
- [ ] **V5.** Frame encoding and cadence Gemini accepts for inbound video. Gates F1/F2.

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

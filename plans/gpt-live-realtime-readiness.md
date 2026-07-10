# GPT-Live Readiness Plan — MJ Realtime Agent Architecture

**Status**: Analysis complete — awaiting OpenAI API availability
**Date**: 2026-07-10
**Source**: OpenAI "Introducing GPT-Live" announcement (July 8, 2026)
**Owner seams**: `packages/AI/Providers/OpenAI/`, `packages/AI/RealtimeClient/`, `packages/AI/Core/src/generic/baseRealtime.ts`, `packages/AI/Bridge*`

---

## 1. Executive Summary

OpenAI announced **GPT-Live** (`gpt-live-1` and `gpt-live-1-mini`), a new generation of **full-duplex** voice models now powering ChatGPT Voice. There is **no developer API at launch** — OpenAI states "we plan to bring them to the API soon" with a notification sign-up form. Nothing in MJ's current `OpenAIRealtime` driver breaks or needs changing today.

Strategically, GPT-Live is a **validation of MJ's realtime architecture, not a threat to it**. Its two headline architectural ideas — (a) a thin, continuous-interaction voice layer and (b) delegation of deep work to a background frontier model while the conversation keeps flowing — are exactly the **Voice Co-Agent + `invoke-target-agent`** design MJ already ships. When the API lands, GPT-Live should slot in as a **driver upgrade plus metadata rows**, not a re-architecture.

This plan captures the analysis and defines the phased work to be executed when the API becomes available.

---

## 2. What GPT-Live Is (from the announcement)

- **Full-duplex architecture**: listens and speaks simultaneously. Makes interaction decisions many times per second — whether to speak, continue listening, pause, interrupt, or invoke a tool. Supports backchanneling ("mhmm", "got it"), tolerates thinking pauses, resists background noise, and enables live translation.
- **Delegation for deeper work**: GPT-Live itself handles only the live interaction. Questions requiring web search, reasoning, or agentic work are delegated to a background frontier model (**GPT-5.5** at launch), while GPT-Live keeps talking and folds the result back in when ready. OpenAI explicitly notes this decoupling lets them continuously swap in newer frontier models behind the same interaction layer.
- **Reasoning effort tiers**: users choose Instant / Medium / High for the background model (GPT-5.5 Instant vs. GPT-5.5 Thinking at medium/high effort).
- **Two model sizes**: `gpt-live-1` (default for Go/Plus/Pro) and `gpt-live-1-mini` (default for Free).
- **Evals**: strongly preferred over Advanced Voice Mode in pairwise conversation preference (75.7% / 69.2%); large gains on GPQA, BrowseComp, and a full-duplex voice-agent telecom benchmark (τ³-Voice Telecom).
- **ChatGPT Voice extras**: rich visual cards mid-conversation (weather, stocks, sports), remastered predefined voices, continued support for search/memory/images/file uploads.
- **Realtime safety**: safeguards that act *while the model is speaking* — steering toward safer responses mid-utterance, surfacing resources, or ending the conversation; teen protections; predefined voices only (no impersonation).
- **Launch limitations**: **no video or screen sharing** ("working to introduce these capabilities soon"); **no API** — ChatGPT on iOS/Android/web only; some languages have accent/fluency gaps.

---

## 3. Architectural Mapping — GPT-Live vs. MJ Realtime Stack

### 3.1 The delegation split is MJ's Voice Co-Agent pattern, productized

MJ already separates the realtime interaction layer from deep work:

- One co-agent voices any target agent through the single stable **`invoke-target-agent`** tool (`packages/AI/Agents/src/realtime/realtime-tool-broker.ts`). The target is an *argument* of the call, never a per-target tool, so the provider-facing tool schema is identical across targets.
- Delegation runs as a full `AIAgentRun` linked via `ParentRunID` + shared `AgentSessionID` — with MJ permissions, tools, memory, MCP access (indirectly, via the target agent), and observability.

GPT-Live implements the same split, except its background worker is hardwired to OpenAI's own frontier model. **MJ's differentiation is that delegation targets are MJ agents.** Even when GPT-Live's API arrives, delegation should stay routed through MJ's broker — GPT-Live becomes the best-available *interaction layer*, not the orchestrator.

### 3.2 The biggest practical win is model behavior, not API features

Keeping the conversation alive during a 20–60s `invoke-target-agent` call is currently *engineered* in MJ — progress narration, `SendContextNote`, `RequestSpokenUpdate`. GPT-Live is *trained* to keep conversing naturally while background work runs. If the API preserves that behavior for developer-defined tools, MJ's delegation UX improves substantially with **zero framework changes** — the model natively does what we currently coax out of `gpt-realtime`.

### 3.3 Full-duplex touches the OpenAI driver — blast radius is one file per side

MJ's current OpenAI realtime surface (verified in code):

| Aspect | Current dependency |
|---|---|
| Models | `gpt-realtime` / `gpt-realtime-2` (`MJ: AI Models` type `Realtime`) |
| Server-bridged transport | `openai` SDK WebSocket (`OpenAIRealtimeWebSocket`) |
| Client-direct transport | WebRTC — SDP offer to `POST /v1/realtime/calls`, ephemeral client secret (`realtime.clientSecrets.create`), data channel `oai-events` |
| Turn-taking | `audio.input.turn_detection = { type:'server_vad', create_response, interrupt_response }`; live flip via partial `session.update` (`Reconfigure({DisableAutoResponse})` for meeting mode) |
| Barge-in | `input_audio_buffer.speech_started` gated on active response; `response.cancel`; `output_audio_buffer.clear` (WebRTC) |
| Tool surface | `session.update` tools + `response.function_call_arguments.done` + `conversation.item.create(function_call_output)` |
| Config baking | Instructions/tools/audio baked into the ephemeral secret at mint — tamper-proof even though the browser owns the socket |

Half-duplex assumptions likely to change under a full-duplex protocol:

1. **Barge-in mechanics** — a full-duplex model handles interruption itself; `speech_started`-gated cancels may soften or disappear.
2. **`server_vad` turn detection** — likely replaced/augmented by model-native turn-taking; the `Reconfigure` meeting-mode flip needs a full-duplex equivalent.
3. **Continuous simultaneous audio** — mic must stream *while* output plays. The WebRTC client-direct path already does this naturally; the raw-PCM WebSocket audio plane (`packages/AI/RealtimeClient/src/audio/`) needs review for any half-duplex sequencing.
4. **New/changed event names** — extension point is the single event dispatcher in `openAIRealtime.ts` (behind the injectable `IOpenAIRealtimeConnection` seam, so network-free vitest coverage holds) and the mirror handler in `openAIRealtimeClient.ts`.

The `IRealtimeSession` contract, tool broker, session entities (`AIAgentSession` family), channels, and bridges **do not move**.

### 3.4 Best case: protocol-compatible → metadata-only

If GPT-Live ships as new model IDs on the existing Realtime API protocol, adoption is a **metadata row** (`MJ: AI Models` + `MJ: AI Model Vendors` with `APIName`) — the same near-zero cost as the xAI/Grok driver (`packages/AI/Providers/xAI/src/models/xaiRealtime.ts`), which reuses the OpenAI SDK against a different base URL.

### 3.5 Bridges benefit disproportionately

Full-duplex matters most in **telephony and meetings** — natural barge-in and backchanneling are what make a phone agent stop feeling like an IVR. The bridge layer's platform-agnostic `TurnTakingPolicy` (passive/active/hybrid) will likely want a fourth mode: **model-native** (let the full-duplex model own the floor). τ³-Voice Telecom being one of OpenAI's three headline evals signals they are targeting exactly the voice-agent/telephony use cases MJ's bridge seam (`packages/AI/BridgeBase`, `packages/AI/Bridge`, `@memberjunction/ai-bridge-livekit`) serves.

### 3.6 Visual cards ≈ MJ interactive channels

ChatGPT's mid-conversation visual cards are the consumer version of MJ's channel plugins (Whiteboard, Media, Remote Browser via `BaseRealtimeChannelClient`/`BaseRealtimeChannelServer`). If the API exposes structured visual outputs, they map onto a channel plugin pair — an extension point that already exists.

### 3.7 Video / screen share — MJ is ahead

GPT-Live launches *without* video or screen sharing. MJ's contracts are already in place waiting for a capable model: `BaseRealtimeModel.SupportsVideo`, `IRealtimeSession.SendInput(chunk, kind: 'video')`, optional `OnVideoOutput`, bridge `video-in/out` + `screen-in/out` tracks, and Remote Browser screencast → `ScreenOut`. No pressure on this front; when OpenAI adds it, the declared-but-dormant seams absorb it.

### 3.8 Reasoning-effort tiers map to existing MJ config

Instant/Medium/High background effort corresponds to the delegation target's own model/effort configuration in MJ — no framework change needed. If the API exposes a per-session effort knob, it lands in `CreateClientSession`'s session-config request and flows through the opaque `SessionConfig` pact untouched by hosts.

---

## 4. Phased Work Plan

### Phase 0 — Now (no API): monitoring + housekeeping

- [ ] **Sign up** for OpenAI's GPT-Live API notification (human action — form linked from the announcement).
- [ ] **Doc refresh**: the co-agents guide's provider capability matrix is stale — it documents 4 realtime drivers, but the code ships **6 server drivers** (adds xAI/Grok `xaiRealtime.ts` and Inworld `inworldRealtime.ts`, server-bridged only) and **5 client drivers** (adds `xai`). Update `guides/REALTIME_CO_AGENTS_GUIDE.md`.
- [ ] **Anticipatory note** in `guides/REALTIME_CO_AGENTS_GUIDE.md` (and bridges guide §turn-taking): full-duplex models are coming; `RealtimeSessionCapabilities` is the designated growth point for `FullDuplex` / `NativeTurnTaking` / `Backchannel` flags.
- [ ] No code changes. Current `gpt-realtime-2` driver remains the production OpenAI path.

### Phase 1 — API drops, protocol-compatible scenario (days of work)

- [ ] Add `MJ: AI Models` rows for `gpt-live-1` and `gpt-live-1-mini` (type `Realtime`) + `MJ: AI Model Vendors` rows with `DriverClass: 'OpenAIRealtime'` and correct `APIName`s, in `metadata/ai-models/`; `mj sync push`.
- [ ] Set `PowerRank`/`Priority` so resolution (`BaseAgent.resolveRealtimeModel`, `RealtimeClientSessionService.resolveVendorAndInstantiate`) prefers GPT-Live where appropriate; keep `gpt-realtime-2` as fallback.
- [ ] Verify voice list — announcement says nine remastered ChatGPT voices; reconcile with the driver's `SupportedVoices` (currently alloy/ash/ballad/coral/echo/sage/shimmer/verse) once API docs publish the accepted values.
- [ ] Smoke-test both topologies (server-bridged WebSocket, client-direct WebRTC + ephemeral secret) and the `invoke-target-agent` delegation path.
- [ ] Confirm the model keeps narrating during long tool calls; if so, consider relaxing engineered narration (`RequestSpokenUpdate` cadence) for this driver via a capability flag.

### Phase 2 — API drops, protocol-changed scenario (1–2 weeks)

- [ ] Extend the event dispatcher in `packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts` (single switch, injectable connection seam → unit-testable) for new/renamed full-duplex events; mirror in `packages/AI/RealtimeClient/src/drivers/openAIRealtimeClient.ts`.
- [ ] Decide subclass vs. branch: if the wire protocol diverges enough, a `OpenAILiveRealtime` subclass registered as its own `DriverClass` keeps `gpt-realtime-2` untouched (follow the xAI-clone pattern in reverse).
- [ ] Add `RealtimeSessionCapabilities` flags (`FullDuplex`, `NativeTurnTaking`, `Backchannel` — final names TBD) and gate barge-in/`server_vad`/`Reconfigure` logic on them so existing drivers are unaffected.
- [ ] Review the raw-PCM audio plane (`packages/AI/RealtimeClient/src/audio/`) for half-duplex sequencing assumptions (simultaneous capture + playback).
- [ ] Update the tool broker only if the tool-call event shape changed; the `invoke-target-agent` contract itself is provider-agnostic and stays fixed.
- [ ] Unit tests against the connection seam + integration coverage per the deterministic tier conventions.

### Phase 3 — Bridge & channel follow-ons (opportunistic)

- [ ] Add a **model-native** `TurnTakingPolicy` mode in the bridge layer; wire it to the new capability flags. Telephony bridges (Twilio et al.) are the primary beneficiaries.
- [ ] Meeting mode: replace/augment the `DisableAutoResponse` reconfigure flip with the full-duplex equivalent ("stay quiet and listen" is now a trained model behavior).
- [ ] If the API exposes structured visual outputs (the "visual cards" surface), evaluate a channel plugin pair (`BaseRealtimeChannelClient`/`BaseRealtimeChannelServer`) to render them in the Explorer voice overlay.
- [ ] Revisit when OpenAI ships video/screen-share for GPT-Live: flip `SupportsVideo`, implement `OnVideoOutput`, and route through existing bridge `video/screen` tracks.

---

## 5. Explicit Non-Goals / Decisions

- **Do NOT adopt OpenAI's built-in background delegation** (their GPT-5.5 hand-off) even if the API exposes it. Deep work must continue to route through `invoke-target-agent` → MJ agents, preserving permissions, tools, memory, MCP reach, and `AIAgentRun` observability. GPT-Live is the interaction layer only.
- **No re-architecture.** The triple-registry plugin design (`BaseRealtimeModel` / `BaseRealtimeClient` / channel plugins, all ClassFactory + metadata resolved) was built precisely so a new provider generation is a driver + metadata change. Any proposal that touches `IRealtimeSession`, the tool broker contract, or the session entities in response to GPT-Live should be treated as scope creep and challenged.
- **No speculative code before the API ships.** Pricing, latency, protocol shape, and whether delegation is configurable are all unknown; Phase 1 vs. Phase 2 cannot be chosen until docs exist.

---

## 6. Open Questions (resolve when API docs publish)

1. Is GPT-Live served over the existing Realtime API protocol (same events, ephemeral secrets, `/v1/realtime/calls` WebRTC flow), or a new full-duplex protocol?
2. Are developer-defined tools first-class, and does the keep-talking-during-tool-calls behavior apply to them (not just OpenAI's internal delegation)?
3. Is the background-delegation layer exposed/configurable/disable-able in the API, or ChatGPT-only?
4. Do Instant/Medium/High effort tiers exist as an API parameter, and at which scope (session vs. per-response)?
5. What is the pricing/latency profile of `gpt-live-1` vs `gpt-live-1-mini` vs `gpt-realtime-2` — does mini become the default telephony-bridge model?
6. Which voices are accepted, and do the realtime mid-speech safety safeguards surface as API events (they would map onto `OnError`/a new event class)?

---

## 7. Reference — Key Files

| Concern | Path |
|---|---|
| Server realtime primitive + contracts | `packages/AI/Core/src/generic/baseRealtime.ts` |
| OpenAI server driver | `packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts` |
| OpenAI client (WebRTC) driver | `packages/AI/RealtimeClient/src/drivers/openAIRealtimeClient.ts` |
| OpenAI-compatible clone template | `packages/AI/Providers/xAI/src/models/xaiRealtime.ts` |
| Tool broker + `invoke-target-agent` | `packages/AI/Agents/src/realtime/realtime-tool-broker.ts` |
| Session prep (single producer) | `packages/AI/Agents/src/realtime/realtime-client-session-service.ts` |
| Server-bridged runner | `packages/AI/Agents/src/realtime/realtime-session-runner.ts` |
| Session lifecycle | `packages/MJServer/src/agentSessions/` |
| Bridges (turn-taking policy home) | `packages/AI/BridgeBase/`, `packages/AI/Bridge/` |
| Client audio plane | `packages/AI/RealtimeClient/src/audio/` |
| Architecture guides | `guides/REALTIME_CO_AGENTS_GUIDE.md`, `guides/REALTIME_BRIDGES_GUIDE.md` |

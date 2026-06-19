# Realtime Video Avatars (Runway-first) — Implementation Plan

## Status
- **Status**: Draft
- **Created**: 2026-06-19
- **Author**: AN-BC + Claude
- **Branch**: `an-bc/realtime-video-avatars`

## Overview

We are adding **realtime VIDEO models** to MemberJunction's realtime co-agent stack — i.e. an AI agent that has a live, low-latency **talking-head video presence** (synced face + voice), and that can also **see** the user's camera (full bidirectional audio+video). This is *not* batch video generation; it's the same real-time conversational loop our audio co-agents already do, plus a video track.

The key architectural insight (already validated and partly built): a video model is **just a realtime model that also carries a video track**. It reuses the entire existing realtime contract — tools, transcript, usage, turn-taking, the bridge, the client-direct WebRTC path — with **no new base class and no fork**. The only audio-only-shaped seam was the session media plane, which the **foundation work (already on branch `an-dev-31`, see below) has already made media-aware.**

This plan covers the **remaining work**: the concrete **Runway** provider (server model + browser client + UI render + metadata), plus scaffolds for Simli / Beyond Presence / Tavus. Runway is the first provider to wire and test (the user is supplying a `RUNWAYML_API_SECRET`).

## Goals & Non-Goals

### Goals
- A realtime agent can be given a **video avatar** via metadata (`realtime.video.enabled`), with audio-only as the default/fallback.
- **Runway** works end-to-end: the agent shows a live talking-head that lip-syncs its speech, in the voice co-agent overlay AND the Meet/LiveKit room.
- The integration reuses the existing realtime architecture (the media-aware foundation) — no new base class.
- Other providers (Simli, Beyond Presence, Tavus) are **scaffolded** to the same shape (test Runway first).

### Non-Goals
- Re-architecting audio realtime. The foundation is done; this is additive.
- Batch avatar video (`BaseVideoGenerator` already exists for that).
- Productionizing every provider — Runway is the proving ground; others are stubs.

## Background & Context

### What's already built (FOUNDATION) — on branch `an-dev-31`, uncommitted at time of writing

The media-aware realtime foundation is **done and tested** (RealtimeClient 332, ai-agents realtime 278, bridge server 93 — all green), reusing the existing architecture:

| File | Change |
|------|--------|
| `packages/AI/Core/src/generic/baseRealtime.ts` | Added `BaseRealtimeModel.SupportsVideo` getter (default `false`, mirrors `SupportsClientDirect`); `RealtimeMediaKind = 'audio'\|'video'` type; `IRealtimeSession.SendInput(chunk, kind?: RealtimeMediaKind)` (optional, defaults `'audio'`); optional `IRealtimeSession.OnVideoOutput?(handler)`. All back-compat — existing drivers untouched. |
| `packages/AI/RealtimeBridge/Server/src/ai-bridge-engine.ts` | Transport seam now media-aware: inbound `video-in → SendInput(…, 'video')`; outbound `OnVideoOutput?.( … ) → SendMedia('video-out')`. (LiveKit driver already publishes `video-out`, gated by `VideoOut` capability.) Server-bridged video path is complete. |
| `packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts` | `Connect(config, micStream, cameraStream?)` (optional camera); `OnRemoteVideo` registration + protected `emitRemoteVideo(stream)` so a driver hands the UI the model/avatar video. |
| `packages/AI/Agents/src/realtime/realtime-coagent-config.ts` | New `RealtimeVideoConfig` + `RealtimeConfigSection.video = { enabled, provider, avatarId, providers }`, normalized in `normalizeConfig` + deep-merged by `ResolveEffectiveRealtimeConfig`. |

> **IMPORTANT for whoever executes this plan:** the foundation lives on `an-dev-31` (a different in-flight branch). When this plan's branch is implemented, the foundation must be present (merged to `next` first, or rebased in). If `BaseRealtimeModel.SupportsVideo` / `IRealtimeSession.OnVideoOutput` / `RealtimeConfigSection.video` / `OnRemoteVideo` aren't there yet, land the foundation changes above first.

### The two realtime topologies (both already support video via the foundation)
- **Client-direct** (the voice co-agent overlay — the primary one): the browser opens a direct connection to the provider via `BaseRealtimeClient.Connect`. For video: attach a camera track + render the model/avatar video via `OnRemoteVideo`. Reference driver: `packages/AI/RealtimeClient/src/drivers/openAIRealtimeClient.ts` (`@RegisterClass(BaseRealtimeClient, 'openai')`).
- **Server-bridged** (the Meet/LiveKit bot): media flows as tagged tracks through the bridge; `BridgeMediaTrackKind` already includes `video-in`/`video-out`. Reference: `packages/AI/RealtimeBridge/Providers/LiveKit/src/livekit-bridge.ts`.
- **Policy:** prefer **client-direct for video** (heavy media should not flow through our server); degrade to bridged — same policy as `SupportsClientDirect` for audio.

## Key research findings (these drive the design)

### Landscape (mid-2026)
LiveKit-friendly is the norm — LiveKit Agents ships ~13 first-party avatar plugins. Best fits for **BYO-LLM + LiveKit + low latency**:
- **Runway Characters** — cheap (~$0.20/min), GA, single-image GWM-1 (eyeball the quality), LiveKit-native plugin, BYO-LLM. **← first provider.**
- **Simli** — cheapest (~$0.01–0.07/min), OSS LiveKit plugin, pure audio-driven lip-sync.
- **Beyond Presence (bey) / Anam** — sub-second / 180ms, LiveKit-native, premium quality, BYO-LLM.
- **Tavus** — most mature, explicit BYO-LLM/TTS, but Daily-native (validate the LiveKit-via-plugin path).
- **Avoid:** Hedra (sunset Apr 2026), Synthesia + Creatify (batch only).

### CRITICAL — Runway's actual integration shape
Runway does **NOT** expose "audio-frames-in → video-frames-out". A Runway **Session IS a live WebRTC/LiveKit room**: the avatar **joins a LiveKit room as a participant** and publishes synced video+audio; you **publish the agent/TTS audio into that room** and Runway lip-syncs. So MJ never handles raw frames for Runway.

**REST lifecycle (documented, certain):**
1. `POST /v1/realtime_sessions` — body `{ model: 'gwm1_avatars', avatar: { type: 'runway-preset', presetId } | { type: 'custom', avatarId }, maxDuration: ≤300 }`. Optional `personality`, `startScript`.
2. Poll `GET /v1/realtime_sessions/{id}` until `status === 'READY'` (states: `NOT_READY → READY → RUNNING → COMPLETED/FAILED/CANCELLED`).
3. `POST /v1/realtime_sessions/{id}/consume` (one-time; uses session-scoped bearer returned at READY) → returns LiveKit `{ url, token, roomName }`.
- **Auth:** `Authorization: Bearer <key>`; env `RUNWAYML_API_SECRET`. Consume creds retrievable **once**.
- **Sessions cap at 5 minutes.** BYO-LLM (audio→avatar) but a persona/startScript may enable a full-pipeline mode.
- **npm SDK:** `@runwayml/sdk` (server-side REST client); Runway's own `runway-characters-meet` reference calls the REST endpoints directly.
- **Sources:** docs.dev.runwayml.com/characters/{concepts,integration,livekit}; github.com/runwayml/runway-characters-meet; docs.livekit.io/agents/models/avatar/plugins/runway.

The user tested Runway's site and it **saw** them (glasses on/off) → realtime video models take **video IN** too (full bidirectional A/V), like GPT Realtime / Gemini Live + video.

## Architecture / Design

### Where the pieces register (mirror existing patterns)
- **Server realtime models** live per-provider, e.g. `packages/AI/Providers/Gemini/src/geminiRealtime.ts` → `@RegisterClass(BaseRealtimeModel, 'GeminiRealtime')`, override `SupportsClientDirect` + `CreateClientSession`.
- **Browser clients** live in `packages/AI/RealtimeClient/src/drivers/*RealtimeClient.ts` → `@RegisterClass(BaseRealtimeClient, '<provider>')`, exported from `packages/AI/RealtimeClient/src/index.ts`.
- **Resolution**: `packages/AI/Agents/src/base-agent.ts` `resolveRealtimeModel` / `selectRealtimeModelCandidates` filter active `AIModelType='Realtime'` models by PowerRank.
- **Metadata**: `MJ: AI Models` (Type=`Realtime`, video-capable) + `MJ: AI Model Vendors` (`DriverClass`, `Priority`, `Status`); `GetAIAPIKey(driverClass)` resolves `AI_VENDOR_API_KEY__<DRIVERCLASS>`.

### Flow (client-direct, Runway)

```mermaid
flowchart TD
    A[Browser: realtime overlay, video agent] -->|StartVoiceSession| B[Server: RealtimeClientSessionService.PrepareClientSession]
    B -->|RunwayRealtimeModel.CreateClientSession| C[Runway REST: create -> poll READY -> consume]
    C -->|LiveKit room url+token+roomName| B
    B -->|ClientRealtimeSessionConfig Provider=Runway, EphemeralToken=lkToken, SessionConfig={RoomUrl,RoomName,AvatarId}| A
    A -->|RunwayRealtimeClient.Connect: livekit-client join room| D[LiveKit room]
    A -->|publish mic + camera tracks| D
    D -->|Runway avatar participant publishes video+audio| A
    A -->|OnRemoteVideo stream| E[Render avatar as agent tile]
```

## Implementation Plan

### Phase 1 — Server `RunwayRealtimeModel` (new provider package)
1. **Create `packages/AI/Providers/Runway`** — new workspace package (package.json, tsconfig, src/index.ts). Mirror an existing AI provider package's scaffolding. Deps: `@memberjunction/global`, `@memberjunction/ai` (Core), `@memberjunction/core`. (Optionally `@runwayml/sdk`, but direct `fetch` against the REST endpoints is fine and dependency-light.) **Requires `npm install` at repo root to link.**
2. **`src/runwayRealtime.ts`** — `@RegisterClass(BaseRealtimeModel, 'RunwayRealtime')`, `export class RunwayRealtime extends BaseRealtimeModel`:
   - `override get SupportsClientDirect() { return true; }`
   - `override get SupportsVideo() { return true; }`
   - `override async CreateClientSession(params): Promise<ClientRealtimeSessionConfig>` — read `RUNWAYML_API_SECRET`; run the REST lifecycle (create with avatar/preset from `params.Config`/effective `realtime.video.avatarId`; poll READY; consume); return `{ Provider: 'Runway', Model: params.Model, EphemeralToken: <livekit token>, ExpiresAt: <session end>, SessionConfig: { RoomUrl, RoomName, AvatarId } }`.
   - `StartSession` (server-bridged path): may throw "client-direct only" for v1, OR open a server-side LiveKit room client. Decide after the live topology check (open question #1).
3. **Tree-shake guard** (`LoadRunwayRealtime()` no-op) + export from the package index, and ensure it's reachable by the server manifest.

### Phase 2 — Browser `RunwayRealtimeClient`
1. **`packages/AI/RealtimeClient/src/drivers/runwayRealtimeClient.ts`** — `@RegisterClass(BaseRealtimeClient, 'Runway')`, `export class RunwayRealtimeClient extends BaseRealtimeClient`. Add `livekit-client` (already hoisted v2.19.2) as a dep of `@memberjunction/ai-realtime-client`.
   - `Connect(config, micStream, cameraStream?)`: read `config.SessionConfig.{RoomUrl,RoomName}` + `config.EphemeralToken`; `new Room()`, `room.connect(url, token)`; publish `micStream` (and `cameraStream` if present) tracks; on `trackSubscribed` from the Runway avatar participant → audio: play; video: `this.emitRemoteVideo(track.mediaStream)`. Emit `'listening'` state when connected.
   - Implement the remaining abstract methods — many are best-effort/no-op for a full-pipeline avatar: `SendText` (publish a data message or no-op), `CancelActiveResponse` (no-op), `SendContextNote` (no-op), `RequestSpokenUpdate` (no-op), `SendToolResult` (no-op for v1; Runway BYO has no tools), `SetMuted` (toggle mic track `enabled`), `Disconnect` (room.disconnect + stop tracks), `IsBusy`/`IsAudioPlaying` (track from participant speaking events).
2. **Export** from `packages/AI/RealtimeClient/src/index.ts`.

### Phase 3 — Resolution & config
1. **`packages/AI/Agents/src/base-agent.ts`** — when the effective `realtime.video.enabled === true`, prefer a `SupportsVideo` model (and honor `realtime.video.provider` as a name/ID preference) in `selectRealtimeModelCandidates`/`resolveRealtimeModel`; degrade to audio-only when none resolves. (Note: `SupportsVideo` is a driver property; resolution works off `MJ: AI Models` metadata — add a video-capability signal to the model/vendor metadata, or resolve the driver to read `SupportsVideo`.)
2. The `realtime.video` config is already normalized/merged (foundation). The same effective-config also feeds `CreateClientSession`'s `params.Config` (avatarId, per-provider settings).

### Phase 4 — Angular wiring (render the avatar)
1. **`packages/Angular/Generic/conversations/src/lib/services/realtime-session.service.ts`** — when the resolved session is video (`SupportsVideo` / `realtime.video.enabled`), `getUserMedia({ audio: true, video: { ... } })`, pass the camera as `cameraStream` to `client.Connect`, and subscribe `client.OnRemoteVideo(stream => …)`.
2. **Overlay component** — render the `OnRemoteVideo` stream as the agent's tile (a `<video>` element bound to the stream). In the **Meet/LiveKit room**, the avatar already shows as a participant tile — no extra work.

### Phase 5 — Metadata + env
1. Seed an `MJ: AI Models` row for the Runway avatar (Type=`Realtime`, video-capable) + an `MJ: AI Model Vendors` row (`DriverClass='RunwayRealtime'`, Active, a Priority). Via metadata sync (`metadata/...`), not SQL.
2. `.env`: `RUNWAYML_API_SECRET=<key>`. (Also note the standard `AI_VENDOR_API_KEY__RUNWAYREALTIME` convention if resolving via `GetAIAPIKey` instead of a Runway-specific env var — pick one and be consistent.)

### Phase 6 — Scaffold other providers (stubs)
- `SimliRealtime` / `BeyAvatar` / `TavusRealtime` client + server skeletons following the same shape, with `TODO` bodies. Test Runway first; flesh these out per their docs (Simli + bey are LiveKit-native, similar to Runway; Tavus is Daily-native).

## Migration & Data
- No schema migration. New metadata rows only (AI Model + AI Model Vendor for Runway) via metadata sync.
- New workspace package `@memberjunction/ai-provider-runway` (or similar) → `npm install` at repo root + manifest regen so the `@RegisterClass` is loaded server-side.

## Testing Strategy
- **Unit (no network):** `RunwayRealtimeModel.CreateClientSession` against a mocked `fetch` (create→poll→consume happy path + FAILED/timeout). `RunwayRealtimeClient` against a fake `Room`/track model (publish mic/camera; `trackSubscribed` video → `emitRemoteVideo`; mute toggles track.enabled; disconnect stops tracks). Mirror the existing `openai`/`gemini` client tests in `packages/AI/RealtimeClient/src/__tests__/`.
- **Live (needs key):** open a video agent → confirm the avatar tile renders, lip-syncs, and (if full-pipeline) responds to speech + "sees" the camera. Verify in the voice overlay AND the Meet room.
- Re-run the foundation suites to confirm no regressions.

## Risks & Open Questions (verify LIVE with the key — do NOT guess)
1. **Room topology:** does Runway **join OUR** LiveKit room (token handoff, like the LiveKit-Agents plugin `avatar.start(session, room)`) or **provision ITS own** room (the REST `consume` returns Runway's creds)? If the latter, getting the avatar into the **Meet** room needs a **room-to-room relay** (Runway's own `runway-characters-meet` does this). This decides whether the avatar appears directly in our room or via a relay — and shapes `StartSession` (bridged path).
2. **Full-pipeline vs BYO-LLM:** Runway's site demo (saw the user, responded) is full-pipeline (their LLM/persona/vision). The Characters API is documented BYO-LLM (audio→avatar). If full-pipeline is API-exposed (via `personality`/`startScript`), Runway alone = brain+face (simplest). If BYO only, we **compose**: an audio brain (GPT/Gemini realtime) produces audio → piped to Runway for the face. v1 should pick one explicitly after a live check.
3. **Audio format:** exact sample rate/channels Runway expects on the published track is undocumented — confirm with the key (`@livekit/rtc-node`/`livekit-client` typically 48kHz mono).
4. **5-minute session cap:** plan a re-mint/refresh for longer conversations.
5. **`npm install` timing:** the new provider package + `livekit-client` dep require an install; do it deliberately (the user has had install-OOM issues, and branches may be shared).

## Files to Modify / Create

| File | Change |
|------|--------|
| `packages/AI/Providers/Runway/**` (new) | New provider package + `RunwayRealtime` server model (`CreateClientSession` REST lifecycle) |
| `packages/AI/RealtimeClient/src/drivers/runwayRealtimeClient.ts` (new) | Browser client (livekit-client room join, mic+camera publish, avatar render via `OnRemoteVideo`) |
| `packages/AI/RealtimeClient/src/index.ts` | Export the Runway client driver |
| `packages/AI/RealtimeClient/package.json` | Add `livekit-client` dependency |
| `packages/AI/Agents/src/base-agent.ts` | Prefer a `SupportsVideo` model when `realtime.video.enabled` |
| `packages/Angular/Generic/conversations/src/lib/services/realtime-session.service.ts` | Capture camera + wire `OnRemoteVideo` when video is on |
| Overlay component (conversations) | Render the avatar video tile |
| `metadata/**` | Runway AI Model + AI Model Vendor rows |
| `.env` | `RUNWAYML_API_SECRET` |
| `packages/AI/Providers/{Simli,Bey,Tavus}/**` (stubs) | Scaffolds for the other providers |

## References
- Foundation work: branch `an-dev-31` (the media-aware realtime changes listed above).
- Runway: docs.dev.runwayml.com/characters/{concepts,integration,livekit}; github.com/runwayml/runway-characters-meet; docs.livekit.io/agents/models/avatar/plugins/runway; npmjs.com/package/@runwayml/sdk.
- LiveKit avatar plugin index: docs.livekit.io/agents/models/avatar/.
- MJ realtime guides: `guides/REALTIME_CO_AGENTS_GUIDE.md`, `guides/REALTIME_BRIDGES_GUIDE.md`.

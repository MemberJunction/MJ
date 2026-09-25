# Video in realtime: agent avatars, webcam self-view, screen share, and a shared media stack

**Status:** PROPOSAL, revised 2026-09-25 against Google's published pages (see §0). Ready to hand
to a developer.
**Branch:** `claude/video-avatar-channel-moifkb`

**Builds on:**
- [`media-tracks-and-modalities.md`](media-tracks-and-modalities.md). §8 step 6 is "first outbound
  non-audio track when an avatar provider lands". This plan is that step.
- [`gemini-3-8-live.md`](gemini-3-8-live.md) Phase F (inbound video, done) and §9.2 (outbound video,
  deferred until now).

**Package pattern:**
- `@memberjunction/conversations-runtime` + `@memberjunction/ng-conversations`: a framework-agnostic
  engine plus a thin Angular package.
- [`UI_LAYERING_GUIDE.md`](../../guides/UI_LAYERING_GUIDE.md): L0 domain → L1 widgets → L2
  composites → L3 Explorer surfaces.

---

## 0. What Google's documentation actually says

Read from the published pages supplied 2026-09-25: the Gemini API model pages, the Live API
capabilities guide, the Gemini Enterprise Agent Platform Live API overview, and the Live Avatar
launch blog. Page names are in quotes. **VERIFY** marks what those pages do *not* settle.

| Fact | Source | Consequence |
|---|---|---|
| Live Avatar is **"available in Gemini Enterprise"** only | launch blog | The avatar lives on the **Vertex / Gemini Enterprise Agent Platform** endpoint, not the Gemini Developer API our current driver uses |
| On the Gemini Developer API, `gemini-3.8-live` output is **"Text and audio"**, and "Audio is the supported response modality" | "Gemini 3.8 Live" page | The existing `GeminiRealtime` driver can never produce an avatar. Requesting one there must degrade, not error |
| Enterprise Live API output modalities include **"Video (live avatars): Video (mp4)"** | Enterprise "Gemini Live API overview", technical specifications | Avatar frames arrive as **MP4 over the same WSS socket**. The browser needs an MP4 playout path (MSE), not a `MediaStream` from a peer connection |
| Enterprise protocol: **"Stateful WebSocket connection (WSS)"** | same | Same socket shape as today's driver |
| Enterprise supported models: **`gemini-3.8-live`** ("Live avatar" listed among its features) and `gemini-live-2.5-flash-native-audio` (no avatar) | same | Avatar capability is **per (endpoint, model)**, not per model id. The profile table must key on both |
| Input: PCM16 16 kHz; images/video **"JPEG 1FPS"**; text | Enterprise overview + capabilities guide ("max 1 frame per second") | Unchanged from Phase F |
| **"Audio-only sessions are limited to 15 minutes, and audio plus video sessions are limited to 2 minutes"**, extendable via session management | capabilities guide, Session duration | An avatar session is an audio+video session. Session resumption (F7) is mandatory, not optional |
| Turn coverage defaults to `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO`; "only send frames when needed to manage context and cost" | 3.8 Live page | Keeps our "video off unless requested" rule |
| Preset avatar library; **custom avatars from a reference image via enterprise allowlisting** | blog | Preset-by-id in v1. Custom likeness is a tenant-configured capability, not a default |
| All audio and video output is watermarked with **SynthID** | blog | Show an "AI-generated" disclosure in the UI |
| **"The Live API only provides server-to-server authentication by default"**; client-to-server uses ephemeral tokens | capabilities guide, Client authentication | Ephemeral tokens are documented for the Developer API. **VERIFY** whether the Enterprise endpoint offers them (§4.2 designs for both answers) |
| Partner integrations (**Daily, LiveKit, Twilio, Voximplant**) run Gemini Live **over WebRTC**; there is a LiveKit + ADK reference architecture | Enterprise overview | Alternative transport: agent server-side in a LiveKit room, avatar published as a WebRTC track (§4.3) |

**Still VERIFY** (the "Configure live avatars" and "Send audio and video streams" pages were not
in the set):
- **V-1:** setup field names for choosing an avatar, and the preset catalogue.
- **V-2:** whether the MP4 is fragmented, its codec string, and whether it **contains the audio
  track**. If it does, we must not also play the PCM, or the voice doubles.
- **V-3:** the audio/video sync mechanism and timestamps.
- **V-4:** Enterprise client authentication (ephemeral tokens or not).
- **V-5:** avatar pricing.
- **V-6:** whether `interrupted` truncates video server-side.
- **V-7:** exact regional endpoints (the GA note says US and EU).

---

## 1. Goals

1. **Agent avatar:** a talking-head video in sync with the agent's voice. It replaces the orb
   when available and falls back to the orb otherwise.
2. **User webcam, with a mirrored self-view.**
3. **Screen share**, where the user chooses: entire screen, a window, a browser tab, or **one
   panel of the current MJ page**. The user sees what they are sharing.
4. **One media stack for MJ.** The same framework-agnostic core and Angular widgets serve the
   realtime co-agent and the LiveKit meeting room (and any Angular app), and the LiveKit room is
   migrated onto them.
5. **Any provider plugs in.** Gemini Enterprise is the first avatar provider. HeyGen Streaming,
   Tavus, Simli, D-ID, Anam, bitHuman, Runway and whatever ships next must each be a driver
   (one class plus metadata rows), with no UI or runtime changes.

**Non-goals for this plan:** recording or compositing avatar video into session recordings,
tab/system audio capture as model input, and multi-avatar meeting grids (the §8 bridge work
covers the minimum).

---

## 2. What exists today (verified in code)

The media-track architecture already anticipates this work. Most of the contract is declared
but never exercised:

| Piece | Where | State |
|---|---|---|
| Track contract (`Modality`, `Direction`, `Encoding`, `Rate`, `RequiresConsent`, `UsageBasis`), negotiation with the audio pair as a floor | `AI/Core/src/generic/realtimeTracks.ts`, `BaseRealtimeClient.negotiateTracks` | ✅ used by inbound video |
| `SupportedOutboundTracks` capability | `baseRealtime.ts:434` | declared; Gemini publishes audio only |
| `BaseRealtimeModel.SupportsVideo` | `baseRealtime.ts:184` | no driver overrides it |
| `IRealtimeSession.OnVideoOutput?(ArrayBuffer)` | `baseRealtime.ts:529` | no implementer; no codec or timestamp |
| `BaseRealtimeClient.OnRemoteVideo(MediaStream)` | `baseRealtimeClient.ts:563` | no driver emits it; no UI subscribes |
| Channel `GetSourcedTracks()` | channel bases | ✅ consumed (F8) |
| Channel `GetSunkTracks()` | `baseRealtimeChannelServer.ts:240` | no implementer, no consumer |
| `CreateCameraCapture` / `CreateScreenCapture` / `CreateStreamFrameCapture` | `RealtimeClient/src/media/frameCapture.ts` | built; **no caller outside the package** |
| `Connect(config, mic, cameraStream?)` | `baseRealtimeClient.ts:363` | the runtime never passes a camera (`RealtimeSessionRuntime.ts:1025`) |
| `IRealtimeMediaHost` | `RealtimeRuntime/src/hosts/IRealtimeMediaHost.ts` | `AcquireMicrophone()` only |
| `RealtimeVideoConfig { enabled, provider, avatarId, providers }` | `AI/Agents/src/realtime/realtime-coagent-config.ts:137` | parsed; nothing reads it |
| `MJ: AI Personas.PreviewImageURL` / `PreviewVideoURL` | schema | exist; natural home for avatar identity |
| Vertex credentials + client (`VertexAICredentials`: project, location, service account / ADC) | `AI/Providers/Vertex/src/models/vertexLLM.ts` | ✅ reusable for the Enterprise Live driver |
| Bridge `video-out` routing | `RealtimeBridge/Server/src/ai-bridge-engine.ts:1001-1040` | wired; LiveKit native `publishVideo` is a no-op |
| LiveKit room core (framework-agnostic) + Angular UI (tile, prejoin, device menu, control bar, meter, agent state, connection overlay) | `packages/LiveKitRoomCore`, `Angular/Generic/livekit-room`, `Angular/Generic/mj-livekit-room` | ✅ built; LiveKit-typed only at a few seams (§3.1) |

### 2.1 Gaps (every one has a task in §9)

- **G1. Every `inlineData` part is treated as audio.** `geminiRealtimeClient.ts` `handleModelAudio`,
  and the parser at `geminiRealtime.ts:1315`, enqueue every `part.inlineData.data` into PCM
  playback without checking `mimeType`. MP4 avatar data would be played as audio.
- **G2. The server session drops the media kind.** `GeminiRealtimeSession.SendInput(chunk)` ignores
  `kind`, so bridged `video-in` frames go to Gemini as audio.
- **G3. No playout path for encoded video.** The UI contract is `OnRemoteVideo(MediaStream)`, but
  Gemini Enterprise sends MP4 chunks. Nothing plays chunks, and nothing syncs them with audio.
- **G4. Only "native" avatars are modelled.** Most vendors (HeyGen, Tavus, Simli, D-ID) are a
  *second* stage that turns the LLM's audio into video. Core assumes one model does everything.
- **G5. One inbound video track, many sources.** Negotiation dedupes by `Direction:Modality`.
  Camera, screen, whiteboard and remote browser compete, and nothing arbitrates or tells the model
  what it is looking at.
- **G6. Tracks are fixed at `Connect`.** There is no mid-call `AddTrack` / `RemoveTrack`.
- **G7. Capture is throttled at the source.**
  - `getUserMedia` / `getDisplayMedia` are called with `frameRate: { max: 1 }`
    (`frameCapture.ts:153`, `:186`), so a self-view would be a 1 fps slideshow.
  - The 1 fps ceiling is also hardcoded three times, contradicting `MaxInboundVideoRate`.
- **G8. No screen-share surface options anywhere.** No `displaySurface`, `selfBrowserSurface`,
  `surfaceSwitching`, `preferCurrentTab`, Region/Element Capture, or `onended` handling.
  LiveKit uses `setScreenShareEnabled(true)` with defaults.
- **G9. Capability is keyed on model id alone.** It lives in `geminiLiveProfiles.ts`, but the
  same `gemini-3.8-live` has an avatar on Enterprise and none on the Developer API.
  `MJ: AI Model Modalities` rows are never read by realtime.
- **G10. The UI is audio-first.** The realtime overlay has no `<video>`. Surface tabs know only
  `activity | channel`.
- **G11. Outbound video has no usage accounting.** Avatar minutes are likely the most expensive line.
- **G12. Meetings.** LiveKit native subscribes to audio only and `publishVideo` is a no-op.
- **G13. Duplicated media code.**
  - Two audio meters (`RealtimeClient/audio/audioMeter.ts`, 9 bins; `LiveKitRoomCore/audio-meter.ts`
    + `livekit-preview.ts`, 7 bins).
  - Two device enumerations (prejoin, controller).
  - Capture code in `RealtimeClient` that LiveKit cannot use.
- **G14. No Enterprise (Vertex) realtime driver, and no auth path for it** (V-4).

---

## 3. Target package architecture

This is the ConversationsRuntime pattern applied to media. Arrows point toward dependencies.

```
                        ┌──────────────────────────────────────────┐
                        │  @memberjunction/media-core   (NEW, L0)  │
                        │  packages/MediaCore                      │
                        │  pure TS · browser APIs · rxjs           │
                        │  deps: @memberjunction/global, rxjs ONLY │
                        └──────────────────────────────────────────┘
                           ▲             ▲                 ▲
           ┌───────────────┘             │                 └──────────────────┐
┌──────────┴───────────┐   ┌─────────────┴──────────────┐  ┌──────────────────┴─────────┐
│ livekit-room-core    │   │ ai-realtime-client         │  │ ng-media  (NEW, L1/L2)     │
│ (adapter: LiveKit →  │   │ (drivers use core playout, │  │ Angular/Generic/media      │
│  MediaParticipant)   │   │  frame sampler, meters)    │  │ thin standalone components │
└──────────┬───────────┘   └─────────────┬──────────────┘  └──────────┬─────────────────┘
           │               ┌─────────────┴──────────────┐             │
           │               │ realtime-runtime           │             │
           │               │ (session → MediaStage)     │             │
           │               └─────────────┬──────────────┘             │
┌──────────┴───────────┐   ┌─────────────┴──────────────┐             │
│ ng-livekit-room      │──▶│ ng-conversations (realtime │◀────────────┘
│ (migrated onto       │   │  overlay uses ng-media)    │
│  ng-media)           │   └────────────────────────────┘
└──────────────────────┘
```

Hard rules, each enforced in review:
1. `media-core` imports **no** Angular, **no** `livekit-client`, **no** `@memberjunction/ai*`. It is
   generic browser media, usable from React, the web widget, or a future React Native host
   (behind its host interface).
2. `ng-media` imports **no** `livekit-client`, **no** `@memberjunction/ai*`, **no** router. It
   renders `media-core` models.
3. No re-exports between packages (MJ rule 5). Consumers import from the defining package.
4. Vendor SDKs stay in vendor packages: LiveKit in `livekit-room-core`, vendor avatar SDKs in their
   provider packages.

### 3.1 `@memberjunction/media-core` (new, `packages/MediaCore`)

Framework-agnostic, headless, testable in Node with fakes (a vitest `happy-dom` environment plus
hand-rolled `MediaStream` fakes, as `RealtimeClient` tests already do).

| Module | Contents | Absorbs / replaces |
|---|---|---|
| `model/` | Vocabulary types (below): `MediaParticipant`, `MediaVideoSource`, `MediaSourceKind`, `MediaDevice`, `LocalMediaState`, `MediaConnectionStatus`, `MediaAgentState` | `LiveKitParticipantView`'s generic half, `LiveKitDevice`, `LiveKitLocalMediaState` |
| `capture/LocalMediaController` | Acquire/release **mic, camera, display**. Device list + `devicechange`. Switch device (hot-swaps tracks). Consent gating. Track `onended` → state. Observable `State$` | `frameCapture.ts` `CreateCameraCapture`/`CreateScreenCapture`, `livekit-preview.ts`, prejoin enumeration |
| `capture/displayCapture` | `DisplayCaptureOptions` → `getDisplayMedia` with `displaySurface` hint, `selfBrowserSurface:'exclude'`, `surfaceSwitching:'include'`, `preferCurrentTab`, `monitorTypeSurfaces`. **Element/Region capture** of one DOM element (`CropTarget`/`cropTo`, `RestrictionTarget`/`restrictTo`, feature-detected, falls back to a whole tab with a reason). Reports the *actual* `getSettings().displaySurface` and a label | new (G8) |
| `capture/FrameSampler` | Taps any `MediaStream` at a **caller-supplied** rate and returns base64 JPEG/PNG frames. **No built-in rate ceiling**: the caller passes the negotiated rate | `CreateStreamFrameCapture` (G7) |
| `audio/AudioLevelMeter` | One analyser-based meter, bin count configurable (7 or 9 are just parameters), RMS + frequency buckets, pure smoothing function | both meters (G13) |
| `playout/VideoPlayout` | Plays **encoded** video chunks into a target element, with a decoder registry keyed by MIME type: **MSE for fragmented MP4 (Gemini Enterprise, V-2)**, WebCodecs `VideoDecoder` for raw H.264/VP8/AV1, `ImageDecoder`/`createImageBitmap` for image frames. `Flush()` for barge-in. Optional `IPlaybackClock` to present frames against audio playback time. Exposes a `MediaVideoSource` | new (G3) |
| `stage/MediaStage` | The headless view-model of "who's on screen": participants in, **layout computed** out (spotlight, grid, filmstrip, screen-share-focus, **stage + PiP**), plus pin, active speaker and hide-self-view. Pure selectors + `State$` | `livekit-room-logic.ts` selectors, generalized |
| `attach/AttachVideoSource(el, source)` | The one function that puts any `MediaVideoSource` into a `<video>` element and returns a detach function | replaces `track.attach(el)` in UI code |

**The key abstraction: `MediaVideoSource`.** It makes WebRTC, MSE and canvas output
interchangeable to every renderer:

```ts
export type MediaVideoSource =
    | { Kind: 'stream'; Stream: MediaStream }                          // getUserMedia, getDisplayMedia, WebRTC (LiveKit, Tavus, HeyGen…)
    | { Kind: 'element'; Attach(el: HTMLVideoElement): () => void };   // MSE / WebCodecs playout that must own the element

export type MediaSourceKind = 'camera' | 'screen' | 'avatar' | 'surface' | (string & {});   // open vocabulary, like modalities

export interface MediaParticipant {
    Identity: string;
    DisplayName: string;
    Role: 'self' | 'agent' | 'host' | 'participant';
    IsSpeaking: boolean;
    AudioLevel: number;                       // 0..1
    Video: Partial<Record<MediaSourceKind, MediaVideoSource>>;   // camera / screen / avatar …
    PreferredVideo?: MediaSourceKind;         // which one a tile shows by default
    Mirror?: boolean;                         // true for the local camera only
    Placeholder?: { ImageUrl?: string; Initials?: string; Visual?: 'orb' | 'avatar-image' };
    ConnectionQuality?: 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';
    Badges?: readonly MediaBadge[];           // e.g. { Kind:'ai-generated' }, { Kind:'agent-can-see' }
}
```

The LiveKit adapter wraps a remote track as `{ Kind:'stream', Stream: new MediaStream([track.mediaStreamTrack]) }`.
The Gemini Enterprise driver produces `{ Kind:'element', Attach }` from `VideoPlayout`. HeyGen and
Tavus produce `stream`. **No renderer ever branches on provider.**

### 3.2 `@memberjunction/ng-media` (new, `packages/Angular/Generic/media`)

Standalone, OnPush, `inject()`, `@if`/`@for`, PascalCase inputs/outputs, `--mj-*` tokens only
(the `check:ui` gate), `mjButton`, no router. Each component binds a `media-core` model and emits
intent. None of them acquires media or talks to a vendor.

| Component | Layer | From | Notes |
|---|---|---|---|
| `mj-media-tile` | L1 | `livekit-participant-tile` | Input `Participant: MediaParticipant`, `Source?: MediaSourceKind`, `ShowMeter`, `ShowName`, `ShowBadges`, `Pinnable`. Renders via `AttachVideoSource`. Placeholder slot (`<ng-content select="[placeholder]">`) so the realtime overlay can project its **orb** |
| `mj-media-stage` | L2 | `livekit-room` layout | Input `Stage: MediaStage`. Renders spotlight / grid / filmstrip / stage+PiP. **Draggable PiP** corner with the position persisted via `UserInfoEngine` (`mj.media.pipCorner.v1`) |
| `mj-self-view` | L1 | new | Mirrored local camera tile + "Agent can see this" badge + hide toggle (`mj.media.selfView.hidden.v1`) |
| `mj-share-preview` | L1 | new | Unmirrored preview of what is shared, its label, **Stop sharing** / **Change** |
| `mj-media-controls` | L1 | `livekit-control-bar` | Mic / camera / share toggles. **Share is a split button:** *Entire screen · Window · Browser tab · This panel ▸* (the host supplies panel targets). Feature gates as inputs |
| `mj-media-device-menu` | L1 | `livekit-device-menu` | Rename only; it is already presentational. Optional effects toggles as inputs |
| `mj-camera-check` | L2 | `livekit-prejoin` | Mirrored preview, device pick, mic meter. Uses a `LocalMediaController` input. The consent moment for camera |
| `mj-audio-meter` | L1 | `livekit-audio-meter` | Input is a level provider `() => number`. rAF loop outside the zone (as today) |
| `mj-agent-state` | L1 | `livekit-agent-state` | Rename only |
| `mj-connection-overlay` | L1 | `livekit-connection-overlay` | Rename only |

### 3.3 Adapters (the only places that know both sides)

- **`livekit-room-core`:**
  - `ToMediaParticipant(view)` maps a LiveKit participant to the generic model.
  - The controller takes `DisplayCaptureOptions` for screen share: it acquires via `media-core`
    `displayCapture` and publishes with
    `localParticipant.publishTrack(track, { source: Track.Source.ScreenShare })`, so the LiveKit
    room gets the same picker semantics, including "this panel".
  - Background effects (`livekit-effects.ts`) stay in LiveKit. They can later be offered to
    `LocalMediaController` through an optional processor hook.
- **`realtime-runtime`:**
  - `RealtimeSessionRuntime` exposes a `MediaStage`: an agent participant whose `Video.avatar` is
    fed from the client's remote video (absent means the orb placeholder), plus a self participant
    with `camera` / `screen` from `LocalMediaController`.
  - `IRealtimeMediaHost` gains `CreateLocalMediaController()`. The browser host returns the
    `media-core` one; the web widget and a future React Native host supply their own.
- **`ai-realtime-client`:**
  - Drivers use `VideoPlayout`, `FrameSampler` and `AudioLevelMeter` from `media-core`.
  - `frameCapture.ts` and `audioMeter.ts` become thin deprecated wrappers that *call* (not
    re-export) the core, and are deleted in the next major.

### 3.4 Where things live, one line each

| Concern | Package |
|---|---|
| Acquire camera / screen / mic, pick devices, crop to element | `media-core` |
| Decode and play encoded avatar video | `media-core` |
| Layout: who is big, who is PiP | `media-core` (`MediaStage`), rendered by `ng-media` |
| Which source the **model** sees; tell the model when it changes | `ai-realtime-client` (`RealtimeVideoSourceArbiter`), since it knows negotiated tracks |
| Avatar session minting, vendor auth | server driver in the vendor's AI provider package |
| Composing a voice model with an avatar renderer | `realtime-runtime` |
| Which UI shows what | `ng-conversations` realtime overlay (co-agent), `ng-livekit-room` (meetings) |

---

## 4. Realtime provider contract for video

### 4.1 Two avatar topologies, one outbound `video` track

**Native.** The realtime model emits synchronized audio and video. Gemini 3.8 Live on Enterprise
is this.
- It declares `SupportedOutboundTracks: [{ Modality:'video', Direction:'outbound', Encoding:'video/mp4', UsageBasis:['seconds'] }]`.
- The client driver routes video parts into `VideoPlayout` and calls `emitRemoteVideo(source)`.

**Composed.** A new pair of base classes, ClassFactory-keyed like every realtime driver:

```ts
// AI/Core: server side
export abstract class BaseRealtimeAvatarRenderer {
    /** Mints the vendor avatar session; returns an opaque client config (private pact with the same-keyed client). */
    abstract CreateClientSession(params: RealtimeAvatarSessionParams): Promise<ClientAvatarSessionConfig>;
    /** Static catalogue fallback; metadata (personas) is authoritative. Mirrors SupportedVoices. */
    get SupportedAvatars(): RealtimeAvatarOption[] { return []; }
    /** How the agent's audio reaches the renderer. */
    abstract get AudioIngress(): 'client-stream' | 'server-pcm' | 'vendor-tts';
}

// ai-realtime-client: browser side
export abstract class BaseRealtimeAvatarClient {
    abstract Connect(config: ClientAvatarSessionConfig, agentAudio: MediaStream): Promise<void>;
    abstract Interrupt(): void;                                   // barge-in: stop mouthing the cut-off sentence
    OnVideo(handler: (source: MediaVideoSource) => void): void;   // usually { Kind:'stream' } from the vendor's WebRTC
    abstract Disconnect(): Promise<void>;
}
```

`RealtimeSessionRuntime` composes them. If an avatar is requested and the resolved model has no
outbound video track, it:
1. Resolves a renderer.
2. Pipes the voice model's output audio into it (`GetRemoteMediaStream()`, or a
   `MediaStreamAudioDestinationNode` tap on `RealtimePcmPlayback`).
3. **Mutes the model's direct playout**, since the renderer's stream now carries audio and video
   together.
4. Exposes the renderer's video as the agent's `Video.avatar`.

The UI cannot tell the topologies apart. **Every audio-only model we have (OpenAI Realtime,
GPT-Live, xAI, ElevenLabs, Gemini Developer API) gets a face by pairing, with no driver changes.**

**Barge-in rule, both topologies:** `OnInterruption` flushes video too, so the avatar does not
keep mouthing a sentence that was cut off. Native drivers call `VideoPlayout.Flush()`; composed
avatars get `Interrupt()`.

### 4.2 The Gemini Enterprise driver (first native avatar provider)

- **Where:** `packages/AI/Providers/Vertex`, which already owns `VertexAICredentials` and the
  Vertex `GoogleGenAI` client.
- **What:**
  - `@RegisterClass(BaseRealtimeModel, 'GeminiEnterpriseRealtime')`, extending `GeminiRealtime`
    and overriding only client creation (`vertexai: true`, project, location) and the auth/mint
    seam.
  - All config legality, tools, idle signal and thinking logic is inherited.
  - Client driver key `'gemini-enterprise'`, extending the `'gemini'` client and overriding only
    the connect target.

Enterprise browser auth (V-4) is designed for both answers behind one field that every driver can
use:

```ts
// ClientRealtimeSessionConfig gains (additive):
Transport?: 'direct' | 'relay';   // absent ⇒ 'direct' (today)
RelayUrl?: string;                // MJAPI-issued, single-use, session-scoped
```

- **If Enterprise supports ephemeral tokens:** `direct`, exactly like today.
- **If not:** `relay`. MJAPI exposes a **generic authenticated WebSocket relay**
  (`/realtime/relay/:sessionId`).
  - It is opened with a single-use MJ ticket minted alongside the session.
  - It dials the provider with **server-held credentials** (service account / ADC via the MJ
    Credentials system).
  - It forwards frames byte-for-byte in both directions.
  - It enforces the mint-time locked config: it rejects a client `setup` whose model, avatar or
    tools differ from what was minted, because the relay replaces the token's constraint lock.
  - The same relay serves any future provider with no browser-safe token.
  - Cost is one extra hop; the benefit is that credentials never reach the browser.

**Never** hand a Google OAuth access token to the browser. It is project-wide, not
session-scoped.

**Profile table keyed by endpoint (G9).** `GeminiLiveModelProfile` gains `Endpoint: 'developer' | 'enterprise'`
(resolution: longest prefix within the endpoint) and:

```ts
SupportsAvatarOutput: boolean;             // enterprise gemini-3.8-live: true; developer: false
AvatarOutputEncoding?: string;             // 'video/mp4' (V-2 refines codecs)
AvatarAudioMuxed?: boolean;                // V-2: true ⇒ the MP4 carries the voice; do NOT also play PCM
```

**Config mapping (generalize then map):**
- `RealtimeAvatarSettings.Enabled` maps to the Enterprise setup's video response modality and
  avatar selection (V-1 field names).
- On a profile with `SupportsAvatarOutput:false`, it logs "avatar requested, not supported on this
  endpoint/model — audio only" and mints audio-only. **Never a mint error.**
- The avatar id is locked into the token constraints (direct) or the relay's pinned setup (relay),
  so the browser cannot swap likeness.

**Fix G1 in the base `'gemini'` client:** route parts by `inlineData.mimeType` through a small
registry: `audio/pcm*` → PCM playback, `video/*` → `VideoPlayout`, anything unknown → a
logged drop. It is never played as audio.

**Session length:** audio+video is a 2-minute session. F7 resumption (`goAway` +
`sessionResumptionUpdate`) must be proven across at least 3 consecutive resumptions with the
avatar live, and `VideoPlayout` must survive a reconnect without a black flash. It holds the last
frame until new data arrives.

### 4.3 Alternative transport, documented for later: WebRTC via LiveKit

Google's own reference architecture runs Gemini Live server-side inside a LiveKit room. Our
bridged path already does this for audio. Once §8 lands (LiveKit `publishVideo`), an Enterprise
avatar session can run **bridged**: the agent is a LiveKit participant, and the browser renders
its video track through the same `mj-media-tile`.
- This avoids browser auth entirely and gives WebRTC delivery.
- It costs server-side MP4 → raw-frame decoding for `@livekit/rtc-node` `VideoSource`.
- Not v1. The media-core abstractions make it a transport swap, not a UI change.

### 4.4 Contract changes in Core and client (all additive)

| Change | Where |
|---|---|
| `RealtimeVideoFrame { Data, MimeType, TimestampMs?, KeyFrame?, Width?, Height? }` + `IRealtimeSession.OnVideoFrame?` (typed sibling of `OnVideoOutput`) | `AI/Core baseRealtime.ts` |
| `BridgeMediaFrame` gains optional `MimeType`/`Width`/`Height`/`KeyFrame` | `RealtimeBridge/Base` |
| `OnRemoteVideo` handler type widens to `MediaVideoSource`. Keep a `MediaStream` overload that wraps into `{Kind:'stream'}` for back-compat | `BaseRealtimeClient` |
| `AddTrack(desc)` / `RemoveTrack(desc)`: re-negotiate locally. Drivers that need the wire re-set up via resumption (Gemini F7, OpenAI reconnect) | `BaseRealtimeClient` |
| `RealtimeAvatarSettings { Enabled, AvatarID?, ReferenceImageFileID?, Renderer?, Resolution? }` in `ModelConfiguration.Realtime`. The co-agent `RealtimeVideoConfig` maps onto it (finally read) | `AI/Core modelConfiguration.ts`, `AI/Agents realtime-coagent-config.ts` |
| `RealtimeUsageModalityDetail.VideoOutSeconds`; composed renderers report usage as their own model | `AI/Core` |
| `ClientRealtimeSessionConfig.Transport` / `RelayUrl` | `AI/Core` |

### 4.5 Deciding what the model sees (G5)

`RealtimeVideoSourceArbiter` lives in `ai-realtime-client`. It becomes the **single writer** to
`SendVideoFrame`, and the existing `ChannelInboundVideoBridge` registers with it instead of
writing directly.
- **Sources:** camera, screen, whiteboard, remote browser, and anything later.
- **Policy** is a data array, so an agent can override it:
  1. an explicit user pick ("Agent sees: ▾");
  2. otherwise the most recently started capture;
  3. otherwise the focused surface tab.
- **On every switch** it sends `SendContextNote("[The user is now sharing: <label>]")`, so the model
  knows what it is looking at.
- **The rate comes only from the negotiated track descriptor** (`MaxInboundVideoRate`). All
  hardcoded `Math.min(…, 1)` clamps are deleted.

### 4.6 Webcam and screen share are channels (no DDL)

Two client channel plugins, **Camera** and **Screen Share**, as rows in `MJ: AI Agent Channels`
(declarative metadata):
- They source inbound video through the existing `GetSourcedTracks()` → `requestedTracks` path.
- **Server tools:** `Camera_RequestView` and `Screen_RequestShare` ("could you show me your
  screen?"). These **only prompt**. Capture always needs a user click.
- **Dormant-track rule:** because requesting video collapses the session to the 2-minute cap,
  the video track is requested **when capture starts**, via `AddTrack` (§4.4), not at connect.
  Resumption carries the conversation across.

### 4.7 Channel placement (the one new channel property)

`MJ: AI Agent Channels.UIConfig` (existing JSON, no DDL) gains
`Placement?: 'tab' | 'stage' | 'pip' | 'none'`, defaulting to `'tab'`.
- **Avatar** → `stage`. The avatar is modelled as a channel that **sinks** outbound video, which
  gives `GetSunkTracks()` its first implementer and consumer.
- **Camera / Screen Share** → `pip`.
- **Whiteboard / Remote Browser / Media** → `tab`, unchanged.

The overlay renders `stage` and `pip` channels through `mj-media-stage`.

---

## 5. UX

The realtime overlay keeps its structure (orb hero ↔ console chrome, channel strip, composer,
surface tabs, focus pill). All video renders through `ng-media`.

- **Stage.**
  - Audio-only: the orb, unchanged. It is projected into `mj-media-tile`'s placeholder slot, so
    one component owns both cases.
  - Avatar: video fills the hero frame. The audio-reactive ring stays around the frame and the
    state chip sits on the tile.
  - Console chrome: a compact avatar tile above the thread. With captions on in hero chrome,
    captions overlay the lower third.
  - **Stall fallback:** after about 1 s with no frame, the tile cross-fades to the orb.
  - **Disclosure:** a persistent "AI-generated video" badge (SynthID is invisible; our UI should
    not be). The name shown is the persona's.
- **Self-view.** Mirrored PiP, draggable, hideable. It shows an eye badge "Agent can see this"
  while frames flow to the model.
- **Share preview.** Unmirrored, labelled with the real surface ("Window: Q3 Plan – Sheets"),
  with **Stop** and **Change**. The browser's own "Stop sharing" bar ends it too, via `onended`.
- **Composer.**
  - **Camera**, **Share ▾** (*Entire screen · Window · Browser tab · This panel ▸* listing the open
    whiteboard, remote browser and artifact panes), and a device chevron.
  - An **"Agent sees ▾"** selector appears only with 2+ live video sources.
- **First camera use.** `mj-camera-check` shows a mirrored preview and a device pick before any
  frame reaches the model. This is the `RequiresConsent` moment.
- **Capability-driven only.** Controls appear from negotiated capability (inbound video, outbound
  video, or a resolvable renderer). No template ever tests a provider name.
- **Meeting room.** Migrating it onto `ng-media` gives it the same share picker ("this panel"
  included), self-view mirroring (missing today) and device menu. Behaviour is otherwise unchanged.

---

## 6. Avatar identity and catalogue

- **Recommended home:** the persona. `MJ: AI Personas` is already the agent's voice identity and
  carries `PreviewImageURL` / `PreviewVideoURL`. A vendor avatar id rides the same `MJ: AI Persona
  Vendors` mapping that vendor voice ids use.
  - The avatar picker **is** the persona picker, with thumbnails.
  - At runtime, the list is the union of metadata and the driver's `SupportedAvatars` fallback,
    mirroring `GetRealtimeModelVoices`.
  - **Check first:** can the persona-vendor mapping carry an avatar id without DDL? If not, that
    is one additive column and a migration (T-SQL only; PG is release toolchain).
- **Custom likeness** (Gemini's allowlisted reference-image avatars and other vendors' "digital
  twins"):
  - The tenant uploads the image to MJ Storage.
  - `RealtimeAvatarSettings.ReferenceImageFileID` points at it.
  - A driver without custom support ignores it and logs.
  - Governance (who may create a likeness, consent records) is **out of scope** here and must be
    designed before custom avatars are enabled for any tenant. Leave it behind a feature flag.

---

## 7. Metadata, cost, capability truth

- **AI Model / vendor rows** (declarative `metadata/`, `uuidgen` keys, no `sync` block, no
  Metadata_Sync SQL):
  - an inference-provider vendor row for Gemini Enterprise (Vertex);
  - an `AIModelVendor` row for `gemini-3.8-live` with `DriverClass: GeminiEnterpriseRealtime`;
  - `MJ: AI Model Modalities` **Video / Output** for that vendor pairing;
  - `AIModelCost` rows once V-5 is known.
- **One source of truth:** realtime reads model-modality rows first, then the profile table.
  This is what the profile header already claims ("metadata is the authority").
- **Resolution:** a co-agent with `video.enabled` (avatar) prefers a model/vendor with Video/Output.
  Otherwise it uses its configured renderer. Otherwise it degrades to audio and logs.
- **Usage:** `VideoOutSeconds` is attributed to the Enterprise model. Composed renderers are
  billed as their own model's usage line.
- **Credentials:** Enterprise uses the existing Vertex credential shape, stored through
  `@memberjunction/credentials`. Nothing sensitive goes in agent config.

---

## 8. Meetings (bridged path)

This is the minimum so an avatar agent appears in a LiveKit meeting:
1. **G2:** honour `kind` in `GeminiRealtimeSession.SendInput`.
2. **G12:** LiveKit native:
   - `publishVideo` via `@livekit/rtc-node` `VideoSource` / `LocalVideoTrack`, fed from
     `OnVideoFrame`, with MP4 decoding on the server (decoder choice in the task).
   - Subscribe to `KIND_VIDEO` for `video-in` / `screen-in`.
3. **Composed renderers** in meetings require `AudioIngress: 'server-pcm'`.

---

## 9. Build plan: workstreams, tasks, acceptance

Each task leaves the build and every existing test green. Workstreams A and B can run in parallel.
C depends on A. D depends on A+B. E depends on B+C.

### Workstream A: `media-core` + `ng-media` (the shared stack)

- **A1.** Scaffold `packages/MediaCore` (`@memberjunction/media-core`), with deps `@memberjunction/global` + `rxjs` only, vitest via `scripts/scaffold-tests.mjs`.
  - *Accept:* builds; an import-boundary test fails if Angular, `livekit-client` or `@memberjunction/ai*` is imported.
- **A2.** `model/` types (§3.1).
  - *Accept:* no `any`, TSDoc on every export.
- **A3.** `LocalMediaController` + `displayCapture` (surface hints, `selfBrowserSurface:'exclude'`, `surfaceSwitching`, element/region crop with fallback, `onended`, `devicechange`, hot device swap, consent gate).
  - *Accept:* unit tests with fake `mediaDevices`. Capture requests **native** frame rate. Element capture falls back with a reason when unsupported.
- **A4.** `FrameSampler` (caller-supplied rate, no ceiling).
  - *Accept:* at rate 1 it emits ≈1/s; at rate 5 it emits ≈5/s. Stop releases the timer and the offscreen video.
- **A5.** `AudioLevelMeter` (configurable bins), with golden tests from both current meters' outputs.
  - *Accept:* the 7- and 9-bin outputs match the old implementations within tolerance.
- **A6.** `VideoPlayout` + decoder registry (MSE fMP4; WebCodecs; image) + `IPlaybackClock` + `Flush()` + reconnect-safe last-frame hold.
  - *Accept:* unit tests with fake `MediaSource` / `VideoDecoder`. A manual test page plays a captured fMP4 fixture.
- **A7.** `MediaStage` + layout selectors (port `livekit-room-logic.ts`; add `stage+pip`).
  - *Accept:* the ported selector tests pass unchanged in meaning.
- **A8.** `AttachVideoSource`.
- **A9.** Scaffold `packages/Angular/Generic/media` (`@memberjunction/ng-media`) and build the §3.2 components.
  - *Accept:* DOM tests. `npm run check:ui` passes. No `livekit-client` / router / `@memberjunction/ai*` import. Dark mode verified.

### Workstream B: realtime contracts (no behaviour change)

- **B1.** §4.4 Core additions (`RealtimeVideoFrame`, `OnVideoFrame?`, `RealtimeAvatarSettings`, `VideoOutSeconds`, `Transport`/`RelayUrl`).
- **B2.** `BaseRealtimeAvatarRenderer` + `BaseRealtimeAvatarClient`.
- **B3.** `OnRemoteVideo(MediaVideoSource)` with the `MediaStream` overload; `AddTrack` / `RemoveTrack`.
- **B4.** Profile table keyed by `Endpoint`, with `SupportsAvatarOutput` / `AvatarOutputEncoding` / `AvatarAudioMuxed`.
- **B5.** Fix **G1**: MIME-routed `inlineData` in both Gemini parsers.
  - *Accept:* **write a failing test first**: a `video/mp4` part must never reach `RealtimePcmPlayback`.
- **B6.** Fix **G2**: `SendInput` honours `kind`.

### Workstream C: user video in (webcam + screen share), provable on today's Gemini 3.8 Live

- **C1.** `IRealtimeMediaHost.CreateLocalMediaController()`; the browser host returns the `media-core` one.
- **C2.** `RealtimeVideoSourceArbiter` as the single writer. Retarget `ChannelInboundVideoBridge` onto it. Delete the hardcoded 1 fps clamps (the rate comes from the negotiated descriptor). Send a context note on each switch.
- **C3.** Camera + Screen Share channel plugins (client + server halves), `metadata/` rows with `Placement:'pip'`, and prompt-only tools.
- **C4.** `RealtimeSessionRuntime` exposes a `MediaStage`. Starting capture calls `AddTrack` (§4.6 dormant-track rule).
- **C5.** Overlay: render the stage via `mj-media-stage`, and add self-view, share preview, the composer buttons (split Share), the "Agent sees" selector, and first-use `mj-camera-check`.
- *Accept (end to end, real Gemini 3.8 Live, Developer API):*
  - The user shares a **browser tab**; the agent describes it.
  - The user switches to the **camera**; the agent acknowledges the switch.
  - The self-view is mirrored and smooth (native fps) while the model receives ≤ the negotiated rate.
  - "This panel" crops to the whiteboard pane in Chromium.
  - Stopping from the browser bar ends the share cleanly.
  - A test asserts that starting capture **causes** a video track to be requested. This is the F8
    lesson: a hand-established fixture cannot catch a missing request.

### Workstream D: native avatar (Gemini Enterprise)

- **D0.** Resolve V-1…V-7 against the Enterprise "Configure live avatars" and "Send audio and video streams" pages, with a throwaway spike that logs a real avatar session's raw frames. Record the answers in this doc. **No D-task code merges before D0.**
- **D1.** `GeminiEnterpriseRealtime` (server, `AI/Providers/Vertex`) + `'gemini-enterprise'` client.
- **D2.** Auth: `direct` if V-4 allows it, otherwise the generic MJAPI relay (single-use ticket, pinned setup, byte relay, credentials from `@memberjunction/credentials`).
  - *Accept:* the browser never holds a Google credential. A tampered setup is rejected.
- **D3.** Avatar config mapping and locking; audio-only degrade on unsupported endpoints.
- **D4.** Video part → `VideoPlayout` → `emitRemoteVideo`. Honour `AvatarAudioMuxed` (never double-voice). Barge-in flushes video.
- **D5.** Avatar channel (`Placement:'stage'`, sinks outbound video), stall→orb fallback, AI-generated badge, persona-based avatar picker.
- **D6.** Resumption with the avatar live across ≥3 consecutive 2-minute boundaries, with no black flash.
- **D7.** Metadata rows (§7), `VideoOutSeconds` usage.
- *Accept:*
  - A 10-minute Enterprise avatar conversation with tools; lip-sync holds; barge-in stops the mouth within one frame of the audio.
  - Requesting an avatar on the Developer API mints audio-only with a logged reason and **no error**.

### Workstream E: composed avatar, the generality test

- **E1.** One WebRTC renderer (D4 in §11) on an **audio-only** model (OpenAI Realtime).
- *Accept:* **zero changes** to `ng-media`, the realtime overlay, or `RealtimeSessionRuntime`'s public
  surface. If any are needed, the abstraction is wrong. Fix the abstraction, not the UI.

### Workstream F: LiveKit migration + meetings

- **F1.** `ToMediaParticipant` adapter; the controller's screen share uses `media-core` `displayCapture` + `publishTrack`.
- **F2.** `ng-livekit-room` renders through `ng-media`. Delete the duplicated tile, meter, device-menu, prejoin and control-bar implementations and the `LiveKitMediaPreview` meter. Keep `ng-livekit-room`'s public inputs/outputs stable, or document the break in the changeset.
- **F3.** §8 bridge items.
- *Accept:* the existing livekit-room DOM and logic tests pass; the meeting room gains self-view mirroring and the share picker.

### Workstream G: close-out

- Changeset `minor`: new packages, metadata, and possibly a persona column.
- New package READMEs; this plan's VERIFY section closed.
- A section in `guides/REALTIME_CO_AGENTS_GUIDE.md` titled **"Adding a video provider"**, with a checklist: implement a server driver or renderer, a client driver, a profile or capability row, and metadata rows. That checklist is the definition of "any provider can plug in".
- Full unit tier + the deterministic integration tier (CLAUDE.md Definition of Done).

---

## 10. Risks

- **The MP4 details are unknown (V-2).** If it is not fragmented MP4, MSE can't play it
  incrementally. The WebCodecs path (demux with `mp4box.js`, decode with `VideoDecoder`) is the
  fallback, so the decoder registry is built as a registry from day one.
- **Enterprise auth (V-4).** The relay is more server work, but it is generic and reusable.
- **The 2-minute cap.** Everything rests on resumption. D6 is a gate, not a nicety.
- **Safari.** No Element Capture, and partial WebCodecs support. Feature-detect and degrade: the
  "This panel" option is hidden, and playout uses MSE.
- **Cost.** Avatar minutes plus video input are expensive. Controls are always explicit, capture
  never auto-starts, and usage is attributed per track.
- **Custom likeness is a legal and consent surface.** It stays feature-flagged until governed (§6).

---

## 11. Decisions requested

- **D1:** Avatar identity on `MJ: AI Personas` via the persona-vendor mapping (recommended), or a
  new entity?
- **D2:** Add channel `Placement` (recommended), or special-case the avatar in the overlay?
- **D3:** Package names: `@memberjunction/media-core` and `@memberjunction/ng-media` (recommended)?
- **D4:** First composed renderer for Workstream E: HeyGen Streaming, Tavus, or Simli?
- **D5:** If Enterprise has no ephemeral tokens, is the MJAPI relay acceptable for v1
  (recommended), or do we go straight to the LiveKit/WebRTC transport (§4.3)?

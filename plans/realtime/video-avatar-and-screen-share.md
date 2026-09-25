# Video avatar, webcam and screen share for the realtime co-agent

**Status:** PROPOSAL, not yet accepted.
**Branch:** `claude/video-avatar-channel-moifkb`
**Builds on:**
- [`media-tracks-and-modalities.md`](media-tracks-and-modalities.md). §8 step 6 is "first outbound non-audio track when an avatar provider lands". This document is that step.
- [`gemini-3-8-live.md`](gemini-3-8-live.md) Phase F (inbound video) and §9.2, which deferred outbound video.

**Trigger:** Gemini 3.8 Live with Live Avatar
([blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-live-with-live-avatar/),
[GA note](https://cloud.google.com/blog/products/ai-machine-learning/gemini-3-8-live-with-live-avatar-is-now-generally-available),
[dev guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-live),
[configure live avatars](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/configure-live-avatars)).

> **Sourcing rule, inherited from the Gemini 3.8 plan.** Everything below about Google's wire
> format comes from search-result summaries. The docs domains were blocked from the environment
> this was written in. Every such claim is marked **VERIFY** and must be read from the
> primary page before code depends on it (§9).

---

## 1. What we are adding

1. **An avatar**: the agent has a face. It is a talking-head video in sync with the agent's
   voice, and it replaces the orb when the agent's model (or a paired renderer) produces one.
2. **The user's webcam**, with a mirrored **self-view**, so the agent can see the user.
3. **Screen share**, with the user choosing what to share:
   - the entire screen
   - one window
   - a browser tab
   - one region of the current MJ page (e.g. a single panel)

The agent sees whichever source is active, and the user can see what they are sharing.

**The requirement that shapes the design:** this must work for **any** provider. Gemini is the
first. HeyGen Streaming, Tavus, Simli, D-ID, Anam, bitHuman, Runway and OpenAI's future video
are queued behind it. Gemini is one row in a table, never an `if`.

---

## 2. What already exists (verified in code, 2026-09-25)

The accepted architecture already anticipates all three features. Most of the contract is
declared. **Almost none of it is exercised.**

| Piece | Where | State |
|---|---|---|
| Track contract (`Modality`, `Direction`, `Encoding`, `Rate`, `RequiresConsent`, `UsageBasis`) | `AI/Core/src/generic/realtimeTracks.ts` | ✅ built, used for inbound video |
| Track negotiation (request ∩ support; audio pair as a floor) | `BaseRealtimeClient.negotiateTracks` | ✅ |
| `SupportedOutboundTracks` capability | `baseRealtime.ts:434` | declared; Gemini publishes audio only |
| `BaseRealtimeModel.SupportsVideo` | `baseRealtime.ts:184` | **no driver overrides it** |
| `IRealtimeSession.OnVideoOutput?(ArrayBuffer)` | `baseRealtime.ts:529` | **no implementer**; payload has no codec or timestamp |
| `BaseRealtimeClient.OnRemoteVideo(MediaStream)` / `emitRemoteVideo` | `baseRealtimeClient.ts:563/623` | **no driver emits; no UI subscribes** |
| Channel `GetSourcedTracks()` | channel bases | ✅ consumed since F8 (`a9fc0131`) |
| Channel `GetSunkTracks()` | `baseRealtimeChannelServer.ts:240` | **no implementer, no consumer** |
| `CreateCameraCapture` / `CreateScreenCapture` | `RealtimeClient/src/media/frameCapture.ts` | built; **no caller outside the package** |
| `Connect(config, mic, cameraStream?)` | `baseRealtimeClient.ts:363` | the runtime never passes a camera (`RealtimeSessionRuntime.ts:1025`) |
| `IRealtimeMediaHost` | `RealtimeRuntime/src/hosts/IRealtimeMediaHost.ts` | `AcquireMicrophone()` only |
| `RealtimeVideoConfig { enabled, provider, avatarId, providers }` | `realtime-coagent-config.ts:137` | parsed; **nothing reads it** |
| `MJ: AI Personas.PreviewVideoURL` | schema | exists; a natural home for avatar identity |
| Bridge `video-out` routing (`OnVideoOutput` → `SendMedia('video-out')`) | `ai-bridge-engine.ts:1001-1040` | wired; LiveKit native `publishVideo` is a **no-op** |
| Video `<video>` tile, mirrored self-preview, device menu, control bar | `Angular/Generic/livekit-room` | ✅ built, but LiveKit-typed (§6.4) |

So the plumbing is **mostly** in place, as expected. The first real video exposes these gaps:

### 2.1 Gaps found

- **G1. Every model-turn `inlineData` part is treated as audio.** `geminiRealtimeClient.ts`
  `handleModelAudio` enqueues each `part.inlineData.data` into PCM playback without checking
  `mimeType`. The server session's parser (`geminiRealtime.ts:1315`) has the same shape. The moment
  avatar video arrives on the same socket, it plays as loud noise. Parts must be routed by
  `mimeType` through a registry, not an `if`.
- **G2. The server session drops the media kind.** `GeminiRealtimeSession.SendInput(chunk)`
  ignores `kind`. A bridged meeting's `video-in` frames are sent to Gemini **as audio**.
- **G3. Two delivery shapes, one UI contract, and no adapter between them.**
  - WebRTC vendors (Tavus, HeyGen, Simli, Anam, LiveKit-hosted avatars) hand over a
    `MediaStream`.
  - WebSocket vendors (Gemini **VERIFY**) hand over encoded chunks or images.
  - The client exposes only `OnRemoteVideo(MediaStream)`, and the server only an untyped
    `ArrayBuffer`.
  - No path turns chunks into something a `<video>` can play, and nothing keeps video in sync
    with audio playback.
- **G4. Avatars are two topologies, and only one is modelled.**
  - **Native:** one model emits synchronized audio and video (Gemini Live Avatar).
  - **Composed:** the LLM's audio is piped into a separate renderer (HeyGen, Tavus, Simli,
    D-ID). This is the majority of the market today.
  - Core assumes a single `BaseRealtimeModel` produces everything.
- **G5. One inbound video track, many sources.** Negotiation dedupes by `Direction:Modality`, so
  camera, screen, whiteboard and remote browser all compete for a single `inbound:video`. Nothing
  decides which source the model sees, or tells the model which it is looking at.
- **G6. Tracks are fixed at `Connect`.** "Share my screen for a second" means adding a track
  mid-call. The accepted design calls for `AddTrack` / `RemoveTrack`, and nothing implements
  them.
- **G7. Self-view would run at 1 fps.**
  - `CreateCameraCapture` requests `frameRate: { max: 1 }` from `getUserMedia`
    (`frameCapture.ts:153`); `CreateScreenCapture` does the same (`:186`).
  - The pacing for the model is being applied at **capture** time, so any preview of that
    stream is a slideshow.
  - The 1 fps ceiling is also hardcoded three times (`frameCapture`, `channelVideoSource`, the
    Gemini driver), despite `MaxInboundVideoRate` saying consumers must not hardcode it.
- **G8. No screen-share surface options anywhere.** A repo-wide grep for `displaySurface`,
  `preferCurrentTab`, `selfBrowserSurface`, `surfaceSwitching` and Region/Element Capture finds
  nothing. The LiveKit room calls `setScreenShareEnabled(true)` with defaults.
- **G9. Two sources of truth for video capability.** `MJ: AI Model Modalities` has Video/Input
  rows for 3.8 Live that the realtime path never reads, and no Video/Output rows. The code profile
  table is what realtime actually uses.
- **G10. The UI is audio-first.**
  - The overlay hero is a CSS orb with no `<video>` slot anywhere in the realtime overlay.
  - Surface tabs know only `activity | channel`.
- **G11. Outbound video has no cost or usage accounting.** `VideoFrames` / `VideoSeconds` count
  inbound only. Avatar minutes are typically the **most** expensive line on a session.
- **G12. Meetings.** LiveKit native subscribes to audio only and `publishVideo` is a no-op, so an
  avatar agent in a meeting has no camera tile.

---

## 3. Design

The existing doctrine is: tracks are transport, channels are surfaces, generalize then map.
This design follows it and adds **one new abstraction (the avatar renderer)** and **one new
channel property (placement)**.

### 3.1 The avatar is an outbound `video` track, with two ways to produce it

```ts
// AI/Core, beside realtimeTracks.ts. Additive.
export type RealtimeAvatarTopology = 'native' | 'composed';
```

**Native.** The realtime model itself declares
`SupportedOutboundTracks: [{ Modality: 'video', Direction: 'outbound', Encoding, Rate }]` and emits
frames. Gemini 3.8 Live is this. It needs no extra vendor and gets lip-sync for free.

**Composed.** A new Core base class:

```ts
/** A vendor that turns the agent's AUDIO into a talking-head VIDEO. ClassFactory-keyed like every driver. */
export abstract class BaseRealtimeAvatarRenderer {
    /** Server side: mints the vendor session and returns a client config (the same private-pact shape as ClientRealtimeSessionConfig). */
    abstract CreateClientSession(params: RealtimeAvatarSessionParams): Promise<ClientAvatarSessionConfig>;
    /** Static catalogue fallback, like BaseRealtimeModel.SupportedVoices. Metadata is authoritative where seeded. */
    get SupportedAvatars(): RealtimeAvatarOption[];
    /** How audio reaches the renderer: 'client-stream' (browser forwards a MediaStream), 'server-pcm', or 'vendor-tts' (the renderer speaks the text itself). */
    abstract get AudioIngress(): 'client-stream' | 'server-pcm' | 'vendor-tts';
}
```

Plus a client mirror, `BaseRealtimeAvatarClient`, in `@memberjunction/ai-realtime-client`,
registered by the same key. Its job is to accept the voice model's output audio and expose
`OnRemoteVideo(MediaStream)`.

**Where the composition happens:** in `RealtimeSessionRuntime`, never in a driver.

- When the co-agent requests an avatar **and** the resolved model has no outbound video track,
  the runtime resolves an avatar renderer.
- It routes the voice model's output audio into the renderer (`GetRemoteMediaStream()`, or the
  PCM playback tap).
- It **mutes the voice model's direct playout**, because the renderer's stream now carries the
  audio and the video in sync.
- It surfaces the renderer's video as the session's outbound `video` track.

The UI cannot tell the two topologies apart. **This is also the upgrade path for every
audio-only model we have** (OpenAI Realtime, GPT-Live, xAI, ElevenLabs): any of them gets a face
by pairing it with a renderer. Nothing about those drivers changes.

**Barge-in rule, for both topologies.** An interruption must flush **video** as well as audio.
Otherwise the avatar keeps mouthing a sentence the user has already cut off.
- The native driver flushes its video playout alongside audio (driver obligation #3 extended to
  video).
- Composed renderers expose `Interrupt()`. The runtime calls it from the same `OnInterruption`
  path.

### 3.2 One UI contract for remote video: a `MediaStream`, always

`OnRemoteVideo(stream: MediaStream)` stays the **only** thing the UI ever sees.

Drivers that receive **chunks** convert them in the client library, not in Angular, through one
shared helper:

```ts
// RealtimeClient/src/media/videoPlayout.ts. Written ONCE, used by every chunk-delivering driver.
export interface EncodedVideoChunkIn {
    Data: ArrayBuffer | string;   // bytes or base64
    MimeType: string;             // 'video/h264', 'video/vp8', 'image/jpeg', 'video/mp4;codecs=...' (VERIFY which Gemini uses)
    TimestampMs?: number;         // presentation time relative to the turn's audio
    KeyFrame?: boolean;
    Width?: number; Height?: number;
}
export class RealtimeVideoPlayout {
    constructor(clock: IRealtimePlaybackClock);   // pcmPlayback's AudioContext clock: video follows audio, never the reverse
    Enqueue(chunk: EncodedVideoChunkIn): void;
    Flush(): void;                                 // barge-in
    readonly Stream: MediaStream;                  // what OnRemoteVideo emits
}
```

- **Decoding goes through a registry keyed by MIME type, not a switch:**
  - `image/*` → `ImageDecoder` / `createImageBitmap`
  - `video/h264|vp8|vp9|av1` → WebCodecs `VideoDecoder`
  - fragmented MP4 → MSE
  - A vendor with a new encoding adds a row.
- **Output** goes through `MediaStreamTrackGenerator` where available, otherwise
  `canvas.captureStream()`.
- **Sync:** frames are presented against `RealtimePcmPlayback`'s `AudioContext.currentTime`.
  `pcmPlayback` gains a small `IRealtimePlaybackClock` interface. If a provider sends no
  timestamps, frames are presented on arrival; the driver documents that.
- **Fixes G1:** the Gemini driver's part handler splits by `inlineData.mimeType` into audio
  playback vs `RealtimeVideoPlayout`, using the same registry.

**Server side (bridged path):** `OnVideoOutput` gains a typed sibling. This is additive, and the
untyped callback stays for back-compat:

```ts
OnVideoFrame?(handler: (frame: RealtimeVideoFrame) => void): void;
// RealtimeVideoFrame = EncodedVideoChunkIn's fields, in Core.
```

`BridgeMediaFrame` gains optional `MimeType` / `Width` / `Height` / `KeyFrame`, so bridges can
publish without guessing.

### 3.3 Avatar identity: generalize, then map

The rule is the `RealtimeTurnDetectionMode` pattern.

**Normalized setting.** It goes in `ModelConfiguration.Realtime` and in the co-agent's existing,
currently unread `RealtimeVideoConfig`:

```ts
export interface RealtimeAvatarSettings {
    Enabled: boolean;                 // absent ⇒ false. Structural, same as video-in: no request, no track.
    AvatarID?: string;                // vendor preset id (e.g. Gemini 'Ben', HeyGen avatar_id). Opaque.
    ReferenceImageFileID?: string;    // MJ Storage file for custom-likeness avatars (Gemini: enterprise allowlist, VERIFY)
    Renderer?: string;                // force a composed renderer by driver key; absent ⇒ native if supported, else the default renderer
    Resolution?: 'low' | 'standard' | 'high';
}
```

**Per-profile mapping.**
- `geminiLiveProfiles.ts` gains `SupportsAvatar`, `AvatarOutputEncoding` and `AvatarOutputRate`
  (24 fps per the blog, VERIFY).
- `GeminiRealtime.buildConnectConfig` maps `Enabled` to
  `responseModalities` += `VIDEO` (VERIFY whether that means `[AUDIO, VIDEO]` or `[VIDEO]` with
  audio implied), and `AvatarID` to the avatar config field (VERIFY the exact field name;
  summaries say `avatar_name`).
- Graceful degradation: a model with no mapping logs and falls back to audio. It never
  hard-errors the mint.

**Catalogue.**
- An avatar is the **visual half of a persona**. `MJ: AI Personas` is already the voice identity
  and already carries `PreviewImageURL` / `PreviewVideoURL`.
- **Proposal:** vendor avatar IDs ride the same `MJ: AI Persona Vendors` mapping that voice IDs
  use. The avatar picker is the persona picker with a thumbnail.
- There is one union at runtime (metadata ∪ `SupportedAvatars` fallback), exactly like
  `GetRealtimeModelVoices`.
- **Decision needed (D1):** confirm that persona is the right home, as opposed to a new
  `MJ: AI Avatars` entity. The persona route needs no migration, if the vendor-mapping fields
  can carry an avatar ID. That needs a check.

**Security.** The avatar ID and the reference image must be locked into the minted ephemeral
token's constraints, like the rest of the config. The browser must not be able to swap in a
different likeness. (VERIFY that the Live token constraint schema can carry it.)

### 3.4 Webcam and screen share are channels that source video

This is exactly the row in `media-tracks-and-modalities.md` §5. It adds two client channel
plugins, **Camera** and **Screen Share**, registered in `MJ: AI Agent Channels` (metadata rows,
no DDL). This means:

- They are enabled per agent like every other channel.
- They go through the existing `GetSourcedTracks()` → `requestedTracks` path (F8). No new request
  mechanism is needed.
- They get tools for free where useful, e.g. the agent's `Camera_RequestView` / `Screen_Request`
  ("can you show me your screen?"). Each renders a consent prompt; it never auto-starts capture.

**Capture moves behind the media host (G7).** `IRealtimeMediaHost` gains:

```ts
AcquireCamera(opts?: { DeviceId?: string }): Promise<MediaStream>;
AcquireDisplay(opts: RealtimeDisplayCaptureOptions): Promise<MediaStream>;
ListDevices(kind: 'audioinput' | 'videoinput' | 'audiooutput'): Promise<RealtimeDevice[]>;

export interface RealtimeDisplayCaptureOptions {
    Surface?: 'monitor' | 'window' | 'browser' | 'element';  // a HINT to the picker; the user still chooses
    ElementRef?: Element;          // 'element': Region/Element Capture of one MJ panel (feature-detected, Chromium-only)
    IncludeAudio?: boolean;        // tab/system audio. Deferred: inbound audio mixing is its own design
}
```

The browser host maps these options to `getDisplayMedia`:

- `displaySurface` becomes a hint to the browser's picker.
- The current MJ tab is excluded from the picker by default (`selfBrowserSurface: 'exclude'`),
  so the user can't share the call itself and create a hall of mirrors.
- `surfaceSwitching: 'include'` lets the user switch what they're sharing without stopping.
- `'element'` means "share just this panel":
  - Capture the tab (`preferCurrentTab`), then `track.cropTo(await CropTarget.fromElement(el))`,
    or `restrictTo` where Element Capture exists.
  - Feature-detect it and fall back to a whole-tab share with a notice.
- It listens for `track.onended`, which fires when the user clicks the browser's "Stop sharing"
  bar, and tears the channel down.

The widget and a future React Native host implement the same interface, so no Angular code
touches `navigator`.

**Capture at full rate; pace only the model feed.**
- The captured `MediaStream` runs at native frame rate and drives the **self-view** directly.
- A separate `CreateStreamFrameCapture` taps it at the **negotiated** `Rate` from the established
  track descriptor. This is the provider's ceiling, carried from the profile table
  (`MaxInboundVideoRate`).
- The three hardcoded `Math.min(..., 1)` clamps are deleted. The negotiated rate is the only
  authority, which the profile doc already promises.
- A future 5 fps model then works with no code change.

### 3.5 Deciding which source the model sees (G5)

The model gets **one** inbound video track. Pretending otherwise just alternates frames, and
the model can't tell them apart. So the client gets a small `RealtimeVideoSourceArbiter`, which
all four channels register with. It takes over `ChannelInboundVideoBridge`'s role as the single
writer to `SendVideoFrame`.

- **Policy:**
  1. An explicit user choice ("Agent sees: Screen ▾").
  2. Otherwise, the source most recently started.
  3. Otherwise, the focused surface tab (whiteboard or browser).
- The policy is a data array, so an agent can override it.
- **On every switch the arbiter sends a context note:** e.g. `[The user is now sharing their
  screen: "Quarterly plan – Google Sheets"]` or `[Now viewing the user's camera]`. That is the
  cheapest possible fix for "the model doesn't know what it's looking at". It uses
  `SendContextNote`, which exists on every driver.
- Compositing (screen plus a camera picture-in-picture into one frame) is a later policy option.
  It is not v1.

### 3.6 Mid-call add/remove (G6)

`BaseRealtimeClient` gains `AddTrack(desc)` / `RemoveTrack(desc)`. The default implementation
re-runs negotiation.

- **Drivers where the socket already accepts the modality** establish locally with no wire
  change. Gemini is one of these: video input is just `realtimeInput.video` frames, allowed by
  setup.
- **Drivers that need renegotiation** use their resumption path: Gemini's F7 handle, or
  OpenAI's reconnect machinery.
- **Cost trap:** on Gemini, whether *requesting* video or *sending* it collapses the session cap
  (audio 15 min → audio+video 2 min, per §4.3 of the 3.8 plan) decides whether we can pre-request
  a dormant video track at connect. **VERIFY.** If requesting alone collapses it, video is
  requested only when a camera/screen channel actually starts, and resumption carries it.

### 3.7 Channel placement: the one new channel property

Today every channel with a surface is a **tab**. An avatar is not a tab, and a self-view is not a
tab. `MJ: AI Agent Channels.UIConfig` (existing JSON, no DDL) gains:

```ts
Placement?: 'tab' | 'stage' | 'pip' | 'none';   // default 'tab'. Back-compatible
```

- **Avatar** → `stage`: it occupies the hero where the orb lives.
- **Camera / Screen Share** → `pip`: a floating self-view tile, plus a small screen preview.
- **Whiteboard / Remote Browser / Media** → `tab`, unchanged.

This is also where `GetSunkTracks()` finally gets a consumer. A channel that sinks outbound
`video` is bound to the session's remote-video stream, and placement decides where it renders.

---

## 4. UX

Grounded in the current overlay (`realtime-session-overlay`): orb hero ↔ console chrome, channel
strip, composer, surface tabs, focus pill.

### 4.1 Stage (the agent)

- **Audio-only:** unchanged. The orb.
- **Avatar:** a `<video>` fills `.hero__stage`, framed like the orb.
  - Audio-reactive rings stay around the frame, so "speaking" still reads at a glance.
  - Agent state (listening / thinking / speaking) is a chip on the tile.
- **Captions:** in console chrome the avatar shrinks to a compact tile above the thread. With
  captions on in hero chrome, captions overlay the lower third of the video.
- **Stall fallback:** if the video track stalls (no frame for more than 1 s), the tile
  cross-fades back to the orb. The call never looks frozen.
- **Focus-mode pill:** the avatar thumbnail replaces the mini orb.
- **Disclosure:** a small persistent "AI-generated video" label on the avatar tile. Gemini output
  carries SynthID; we should be at least as honest in the UI. The avatar's display name is the
  persona's.

### 4.2 Self-view and sharing (the user)

- **Camera:** a picture-in-picture tile in the stage corner. It is **mirrored** (`scaleX(-1)`,
  the same as the LiveKit prejoin), draggable to any corner, and has a hide-self-view toggle
  (persisted via `UserInfoEngine`, key `mj.realtimeVoice.selfView.v1`). An "Agent can see this"
  eye badge shows whenever frames are going to the model.
- **Screen:** a small **unmirrored** preview tile with the shared surface's label, and
  **Stop sharing** / **Switch source** buttons. The browser's own sharing bar still works, via
  `onended`.
- **Composer:** gains `Camera` and `Share` buttons next to mute.
  - `Share` is a split button: *Entire screen · A window · A browser tab · This panel ▸*
    (lists the open MJ surfaces).
  - A device chevron opens the device menu (camera / mic / speaker).
- **"Agent sees" selector:** appears only when two or more video sources are live. It is the
  arbiter's explicit choice.
- **Pre-flight:** the first time a user starts the camera, a compact camera check (the prejoin
  preview, extracted) shows the mirrored preview and the device choice before anything reaches
  the model. That is the consent moment for `RequiresConsent`.

### 4.3 Capability-driven, never provider-driven

Every control appears **only** when the negotiated capability exists:
- `Camera` / `Share` require the model to support inbound video.
- The avatar requires the model to have an outbound video track, or a renderer to be resolved.

A provider that supports neither gets exactly today's UI. No template tests a provider name.

---

## 5. Meetings (bridged path): follow-up, not v1

The engine already routes `OnVideoOutput` to `SendMedia('video-out')`. Remaining work:

1. **G2:** honour `kind` in `GeminiRealtimeSession.SendInput`.
2. **G12:** implement `publishVideo` in LiveKit native with `@livekit/rtc-node`
   `VideoSource` / `LocalVideoTrack`, fed from `OnVideoFrame`, and subscribe to `KIND_VIDEO` for
   `video-in` / `screen-in`.
3. Composed avatars in meetings need `AudioIngress: 'server-pcm'`, so the renderer is fed on the
   server.

The result: an avatar agent shows up in a meeting grid as a camera tile, just as it does 1:1.

---

## 6. Shared UI: extract from the LiveKit room rather than build twice

The LiveKit meeting room (`@memberjunction/ng-livekit-room` over
`@memberjunction/livekit-room-core`) already has most of these tiles. It is typed against
`livekit-client` in only a few places.

### 6.1 New L1 package: `@memberjunction/ng-media-tiles` (Angular/Generic, no router)

| Component | From | Change |
|---|---|---|
| `mj-video-tile` | `livekit-participant-tile` | input becomes `Stream: MediaStream` + `Mirror`, `Label`, `Speaking`, `FallbackImageUrl`, `Placeholder` (orb slot); `el.srcObject = stream`, not `track.attach` |
| `mj-media-device-menu` | `livekit-device-menu` | rename only; it is already pure |
| `mj-media-controls` | `livekit-control-bar` | rename; screen share becomes a split button with surface choices |
| `mj-agent-state` | `livekit-agent-state` | rename only |
| `mj-camera-check` | `livekit-prejoin` | replace `LiveKitMediaPreview` with the media host's `AcquireCamera`; keep the `scaleX(-1)` self-view |
| `mj-audio-meter` | `livekit-audio-meter` | input becomes a level provider `() => number` instead of `Participant.Raw.audioLevel` |
| `mj-connection-overlay` | `livekit-connection-overlay` | rename only |

### 6.2 Consolidation

There are two audio-meter implementations today:
- `RealtimeClient/audio/audioMeter.ts`: 9 bins
- `LiveKitRoomCore/audio-meter.ts` plus `livekit-preview.ts`: 7 bins

Keep one framework-agnostic meter. Have `livekit-room` depend on the new package and delete its
copies. Do this **after** the realtime work lands (Phase V6), so the meeting room is not
destabilized mid-feature.

### 6.3 What stays LiveKit-only

`LiveKitRoomController`, `livekit-effects.ts` (Krisp, background blur), and the SDK attach/detach
path. Background blur is worth exposing through `mj-camera-check` later. It already exists for
LiveKit and runs on any `MediaStreamTrack` via `@livekit/track-processors`.

---

## 7. Cost, usage, capability truth

- **G11:** `RealtimeUsageModalityDetail` gains `VideoOutSeconds`, and `UsageBasis` includes
  `'seconds'` on the outbound video descriptor. Composed renderers report their own minutes as a
  separate usage line against the renderer's AI Model row, because they are a separate vendor
  bill. Add `AIModelCost` rows for Gemini avatar output once pricing is verified.
- **G9:**
  - Add `Video / Output` rows in `MJ: AI Model Modalities` for 3.8 Live (declarative metadata).
  - Have `GetSupportedTracks` consult the modality rows first and the code profile second.
    This is "metadata is authority, profile is fallback", which the profile header already
    claims.
  - Co-agent model resolution with `video.enabled` prefers models with an outbound video row.
    Otherwise it picks the configured renderer. Otherwise it degrades to audio and logs.

---

## 8. Phased build list (each phase shippable, each behind capability)

**V0: Truth before code.**
- Resolve every VERIFY in §9 from Google's primary pages.
- Add a failing test for G1 (a `video/*` inline part must not reach `pcmPlayback`).

**V1: Contracts (no behaviour change).**
- `RealtimeVideoFrame`, `OnVideoFrame?`, `RealtimeAvatarSettings`, `BaseRealtimeAvatarRenderer` +
  client mirror.
- `IRealtimePlaybackClock`, `AddTrack` / `RemoveTrack`, `Placement`.
- `IRealtimeMediaHost.AcquireCamera` / `AcquireDisplay` / `ListDevices`.

**V2: User video in.**
- Media host implementations; Camera and Screen Share channel plugins and metadata rows.
- Full-rate capture with a paced model tap; delete the hardcoded clamps.
- `RealtimeVideoSourceArbiter` with context notes.
- `ng-media-tiles` (tile, camera check, device menu); self-view PiP and screen preview; composer
  buttons.
- **Proof point:** Gemini 3.8 Live, the user shares a browser tab and the agent comments on it,
  then switches to the camera and the agent says so.

**V3: Native avatar (Gemini).**
- Fix G1 (MIME-routed parts); build `RealtimeVideoPlayout` with the decoder registry and audio
  clock.
- Profile rows and config mapping; lock the avatar in the token constraints.
- Stage placement and orb fallback; barge-in flushes video.
- Avatar picker via personas.

**V4: Composed avatar (second provider, the generality test).**
- One WebRTC renderer, e.g. HeyGen Streaming or Tavus, fed by an **audio-only** model (OpenAI
  Realtime).
- **If V4 needs a change to the Angular overlay, V1 was wrong. That is the honesty test,
  mirroring B2 in the Gemini plan.**

**V5: Metadata and cost.**
- Modality rows, `AIModelCost` rows, `VideoOutSeconds`, co-agent resolution honouring
  `video.enabled`.
- Changeset `minor`.

**V6: Consolidation and meetings.**
- Migrate `livekit-room` onto `ng-media-tiles`; single audio meter.
- §5 bridge items.

**Tests per phase:**
- V1–V2: unit tests with fakes. Extend the `FakeLiveSession` in the Gemini tests with video
  parts.
- V3: an end-to-end assertion that *requesting an avatar causes an outbound video track to be
  negotiated and a stream to be emitted*. This is the lesson of F8: a fixture that
  hand-establishes the track cannot catch a missing request side.

---

## 9. VERIFY: must be read from Google's primary docs before V3

1. **Endpoint availability.** Is Live Avatar on the **Gemini API** (our driver: `@google/genai`,
   ephemeral `authTokens` v1alpha) or only **Vertex / Gemini Enterprise Agent Platform**? The GA
   announcement is Google Cloud, with US/EU endpoints. If it is Vertex-only, V3 first needs a
   Vertex auth path for client-direct sessions.
2. The exact setup fields for avatar selection (reported: `avatar_name`) and custom
   reference-image avatars (enterprise allowlist).
3. `responseModalities` semantics: is `VIDEO` alone enough (audio implied), or do we send
   `[AUDIO, VIDEO]`? Are output transcriptions still emitted?
4. Video output wire format:
   - part MIME type, codec or container
   - per-frame images vs encoded stream
   - resolution
   - 24 fps as stated
   - timestamps / audio sync mechanism
   - chunking
5. Session caps with an avatar, and whether *requesting* vs *sending* video changes the cap (§3.6).
6. Whether ephemeral-token `liveConnectConstraints` can lock the avatar config.
7. Pricing for avatar output.
8. Whether barge-in / `interrupted` also truncates video server-side.
9. Model ID(s): the same `gemini-3.8-live`, or an avatar-specific variant.

---

## 10. Decisions requested

- **D1:** Is avatar identity stored on `MJ: AI Personas` (recommended), or in a new entity?
- **D2:** Add the `Placement` channel property (recommended), or special-case the avatar in the
  overlay?
- **D3:** Is `ng-media-tiles` a new Generic package now (recommended), or do we fork the tiles
  into conversations and consolidate later?
- **D4:** Which composed renderer is first for V4: HeyGen (existing vendor relationship via the
  batch provider), Tavus, or Simli?

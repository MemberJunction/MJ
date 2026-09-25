# Video in realtime: agent avatars, webcam self-view, screen share, and a shared media stack

**Status:** BUILD PLAN. Revised 2026-09-25 against Google's published pages (§0) and Amith's
decisions (§11). Ready to hand to a developer.
**Branch / PR:** `claude/video-avatar-channel-moifkb` · #4761

**Builds on:**
- [`media-tracks-and-modalities.md`](media-tracks-and-modalities.md) §8 step 6: "first outbound non-audio
  track when an avatar provider lands". This plan is that step.
- [`gemini-3-8-live.md`](gemini-3-8-live.md) Phase F (inbound video, shipped) and §9.2 (outbound
  video, deferred until now).

**House pattern:**
- A framework-agnostic engine plus a thin Angular package, as with
  `conversations-runtime` / `ng-conversations`.
- [`UI_LAYERING_GUIDE.md`](../../guides/UI_LAYERING_GUIDE.md): L0 → L3.
- **Extend existing packages before creating new ones** (§3).

---

## 0. What Google's documentation says

Read from the published pages supplied 2026-09-25: the "Gemini 3.8 Live" and "Gemini 3.8 Live
Extended Thinking" model pages, the "Live API capabilities guide", the Enterprise "Gemini Live API
overview", and the "Introducing Gemini 3.8 Live with Live Avatar" blog. Anything those pages don't
settle is marked **VERIFY**.

| Fact | Source | Consequence |
|---|---|---|
| Live Avatar is **"available in Gemini Enterprise"** only | blog | Avatar = the **Gemini Enterprise Agent Platform (Vertex)** endpoint, not the Developer API our current driver uses |
| On the Developer API, `gemini-3.8-live` output is **"Text and audio"**; "Audio is the supported response modality" | "Gemini 3.8 Live" | Requesting an avatar there must **degrade to audio**, never error |
| Enterprise output modalities: **"Video (live avatars): Video (mp4)"** | Enterprise overview, technical specifications | Avatar frames arrive as **MP4 on the same WSS socket**. The browser needs an MP4 playout path (MSE), not a peer-connection `MediaStream` |
| Protocol: **"Stateful WebSocket connection (WSS)"** | same | Same socket shape as the current Gemini driver |
| Enterprise models: **`gemini-3.8-live`** ("Live avatar" listed as a feature) and `gemini-live-2.5-flash-native-audio` (no avatar) | same | Avatar capability is **per (endpoint, model)**, not per model id |
| Input: PCM16 16 kHz, **"JPEG 1FPS"** images/video, text | Enterprise overview; capabilities guide "max 1 frame per second" | Unchanged from Phase F |
| **"Audio-only sessions are limited to 15 minutes, and audio plus video sessions are limited to 2 minutes"**, extendable via session management | capabilities guide | An avatar session is audio+video, so session resumption is **mandatory** |
| Turn coverage defaults to `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO`: "only send frames when needed" | 3.8 Live page | Keeps "video off unless requested" |
| Preset avatar library; **custom avatars from a reference image via enterprise allowlisting** | blog | Presets in v1; custom likeness is feature-flagged |
| Audio **and video** output are watermarked with **SynthID** | blog | Show an "AI-generated" disclosure in the UI |
| **"The Live API only provides server-to-server authentication by default"**; client-to-server uses ephemeral tokens | capabilities guide | Documented for the Developer API. **VERIFY** for Enterprise, and explore the options (§4.3) |
| Partner integrations **Daily, LiveKit, Twilio, Voximplant** run Gemini Live **over WebRTC**; a **LiveKit + ADK reference architecture** exists | Enterprise overview | A real candidate transport for Enterprise (§4.3, option C) |

**VERIFY items, resolved by task D0** (the "Configure live avatars" and "Send audio and video
streams" pages were not in the set):

| # | Question |
|---|---|
| V-1 | Setup field names for choosing an avatar; the preset catalogue |
| V-2 | Is the MP4 fragmented? What codec string? **Does it carry the audio track?** If yes, do not also play the PCM, or the voice doubles |
| V-3 | How audio and video are synced; timestamps |
| V-4 | Enterprise browser authentication |
| V-5 | Avatar pricing |
| V-6 | Does `interrupted` truncate video on the server? |
| V-7 | Regional endpoints (the GA note says US and EU) |

---

## 1. Goals and non-goals

**Goals**
1. **Agent avatar.** A talking-head video in sync with the agent's voice. It replaces the orb when
   the agent's realtime model produces video, and falls back to the orb otherwise.
2. **User webcam**, with a mirrored self-view.
3. **Screen share.** The user chooses: entire screen, a window, a browser tab, or **one panel of the
   current MJ page**. The user sees what they share.
4. **One media stack.** The same non-UI media code and the same Angular widgets serve the realtime
   co-agent, the LiveKit meeting room, and any Angular app. The LiveKit room migrates onto them.
5. **Any realtime model with video output plugs in.** Gemini 3.8 Live on Enterprise is first.
   Every later realtime model with native video output is a driver plus metadata rows, with no UI
   or runtime changes.
6. **User-arrangeable layout.** Every video and channel surface can be moved (stage / PiP / tab),
   and the choice is remembered per user.

**Non-goals (by decision, §11)**
- **Composed avatars**, i.e. a separate vendor animating a voice model's audio. The latency is
  expected to be poor. MJ aligns with realtime model stacks that output video natively. The design
  does not prevent a composed renderer later (it would just be another source of an outbound
  `video` track), but no abstraction for it is built now.
- Compositing avatar video into session recordings.
- Tab/system audio as model input.
- Multi-avatar meeting grids beyond the minimum in §8.

---

## 2. What exists today (verified in code)

| Piece | Where | State |
|---|---|---|
| Track contract + negotiation (audio pair as a floor) | `AI/Core/src/generic/realtimeTracks.ts`, `BaseRealtimeClient.negotiateTracks` | ✅ used by inbound video |
| `SupportedOutboundTracks` capability | `baseRealtime.ts:434` | declared; Gemini publishes audio only |
| `BaseRealtimeModel.SupportsVideo` | `baseRealtime.ts:184` | no driver overrides it |
| `IRealtimeSession.OnVideoOutput?(ArrayBuffer)` | `baseRealtime.ts:529` | no implementer; no codec or timestamp |
| `BaseRealtimeClient.OnRemoteVideo(MediaStream)` | `baseRealtimeClient.ts:563` | no driver emits; no UI subscribes |
| Channel `GetSourcedTracks()` | channel bases | ✅ consumed (F8) |
| Channel `GetSunkTracks()` | `baseRealtimeChannelServer.ts:240` | no implementer, no consumer |
| Browser media code: `audio/{micCapture,pcmPlayback,audioMeter,pcmUtils}`, `media/{frameCapture,channelVideoSource}` | `@memberjunction/ai-realtime-client` | ✅ built. Camera/screen capture has **no caller** outside the package |
| `Connect(config, mic, cameraStream?)` | `baseRealtimeClient.ts:363` | the runtime never passes a camera (`RealtimeSessionRuntime.ts:1025`) |
| `IRealtimeMediaHost` | `@memberjunction/realtime-runtime` `hosts/` | `AcquireMicrophone()` only |
| `RealtimeVideoConfig { enabled, provider, avatarId, providers }` | `AI/Agents/src/realtime/realtime-coagent-config.ts:137` | parsed; nothing reads it |
| **`MJ: AI Persona Vendors`** (`PersonaID`, `VendorID`, **`ModalityID`**, **`APIName`** = "API Asset Name", `Status`, `Priority`, **`VendorSettings`** typed as `IAIPersonaVendorSettings`) | schema + `metadata/entities/JSONType-interfaces/` | ✅ today every row is `Modality=Audio` (voices). **A `Modality=Video` row is an avatar, with no DDL** |
| `MJ: AI Personas` (`StyleDescriptors` → `IAIPersonaStyleDescriptors`, `PreviewImageURL`, `PreviewVideoURL`) and `MJ: AI Agent Personas.StyleOverride` → `IAIAgentPersonaStyleOverride` | same | ✅ typed JSON extension points already exist |
| `MJ: AI Modalities` has **Video** | `metadata/ai-modalities` | ✅ |
| Vertex credentials + client (`VertexAICredentials`: project, location, service account / ADC) | `AI/Providers/Vertex/src/models/vertexLLM.ts` | ✅ reusable for the Enterprise driver |
| LiveKit room: framework-agnostic core + Angular UI (tile, prejoin, device menu, control bar, meter, agent state, connection overlay) | `packages/LiveKitRoomCore`, `Angular/Generic/livekit-room`, `Angular/Generic/mj-livekit-room` | ✅ built; LiveKit-typed only at a few seams |
| Bridge `video-out` routing | `ai-bridge-engine.ts:1001-1040` | wired; LiveKit native `publishVideo` is a no-op |

### 2.1 Gaps (each maps to a task in §9)

- **G1. Every `inlineData` part is treated as audio.** `geminiRealtimeClient.ts` `handleModelAudio`
  and `geminiRealtime.ts:1315` enqueue every `part.inlineData.data` as PCM, with no `mimeType`
  check. MP4 avatar data would be played as noise.
- **G2. Server `SendInput` ignores `kind`.** Bridged `video-in` is sent to Gemini as audio.
- **G3. No playout path for encoded video.** Nothing plays MP4 chunks, and nothing syncs them with
  audio.
- **G4. One inbound video track, many sources.** Camera, screen, whiteboard and remote browser
  compete. Nothing arbitrates, and the model isn't told what it's looking at.
- **G5. Tracks are fixed at `Connect`.** There is no mid-call `AddTrack` / `RemoveTrack`.
- **G6. Capture is throttled at the source** (`frameRate: {max:1}` in `frameCapture.ts:153`, `:186`),
  so a self-view would be a slideshow. The 1 fps ceiling is hardcoded three times, contradicting
  `MaxInboundVideoRate`.
- **G7. No screen-share surface options anywhere.** No `displaySurface`, `selfBrowserSurface`,
  `surfaceSwitching`, `preferCurrentTab`, element/region capture or `onended` handling.
- **G8. Capability is keyed on model id alone** (`geminiLiveProfiles.ts`), but the same model differs
  by endpoint. `MJ: AI Model Modalities` rows are never read by realtime.
- **G9. The UI is audio-first.** No `<video>` in the realtime overlay. Surface placement is
  fixed: tabs only, and not user-movable.
- **G10. Outbound video has no usage accounting.**
- **G11. Meetings.** LiveKit native subscribes to audio only; `publishVideo` is a no-op.
- **G12. Duplicated media code.** There are two audio meters (9 bins / 7 bins) and two device
  enumerations, and the capture code sits where LiveKit can't reuse it.
- **G13. No Enterprise realtime driver and no decided browser-auth path** (V-4).

---

## 3. Package architecture: extend what exists, add one Angular package

MJ already has the non-UI realtime media home: `@memberjunction/ai-realtime-client`, with
`src/audio/*` and `src/media/*`. We **extend it** rather than create a new core package.
`realtime-runtime` stays the session/composition layer. The only new package is Angular,
because no framework-neutral Angular realtime/media package exists:
- `ng-livekit-room` is bound to `livekit-client`;
- the realtime overlay lives inside the heavy `ng-conversations`, which the LiveKit room must not
  depend on.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ @memberjunction/ai-realtime-client                     (EXISTING, extended)      │
│   "@memberjunction/ai-realtime-client/media"  ← NEW subpath export               │
│     src/media/*  + src/audio/audioMeter  : pure TS, browser APIs, rxjs           │
│     imports NOTHING from drivers/ or @google/genai (enforced by a test)          │
│   "@memberjunction/ai-realtime-client"         ← main entry (drivers), as today  │
└──────────────────────────────────────────────────────────────────────────────────┘
        ▲ /media subpath only              ▲ main + /media               ▲ /media
┌───────┴──────────────┐   ┌───────────────┴─────────────┐   ┌───────────┴───────────────────┐
│ livekit-room-core    │   │ realtime-runtime (EXISTING) │   │ ng-realtime-media (NEW)       │
│ (EXISTING) adapter   │   │ session → MediaStage,       │   │ packages/Angular/Generic/     │
│ LiveKit → generic    │   │ arbiter wiring, host API    │   │   realtime-media              │
└───────┬──────────────┘   └───────────────┬─────────────┘   └───────────┬───────────────────┘
┌───────┴──────────────┐   ┌───────────────┴─────────────────┐           │
│ ng-livekit-room      │──▶│ ng-conversations realtime overlay│◀─────────┘
│ (EXISTING) migrated  │   │ (EXISTING) renders via           │
│ onto ng-realtime-    │   │ ng-realtime-media                │
│ media                │   └──────────────────────────────────┘
└──────────────────────┘
```

**Why a subpath, not a new package.**
- The media code is already in `ai-realtime-client`, and it is where drivers need it.
- A `./media` entry in `package.json` `exports` (the same subpath pattern as the
  [Lazy Loading Guide](../../guides/LAZY_LOADING_GUIDE.md)) lets `livekit-room-core` import
  capture/playout/meter/layout code **without pulling any AI driver or `@google/genai` into its
  bundle**.
- A boundary test fails the build if anything under `src/media` or `src/audio/audioMeter.ts`
  imports from `drivers/`, `generic/`, `@google/genai`, or Angular.
- `livekit-room-core` gains a dependency on `@memberjunction/ai-realtime-client`. That is
  acceptable: the package's own core dependencies are `@memberjunction/ai` + `global` (pure TS);
  `@google/genai` is only installed, never bundled, through the subpath.
- **Fallback, if review rejects that dependency direction:** lift `src/media` into its own package
  later. The subpath boundary makes that a mechanical move, not a redesign.

Hard rules (checked in review):
1. `/media` imports no Angular, no `livekit-client`, no `drivers/`, no `@google/genai`.
2. `ng-realtime-media` imports no `livekit-client`, no router, and from `ai-realtime-client` **only**
   the `/media` subpath.
3. No re-exports between packages (MJ rule 5).
4. Vendor SDKs stay in vendor packages.

### 3.1 `ai-realtime-client/media`: what gets added or absorbed

| Module | Contents | Absorbs / replaces |
|---|---|---|
| `media/model.ts` | Types: `MediaParticipant`, `MediaVideoSource`, `MediaSourceKind`, `MediaDevice`, `LocalMediaState`, `MediaConnectionStatus`, `MediaAgentState`, `MediaPlacement` | the generic half of `LiveKitParticipantView`, `LiveKitDevice`, `LiveKitLocalMediaState` |
| `media/localMediaController.ts` | Acquire/release **mic, camera, display**. Device list + `devicechange`. Hot device switch. Consent gate. Track `onended` → state. `State$` | `frameCapture.ts` `CreateCameraCapture`/`CreateScreenCapture`, `livekit-preview.ts`, prejoin enumeration |
| `media/displayCapture.ts` | `DisplayCaptureOptions` → `getDisplayMedia` with a `displaySurface` hint, `selfBrowserSurface:'exclude'`, `surfaceSwitching:'include'`, `preferCurrentTab`, `monitorTypeSurfaces`. **Element/region capture** of one DOM element (`CropTarget`/`cropTo`, `RestrictionTarget`/`restrictTo`; feature-detected, falling back to a whole tab with a reason). Reports the actual `getSettings().displaySurface` + a label | new (G7) |
| `media/frameSampler.ts` | Taps any `MediaStream` at a **caller-supplied** rate and returns base64 JPEG/PNG. No built-in ceiling | `CreateStreamFrameCapture` (G6) |
| `audio/audioMeter.ts` | One meter, bin count a parameter; pure smoothing function | `LiveKitAudioMeter` + `livekit-preview` analyser (G12) |
| `media/videoPlayout.ts` | Plays **encoded** video into an element. Decoder registry keyed by MIME type: **MSE for fragmented MP4 (Gemini Enterprise, V-2)**, WebCodecs `VideoDecoder` (+ `mp4box.js` demux if the MP4 is not fragmented), `ImageDecoder`/`createImageBitmap` for image frames. `Flush()` for barge-in; last-frame hold across reconnect; optional `IPlaybackClock` (implemented by `RealtimePcmPlayback`) | new (G3) |
| `media/mediaStage.ts` | Headless layout model: participants + placements in, tiles out (stage, PiP, grid, filmstrip, screen-share focus). Pin, active speaker, hidden self-view. **User placement overrides** (§4.7) are an input | `livekit-room-logic.ts` selectors, generalized |
| `media/attachVideoSource.ts` | Puts any `MediaVideoSource` into a `<video>` and returns detach | replaces `track.attach(el)` in UI code |
| `media/videoSourceArbiter.ts` | Picks which source the **model** sees; single writer to `SendVideoFrame`; context note on switch (§4.5). Depends only on a narrow `IVideoFrameSink` interface that `BaseRealtimeClient` satisfies, so it has no import of `generic/` | `ChannelInboundVideoBridge`'s write path |

**The key abstraction: `MediaVideoSource`.** WebRTC, MSE and anything later look the same to
every renderer:

```ts
export type MediaVideoSource =
    | { Kind: 'stream'; Stream: MediaStream }                          // getUserMedia, getDisplayMedia, WebRTC (LiveKit, future WebRTC-native models)
    | { Kind: 'element'; Attach(el: HTMLVideoElement): () => void };   // MSE / WebCodecs playout that must own the element (Gemini Enterprise MP4)

export type MediaSourceKind = 'camera' | 'screen' | 'avatar' | 'surface' | (string & {});  // open vocabulary

export interface MediaParticipant {
    Identity: string;
    DisplayName: string;
    Role: 'self' | 'agent' | 'host' | 'participant';
    IsSpeaking: boolean;
    AudioLevel: number;                                           // 0..1
    Video: Partial<Record<MediaSourceKind, MediaVideoSource>>;
    PreferredVideo?: MediaSourceKind;
    Mirror?: boolean;                                             // local camera only
    Placeholder?: { ImageUrl?: string; Initials?: string; Visual?: 'orb' | 'image' };
    ConnectionQuality?: 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';
    Badges?: readonly MediaBadge[];                               // { Kind:'ai-generated' }, { Kind:'agent-can-see' }
}
```

Existing `frameCapture.ts` and `channelVideoSource.ts` exports keep working: they become thin
wrappers that **call** the new modules and are marked `@deprecated`. They are removed in the next
major.

### 3.2 `@memberjunction/ng-realtime-media` (new, `packages/Angular/Generic/realtime-media`)

Standalone, OnPush, `inject()`, `@if`/`@for`, PascalCase I/O, `--mj-*` tokens (`check:ui` gate),
`mjButton`, no router. Components render `/media` models and emit intent. None acquires media or
talks to a vendor.

| Component | Layer | Moved from | Notes |
|---|---|---|---|
| `mj-media-tile` | L1 | `livekit-participant-tile` | `Participant`, `Source?`, `ShowMeter`, `ShowName`, `ShowBadges`, `Pinnable`. Renders via `AttachVideoSource`. `[placeholder]` content slot (the realtime overlay projects its **orb**) |
| `mj-media-stage` | L2 | `livekit-room` layout | Renders a `MediaStage`. **Draggable, resizable PiP. Every tile has a "Move to…" menu (Stage / Picture-in-picture / Tab / Hide)**, emitting `PlacementChanged` (§4.7) |
| `mj-self-view` | L1 | new | Mirrored local camera + "Agent can see this" badge + hide |
| `mj-share-preview` | L1 | new | Unmirrored preview + label + **Stop** / **Change** |
| `mj-media-controls` | L1 | `livekit-control-bar` | Mic / camera / share. **Share is a split button:** *Entire screen · Window · Browser tab · This panel ▸* (host supplies panel targets) |
| `mj-media-device-menu` | L1 | `livekit-device-menu` | already presentational; renamed |
| `mj-camera-check` | L2 | `livekit-prejoin` | Mirrored preview (`scaleX(-1)` kept), device pick, mic meter; consent moment |
| `mj-audio-meter` | L1 | `livekit-audio-meter` | Input is a level provider `() => number` |
| `mj-agent-state` | L1 | `livekit-agent-state` | renamed |
| `mj-connection-overlay` | L1 | `livekit-connection-overlay` | renamed |

These components are **moved, not copied**. `ng-livekit-room` then imports them, so there is one
implementation.

### 3.3 Adapters (the only code that knows both sides)

- **`livekit-room-core`:**
  - `ToMediaParticipant(view)` maps a LiveKit participant to the generic model (remote track →
    `{Kind:'stream', Stream:new MediaStream([track.mediaStreamTrack])}`).
  - Screen share acquires through `/media` `displayCapture` and publishes with
    `publishTrack(track, { source: Track.Source.ScreenShare })`, so the meeting room gets the same
    picker ("This panel" included).
  - `livekit-effects.ts` stays LiveKit-only.
- **`realtime-runtime`:**
  - `RealtimeSessionRuntime` exposes a `MediaStage`: the **agent** participant (`Video.avatar` from
    the client's remote video; absent means the orb placeholder) plus **self** (`camera` / `screen`
    from `LocalMediaController`).
  - `IRealtimeMediaHost` gains `CreateLocalMediaController()`. The browser host returns the
    `/media` one; the web widget and React Native hosts supply their own.
- **`ai-realtime-client` drivers:** use `VideoPlayout`, `FrameSampler` and the meter from `/media`.

---

## 4. Realtime provider contract for video output

### 4.1 One topology: the realtime model outputs video natively

A video-capable realtime model declares
`SupportedOutboundTracks: [{ Modality:'video', Direction:'outbound', Encoding:<mime>, UsageBasis:['seconds'] }]`
and emits video. The client driver turns it into a `MediaVideoSource`:
- WebSocket-framed providers (Gemini Enterprise: MP4) use `VideoPlayout` and get
  `{Kind:'element'}`.
- WebRTC providers get `{Kind:'stream'}`.

The driver then calls `emitRemoteVideo(source)`. Nothing above the driver knows which one it was.

**Barge-in:** `OnInterruption` must flush video too (`VideoPlayout.Flush()`, or the provider's own
truncation, V-6), so the avatar stops mouthing a cut-off sentence. This extends driver obligation
#3 to video.

**Plug-in contract for any future video model**, which the "Adding a video provider" guide section
(task G1) turns into a checklist:
1. The server driver declares an outbound video track in `Capabilities` and maps
   `RealtimeAvatarSettings` (§6) to its setup.
2. The client driver emits a `MediaVideoSource` and flushes on interruption.
3. A capability row: a `MJ: AI Model Modalities` Video/Output row for that model/vendor (plus a
   profile row if the provider uses one).
4. Its avatars are `MJ: AI Persona Vendors` rows with `Modality=Video`.
5. It passes the **video conformance suite** (task E1).

### 4.2 The Gemini Enterprise driver

- **Where:** `packages/AI/Providers/Vertex`, which already owns `VertexAICredentials` and a Vertex
  `GoogleGenAI` client.
- **Server:** `@RegisterClass(BaseRealtimeModel, 'GeminiEnterpriseRealtime')`, extending
  `GeminiRealtime` and overriding only client construction (`vertexai: true`, project, location) and
  the auth/mint seam (§4.3). Config legality, tools, idle signal, thinking and resumption are all
  inherited.
- **Client:** key `'gemini-enterprise'`, extending the `'gemini'` client and overriding only the
  connect target.
- **Endpoint-keyed profiles (G8).** `GeminiLiveModelProfile` gains `Endpoint: 'developer' | 'enterprise'`
  (longest prefix within the endpoint) and:

  ```ts
  SupportsAvatarOutput: boolean;     // enterprise gemini-3.8-live: true; developer: false
  AvatarOutputEncoding?: string;     // 'video/mp4' (+ codecs, V-2)
  AvatarAudioMuxed?: boolean;        // V-2: true ⇒ the MP4 carries the voice; do NOT also play PCM
  ```
- **Mapping:** `RealtimeAvatarSettings` → the Enterprise setup's video response modality and avatar
  selection (V-1). On an unsupported endpoint/model: log "avatar requested, not supported on
  <endpoint>/<model>: audio only" and mint audio-only. **Never a mint error.**
- **Fix G1 in the base `'gemini'` client and server parser:** route parts by `inlineData.mimeType`
  through a small registry: `audio/pcm*` → PCM playback, `video/*` → `VideoPlayout`, unknown → a
  logged drop. **Never** play unknown data as audio.
- **Session length:** audio+video is capped at 2 minutes, so F7 resumption (`goAway` +
  `sessionResumptionUpdate`) must hold across repeated boundaries with the avatar live.
  `VideoPlayout` holds the last frame across reconnect (no black flash).

### 4.3 Enterprise browser auth: an exploration with a decision record (task D0b)

Not decided. The developer runs a time-boxed spike (≤ 3 days) against a real Enterprise project,
measures each viable option, and records the result in this section. The chosen option must keep
**Google credentials off the browser** and **lock the minted config** (model, avatar, tools) so a
tampered client cannot change them.

| Option | How | For | Against | Questions to answer |
|---|---|---|---|---|
| **A. Enterprise ephemeral tokens** | Same as today's Developer-API client-direct mint, if Enterprise offers it | Zero new infra; lowest latency; reuses F7 and the driver | May not exist (V-4) | Does Vertex Live support `authTokens` or an equivalent session-scoped credential? Can it lock `liveConnectConstraints` including the avatar? |
| **B. MJAPI WebSocket relay** | Browser ↔ MJAPI `/realtime/relay/:sessionId` (single-use MJ ticket) ↔ Vertex, using server-held creds from `@memberjunction/credentials`; bytes forwarded both ways; client `setup` validated against the minted config | Works for **any** provider without browser-safe tokens; creds never leave the server; one generic component | One extra hop; MJAPI carries video bandwidth (MP4 out ≈ 1–2 Mbps per session, VERIFY) and long-lived sockets; scaling and sticky sessions | Added p50/p95 latency vs A? Per-instance session capacity? Behaviour behind our load balancer and Azure/AWS ingress idle timeouts? |
| **C. Server-bridged via WebRTC (LiveKit)** | Agent runs server-side through our existing bridged path in a LiveKit room (Google's documented LiveKit + ADK reference architecture); avatar published as a video track; the browser joins the room | WebRTC to the browser (jitter buffering, congestion control); no browser auth problem; the same session can join meetings; reuses `ng-livekit-room` + `ng-realtime-media` | Requires §8 (LiveKit `publishVideo`) + server-side MP4 → raw frame decode (ffmpeg/WebCodecs-in-Node) and re-encode; heavier server; a LiveKit dependency for 1:1 | End-to-end latency vs A/B? CPU cost of decode/re-encode per session? Could we pass encoded frames through without re-encoding? |
| **D. Downscoped OAuth token** | Short-lived Google access token restricted by Credential Access Boundaries | No relay | CAB covers a narrow set of services (likely not Vertex); a leaked token is project-scoped. **Expected to be rejected; include only to close it out** | Does CAB support `aiplatform`? If not, stop |

**The spike delivers:** a latency/throughput table for each viable option (connect time,
first-frame time, voice-to-lip offset, p95 frame jitter, MJAPI CPU/memory per session), a security
note, and a one-paragraph decision.

The client contract is already transport-neutral:
`ClientRealtimeSessionConfig` gains `Transport?: 'direct' | 'relay' | 'bridged'` + `RelayUrl?` (all
additive; absent means `direct`, as today). Whichever option wins, **no UI or runtime code
changes**.

### 4.4 Contract changes in Core, client and runtime (all additive)

| Change | Where |
|---|---|
| `RealtimeVideoFrame { Data, MimeType, TimestampMs?, KeyFrame?, Width?, Height? }` + `IRealtimeSession.OnVideoFrame?` (typed sibling of `OnVideoOutput`) | `AI/Core baseRealtime.ts` |
| `BridgeMediaFrame` gains optional `MimeType`/`Width`/`Height`/`KeyFrame` | `RealtimeBridge/Base` |
| `OnRemoteVideo` accepts `MediaVideoSource`, with a `MediaStream` overload wrapped as `{Kind:'stream'}` | `BaseRealtimeClient` |
| `AddTrack(desc)` / `RemoveTrack(desc)` re-negotiate locally; drivers that need the wire re-set up via resumption | `BaseRealtimeClient` |
| `RealtimeAvatarSettings` (§6) in `ModelConfiguration.Realtime`; the co-agent `RealtimeVideoConfig` maps onto it (finally read) | `AI/Core modelConfiguration.ts`, `AI/Agents realtime-coagent-config.ts` |
| `RealtimeUsageModalityDetail.VideoOutSeconds` | `AI/Core` |
| `ClientRealtimeSessionConfig.Transport` / `RelayUrl` | `AI/Core` |
| `IRealtimeMediaHost.CreateLocalMediaController()` | `realtime-runtime` |

### 4.5 Which source the model sees (G4)

`VideoSourceArbiter` (in `/media`) is the **single writer** of inbound video.
`ChannelInboundVideoBridge` registers with it instead of writing directly.
- **Policy** is a data array, overridable per agent:
  1. an explicit user pick ("Agent sees ▾");
  2. otherwise the most recently started capture;
  3. otherwise the focused surface.
- **On every switch** it sends `SendContextNote("[The user is now sharing: <label>]")`.
- **The rate comes only from the negotiated track** (`MaxInboundVideoRate`). All hardcoded 1 fps
  clamps are deleted.

### 4.6 Webcam and screen share are channels (metadata only, no DDL)

Two channels, **Camera** and **Screen Share**, as `MJ: AI Agent Channels` rows with client + server
plugins:
- They source inbound video through the existing `GetSourcedTracks()` → `requestedTracks` path.
- **Server tools:** `Camera_RequestView` and `Screen_RequestShare`. These **only prompt**; capture
  always needs a user click.
- **Dormant-track rule:** requesting video collapses the session cap to 2 minutes, so the video track
  is requested **when capture starts** (via `AddTrack`), not at connect.

### 4.7 Placement: a channel default plus a per-user override

**Metadata default.** `MJ: AI Agent Channels.UIConfig` (existing JSON, no DDL) gains:

```ts
Placement?: MediaPlacement;                       // 'stage' | 'pip' | 'tab' | 'hidden'; default 'tab'
AllowedPlacements?: readonly MediaPlacement[];    // default: all
```

Defaults per channel:

| Channel | Default placement | Notes |
|---|---|---|
| **Avatar** | `stage` | Sinks outbound video: the first implementer and consumer of `GetSunkTracks()` |
| **Camera** / **Screen Share** | `pip` | |
| **Whiteboard** / **Remote Browser** / **Media** | `tab` | Now also movable, e.g. whiteboard to stage, avatar to PiP |

**Per-user override.** The user moves any surface with the tile's "Move to…" menu, or by dragging a
PiP, docking a tab onto the stage, or undocking. The result is persisted through
`UserInfoEngine.SetSettingDebounced`, like other user-tweakable UI:

| Key | Value |
|---|---|
| `mj.realtime.placement.v1` | `{ [channelKey]: MediaPlacement }`, global per user; the most recent choice wins across sessions |
| `mj.realtime.pip.v1` | `{ corner: 'tl'\|'tr'\|'bl'\|'br', widthPct: number }` |
| `mj.realtime.selfView.hidden.v1` | `boolean` |

- `MediaStage` takes `ChannelDefaults` + `UserOverrides` as inputs. The override wins when it is in
  `AllowedPlacements`.
- A "Reset layout" menu item clears the overrides.
- The LiveKit room uses the same keys under `mj.livekit.*`.
- **No `localStorage`** (MJ rule 9).

---

## 5. UX

The realtime overlay keeps its structure (orb hero ↔ console chrome, channel strip, composer,
surface tabs, focus pill). All video renders through `ng-realtime-media`.

- **Stage.**
  - Audio-only: the orb, unchanged. It is projected into `mj-media-tile`'s placeholder, so one
    component owns both states.
  - Avatar: video fills the hero, the audio-reactive ring frames it, and a state chip sits on the
    tile.
  - Console chrome: a compact avatar tile above the thread. With captions on in hero chrome,
    captions overlay the lower third.
  - **Stall fallback:** after about 1 s with no frame, the tile cross-fades to the orb.
  - **Disclosure:** a persistent "AI-generated video" badge. SynthID is invisible, so the UI should
    say it. The name shown is the persona's.
- **Self-view.** Mirrored PiP (draggable, resizable, hideable), with "Agent can see this" while
  frames flow.
- **Share preview.** Unmirrored, labelled with the actual surface, with **Stop** / **Change**.
  Stopping from the browser's bar is handled.
- **Composer.** **Camera**, **Share ▾** (*Entire screen · Window · Browser tab · This panel ▸*
  listing open whiteboard / browser / artifact panes), and a device chevron. **"Agent sees ▾"**
  appears only when 2+ sources are live.
- **First camera use.** `mj-camera-check`: mirrored preview + device pick before any frame reaches
  the model.
- **Layout is the user's.** Every surface has "Move to…", PiP is draggable, and "Reset layout" is
  available. Choices persist across sessions and devices.
- **Capability-driven.** Camera/Share appear when the model accepts inbound video; the avatar when
  it outputs video. **No template ever tests a provider name.**
- **Meeting room.** Migrated onto `ng-realtime-media`, it gains the share picker, self-view mirroring
  (missing today), the device menu and movable tiles, with the same UX in both apps.

---

## 6. Avatar identity: AI Personas (decided)

**No new columns.** The model already fits: a persona is the agent's identity, a
`MJ: AI Persona Vendors` row binds it to a vendor asset per modality, and `Modality=Audio` rows are
the voices today.

| Concern | Where | Change |
|---|---|---|
| "Persona *Ava* has an avatar on Gemini Enterprise" | `MJ: AI Persona Vendors` row: `PersonaID`=Ava, `VendorID`=Google (Vertex/Enterprise vendor row), **`ModalityID`=Video**, **`APIName`=`<Gemini preset avatar id>`** (V-1), `Status`, `Priority` | metadata rows only |
| Vendor-native avatar tuning | `VendorSettings` → **extend `IAIPersonaVendorSettings`** with a typed, optional `Avatar` block (below). The existing open index signature keeps it flexible | JSONType interface edit |
| Presentation hints that are **not** vendor-specific | `MJ: AI Personas.StyleDescriptors` → **extend `IAIPersonaStyleDescriptors`** with an optional `Visual` block | JSONType interface edit |
| Per-agent tweaks | `MJ: AI Agent Personas.StyleOverride` → **extend `IAIAgentPersonaStyleOverride`** with `Visual?` | JSONType interface edit |
| Picker thumbnails / hover preview | existing `PreviewImageURL` / `PreviewVideoURL` | none |

```ts
// metadata/entities/JSONType-interfaces/IAIPersonaVendorSettings.ts: added (existing fields untouched)
export interface IAIPersonaVendorSettings {
    /* …existing voice fields… */
    /** Present when this binding's Modality is Video. Vendor-neutral names; each driver maps what it supports. */
    Avatar?: {
        /** 'preset' = APIName is a vendor catalogue id; 'custom' = generated from a reference image (Gemini: enterprise allowlist). */
        Kind?: 'preset' | 'custom';
        /** MJ Storage file id of the reference image when Kind='custom'. Feature-flagged; see governance note. */
        ReferenceImageFileID?: string;
        /** Preferred output resolution; drivers clamp to what they support. */
        Resolution?: 'low' | 'standard' | 'high';
        /** Optional background treatment when the vendor supports it. */
        Background?: 'default' | 'transparent' | 'blur' | { ImageFileID: string };
    };
    [key: string]: unknown;
}

// IAIPersonaStyleDescriptors / IAIAgentPersonaStyleOverride: added
Visual?: {
    /** How the tile frames the avatar in the stage. */
    Framing?: 'head' | 'shoulders' | 'waist';
    /** Accent used for the speaking ring around the avatar tile (a design-token name, never a hex). */
    AccentToken?: string;
};
```

**Resolution at runtime:** agent → persona (the default, or chosen via `MJ: AI Agent Personas`) →
the persona-vendor row where `Modality=Video` and `Vendor` = the resolved model's vendor →
`RealtimeAvatarSettings`:

```ts
{ Enabled: true, AvatarID: row.APIName, ...row.VendorSettingsObject?.Avatar, Visual: merged(StyleDescriptors.Visual, StyleOverride.Visual) }
```

This mirrors how voices resolve today via `GetRealtimeModelVoices` (metadata ∪ the driver's
fallback list), so a driver may also expose a `SupportedAvatars` fallback.

**The avatar picker is the persona picker.** Personas with a Video binding for the current model
show a video thumbnail badge. Choosing a persona sets both voice and face.

**Order of operations** (a CLAUDE.md hard rule): edit the three JSONType interface files, **run
`mj sync push` BEFORE `mj codegen`**, then CodeGen, so the typed `VendorSettingsObject` /
`StyleDescriptorsObject` accessors pick up the new members.

**Custom likeness governance.** Who may create a likeness and which consent records are required
are **out of scope**. `Kind:'custom'` stays behind a feature flag until that is designed.

---

## 7. Metadata, cost, capability truth

All declarative `metadata/` edits: `uuidgen` keys, no `sync` block, no Metadata_Sync SQL
(release work).

- **Vendor/model rows:**
  - an inference-provider vendor row for Gemini Enterprise (Vertex);
  - an `AIModelVendor` row for `gemini-3.8-live` with `DriverClass: GeminiEnterpriseRealtime`;
  - `MJ: AI Model Modalities` **Video / Output** for that pairing;
  - `AIModelCost` rows once V-5 is known.
- **Persona-vendor rows:** `Modality=Video` rows for the Gemini preset avatars chosen for the
  default personas (V-1).
- **Channel rows:** Avatar, Camera, Screen Share in `MJ: AI Agent Channels`, with `UIConfig.Placement`.
- **One source of truth:** realtime reads `MJ: AI Model Modalities` first, then the profile table
  (as the profile header already claims).
- **Resolution:** a co-agent with video enabled prefers a model/vendor with Video/Output. Otherwise
  it degrades to audio and logs.
- **Usage:** `VideoOutSeconds` attributed to the model.
- **Credentials:** the Vertex credential shape through `@memberjunction/credentials`. Never in
  agent config.

---

## 8. Meetings (bridged path)

The minimum for an avatar agent to appear in a LiveKit meeting. This is also the prerequisite for
§4.3 option C.
1. **G2:** honour `kind` in `GeminiRealtimeSession.SendInput`.
2. **G11:** LiveKit native:
   - `publishVideo` via `@livekit/rtc-node` `VideoSource` / `LocalVideoTrack`, fed from
     `OnVideoFrame`, decoding MP4 server-side (the decoder choice is part of the task);
   - subscribe to `KIND_VIDEO` for `video-in` / `screen-in`.

---

## 9. Build plan: workstreams, tasks, acceptance

Each task leaves the build and every existing test green (the CLAUDE.md Definition of Done: unit
tests in each changed package, plus the deterministic integration tier before merge).

Dependencies: **A** and **B** run in parallel; **C** needs A; **D** needs A+B; **E** needs C+D;
**F** needs A.

### A. Shared media stack (`ai-realtime-client/media` + `ng-realtime-media`)

| Task | Work | Acceptance |
|---|---|---|
| A1 | Add the `./media` subpath to `ai-realtime-client` `exports`. Add an import-boundary test. | A test app importing only `/media` bundles with no `@google/genai`. The boundary test fails on a planted forbidden import. |
| A2 | `media/model.ts` types | No `any`; TSDoc on every export. |
| A3 | `LocalMediaController` + `displayCapture`: surface hints, `selfBrowserSurface:'exclude'`, `surfaceSwitching`, element/region crop with fallback, `onended`, `devicechange`, hot switch, consent | Fake-`mediaDevices` unit tests. Capture requests **native** fps. Unsupported element capture falls back with a reason. |
| A4 | `FrameSampler` | Rate 1 gives ≈1/s; rate 5 gives ≈5/s. Stop releases everything. |
| A5 | Unified `audioMeter` | Golden tests reproduce both old meters (7 and 9 bins) within tolerance. |
| A6 | `VideoPlayout` + decoder registry (MSE fMP4; WebCodecs + `mp4box.js`; image) + `IPlaybackClock` + `Flush` + last-frame hold | Fake `MediaSource`/`VideoDecoder` unit tests. A manual harness page plays a recorded fMP4 fixture. |
| A7 | `MediaStage` (port `livekit-room-logic.ts`; add stage/PiP/tab placement with user overrides and `AllowedPlacements`) | The ported selector tests keep their meaning. New override/reset tests. |
| A8 | `AttachVideoSource`, `VideoSourceArbiter` (against `IVideoFrameSink`) | Unit tests incl. switch → context note. |
| A9 | Scaffold `packages/Angular/Generic/realtime-media` (`@memberjunction/ng-realtime-media`); **move** the §3.2 components; add "Move to…", draggable/resizable PiP, `UserInfoEngine` persistence | DOM tests. `npm run check:ui` passes. No `livekit-client` / router / `ai-realtime-client` main-entry import. Dark mode checked. |

### B. Realtime contracts (no behaviour change)

| Task | Work | Acceptance |
|---|---|---|
| B1 | §4.4 Core additions | Builds; existing tests unchanged. |
| B2 | `OnRemoteVideo(MediaVideoSource)` + overload; `AddTrack`/`RemoveTrack` | Unit tests. |
| B3 | Endpoint-keyed profile table + `SupportsAvatarOutput`/`AvatarOutputEncoding`/`AvatarAudioMuxed` | Resolution tests for both endpoints. |
| B4 | **G1** MIME-routed `inlineData` in both Gemini parsers | **Test written first and failing:** a `video/mp4` part never reaches `RealtimePcmPlayback`. |
| B5 | **G2** `SendInput` honours `kind` | Unit test. |
| B6 | JSONType interface extensions (§6) → `mj sync push` → CodeGen | The typed `Avatar` / `Visual` members appear on the generated accessors. |

### C. User video in (webcam + screen share), provable on today's Gemini 3.8 Live (Developer API)

| Task | Work |
|---|---|
| C1 | `IRealtimeMediaHost.CreateLocalMediaController()`; browser host implementation |
| C2 | Retarget `ChannelInboundVideoBridge` onto the arbiter; delete the hardcoded 1 fps clamps |
| C3 | Camera + Screen Share channel plugins (client + server), metadata rows (`Placement:'pip'`), prompt-only tools |
| C4 | `RealtimeSessionRuntime` exposes `MediaStage`; starting capture calls `AddTrack` |
| C5 | Overlay renders through `mj-media-stage`: self-view, share preview, composer buttons, "Agent sees", `mj-camera-check`, move/persist placement |

**Acceptance (end to end):**
- Share a **browser tab** and the agent describes it. Switch to **camera** and the agent
  acknowledges the switch.
- Self-view is mirrored at native fps while the model gets ≤ the negotiated rate.
- "This panel" crops to the whiteboard pane (Chromium).
- The browser's "Stop sharing" bar ends cleanly.
- Moving the whiteboard to the stage persists across reload.
- A test asserts that **starting capture causes a video track to be requested** (the F8 lesson).

### D. Native avatar: Gemini 3.8 Live on Gemini Enterprise

| Task | Work | Acceptance / gate |
|---|---|---|
| D0a | Resolve V-1…V-7 from the Enterprise "Configure live avatars" / "Send audio and video streams" pages + a throwaway spike that logs raw avatar frames; record the answers in §0 | **No D-task code merges before D0a.** |
| D0b | **Auth exploration (§4.3):** measure the viable options and record the decision in §4.3 | Decision recorded before D2. |
| D1 | `GeminiEnterpriseRealtime` server driver (`AI/Providers/Vertex`) + `'gemini-enterprise'` client | |
| D2 | Implement the auth option chosen in D0b | The browser never holds a Google credential; a tampered setup is rejected. |
| D3 | Avatar settings resolution from personas (§6) → driver mapping + lock; audio-only degrade | |
| D4 | Video parts → `VideoPlayout` → `emitRemoteVideo`; honour `AvatarAudioMuxed`; barge-in flushes video | |
| D5 | Avatar channel (`Placement:'stage'`, sinks outbound video), stall→orb fallback, AI-generated badge, persona picker with avatar badges | |
| D6 | Resumption with the avatar live across **≥ 3 consecutive 2-minute boundaries**, no black flash | |
| D7 | Metadata rows (§7); `VideoOutSeconds` usage | |

**Acceptance:**
- A 10-minute Enterprise avatar conversation including async tool calls: lip-sync holds, and
  barge-in stops the mouth within one frame of the audio stopping.
- Requesting an avatar on the Developer API mints audio-only with a logged reason and **no error**.

### E. "Any video model plugs in": conformance, not a second vendor

| Task | Work |
|---|---|
| E1 | **Video provider conformance suite** in `ai-realtime-client` tests (a reusable harness): a fake video-capable driver pair (server capability + client emitting both `stream` and `element` sources) must drive the full path (negotiation → `MediaStage` → `mj-media-tile` → barge-in flush → usage) **with zero changes** outside the fake. The Gemini Enterprise driver must also pass it. |
| E2 | Every realtime driver audited for the new optional members. Audio-only drivers declare no outbound video, and the UI hides avatar affordances for them. |

### F. LiveKit migration + meetings

| Task | Work |
|---|---|
| F1 | `ToMediaParticipant` adapter; screen share via `/media` `displayCapture` + `publishTrack` |
| F2 | `ng-livekit-room` renders through `ng-realtime-media`. Delete its duplicated tile, meter, device-menu, prejoin and control-bar implementations and the `LiveKitMediaPreview` meter. Keep public inputs/outputs stable, or document the break in the changeset |
| F3 | §8 bridge items |

**Acceptance:** the existing livekit-room DOM and logic tests pass; the meeting room gains
self-view mirroring, the share picker and movable tiles.

### G. Close-out

| Task | Work |
|---|---|
| G1 | A **"Adding a video-capable realtime provider"** section in `guides/REALTIME_CO_AGENTS_GUIDE.md` (the §4.1 checklist + the conformance suite) |
| G2 | READMEs: `ng-realtime-media` new; `ai-realtime-client` updated for `/media` |
| G3 | Changeset `minor` (new package + metadata). All VERIFY items in §0 closed |

---

## 10. Risks

- **MP4 details (V-2).** If the MP4 is not fragmented, MSE can't stream it. The WebCodecs +
  `mp4box.js` demux path is the fallback, which is why playout is a registry from day one.
- **Auth (V-4).** The relay and bridged options cost server capacity. The D0b spike measures this
  before we commit.
- **The 2-minute cap.** The whole feature rests on resumption, so D6 is a gate.
- **The subpath dependency direction.** `livekit-room-core` → `ai-realtime-client/media` may be
  challenged in review. The boundary test keeps the fallback (lift `/media` into its own package)
  mechanical.
- **Safari.** No element capture and partial WebCodecs. Feature-detect: hide "This panel" and use
  the MSE path.
- **Cost.** Avatar minutes plus video input. Capture is always explicit and never auto-starts;
  usage is per track.
- **Custom likeness** is a legal and consent surface. It stays feature-flagged (§6).

---

## 11. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Avatar identity lives on **AI Personas**: `MJ: AI Persona Vendors` rows with `Modality=Video`, with the typed JSONType interfaces extended for flexibility (§6) | ✅ decided |
| D2 | Channel **`Placement`** default in `UIConfig`, plus **user-movable** surfaces persisted via `UserInfoEngine` (§4.7) | ✅ decided |
| D3 | Packages: **extend** existing ones (`ai-realtime-client` `/media` subpath; `realtime-runtime`; `livekit-room-core` adapter). The only new package is `@memberjunction/ng-realtime-media`, because no framework-neutral Angular realtime/media package exists (§3) | ✅ decided (subpath vs separate core package: fallback noted in §3) |
| D4 | First avatar provider = **Gemini 3.8 Live (native)**. Composed/paired avatar vendors are a non-goal (latency). The "any provider" proof is the conformance suite (E1) | ✅ decided |
| D5 | Enterprise browser auth: **explore** A/B/C/D in spike D0b and record the decision in §4.3 | 🔎 exploration task |

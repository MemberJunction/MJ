# Realtime Session Capture & Recording Guide

How MemberJunction captures a realtime (voice) session: **per-turn transcript with start/end timing
and speaker identity**, and an optional **stored audio recording** that an evidence player can seek
against. Read this before touching `persistRealtimeTranscript`, the `RealtimeSessionRunner` recording
seam, or the `RealtimeRecordingController`.

## TL;DR

- Every realtime turn is persisted as a `MJ: Conversation Details` row with a **create-on-start /
  update-on-complete** lifecycle: an `In-Progress` row is created on the first interim transcript and
  updated to `Complete` on the final transcript. This gives each turn a real **start** (`__mj_CreatedAt`)
  and an immutable **end** (`TurnEndedAt`) — without relying on `__mj_UpdatedAt` (which moves on later edits).
- Speaker identity reuses the existing **`ConversationDetail.UserID`** (set on **user** turns only; an AI
  turn has no human speaker). No separate speaker column.
- When recording is active, each turn also carries media-relative offsets **`UtteranceStartMs` /
  `UtteranceEndMs`** (milliseconds from the recording `t0`) and `MediaType='Audio'`.
- Audio is mixed to a mono PCM16 **WAV** (a **seekable** RIFF/WAVE container — its header carries the
  exact duration and maps byte offset → time linearly, so HTTP-range seeking is exact) and stored via
  **MJStorage**; the session row holds `RecordingFileID` (→ `MJ: Files`), `RecordingMedia`, and
  `RecordingStartedAt` (the `t0`). Capture happens on **both** topologies: server-side (server-bridged)
  and **in the browser** (client-direct).
- A **capture-time waveform** (normalized `0..1` max-abs peaks) is computed cheaply *during* recording
  and written as a **`peaks.json` sidecar** in the same storage folder as the WAV, so a player renders
  the waveform instantly without re-decoding the audio.
- Playback **streams** the recording over HTTP Range via `mj-storage-media-player` → the
  `CreateMediaAccessToken` mutation → the `GET /media/:fileId?token=` route (not a base64 download).
- Recording is **OFF by default**, resolved **runtime param > agent (`RecordingDefault`) > off**,
  **consent-gated**, and **fail-closed** (no storage provider or no consent ⇒ no capture).

## The pieces

| Concern | Where |
|---|---|
| Turn lifecycle persistence | `BaseAgent.persistRealtimeTranscript` (`packages/AI/Agents/src/base-agent.ts`) |
| Recording resolution + finalize (server-bridged) | `BaseAgent.resolveRealtimeRecording` / `finalizeRealtimeRecording` |
| Server-side audio accumulation + WAV encode | `RealtimeRecordingController` (`packages/AI/Agents/src/realtime/realtime-recording-capture.ts`) |
| Recording store + `peaks.json` sidecar write | `realtime-recording-store.ts` (`storeRealtimeRecording` / `writeRecordingPeaksSidecar`) |
| Session attach + finalize seam | `RealtimeSessionRunner` (`Recording` / `FinalizeRecording` deps) |
| Client-direct browser capture | `RealtimeAudioRecorder` + `encodePcm16Wav` / `PeakAccumulator` (`packages/Angular/Generic/conversations/src/lib/services/realtime-audio-recorder.ts`, `realtime-pcm-wav.ts`) |
| Streaming playback (server) | `CreateMediaAccessToken` mutation + `GET /media/:fileId` route (`packages/MJServer/src/rest/MediaStreamHandler.ts`, `peaksSidecar.ts`) |
| Streaming playback (client) | `mj-storage-media-player` (`@memberjunction/ng-media-player`) |
| Schema | `ConversationDetail.{TurnEndedAt,UtteranceStartMs,UtteranceEndMs,MediaType}`; `AIAgentSession.{RecordingMedia,RecordingStartedAt,RecordingFileID}`; `AIAgent.{RecordingDefault,RecordingStorageProviderID}` |

## Turn lifecycle (always on, recording or not)

`persistRealtimeTranscript(params, transcript)` returns the **new row id** when a distinct turn is first
created, and `null` when an existing in-flight row is merely updated — the runner counts the former so
`TranscriptTurnCount` reflects turns, not the many interim+final events a turn emits.

- **Interim** (`IsFinal=false`): on the first delta for a role, create the row (`Status='In-Progress'`,
  `Message=delta`, `UserID` for user turns, `UtteranceStartMs` if recording). Later deltas are no-ops.
- **Final** (`IsFinal=true`): update that in-flight row to `Status='Complete'`, full `Message`,
  `TurnEndedAt`, `UtteranceEndMs`. If no interim was seen (some providers only emit final), the row is
  created and finalized in one step.

> **Consumer note:** mid-turn `In-Progress` rows now exist transiently. UIs reading `ConversationDetail`
> should honor `Status`/`HiddenToUser` (most streaming chat surfaces already do).

## Recording config resolution (per session)

`resolveRealtimeRecording` decides whether to record, fail-closed:

1. **Media** = runtime `params.data.recording.media` ▸ `AIAgent.RecordingDefault` ▸ `None`. `None` ⇒ off.
2. **Consent** must be explicit `params.data.recording.consent === true`; otherwise off (logged).
3. **Storage** = `AIAgent.RecordingStorageProviderID` ?? `AIAgent.AttachmentStorageProviderID`, resolved to
   that provider's first account via `FileStorageEngine.GetAccountsByProviderID`. No account ⇒ off.

Only when all three pass is a `RealtimeRecordingController` created. Finalize (`finalizeRealtimeRecording`)
encodes the WAV, `UploadFile`s it to the resolved account, writes the `peaks.json` sidecar beside it,
creates a `MJ: File Entity Record Links` row (EntityID = `MJ: AI Agent Sessions`, RecordID = session id),
and stamps `RecordingFileID/Media/StartedAt` on the session. Any failure is logged, never thrown — a
recording problem must not fail the session.

## Topology: where audio is captured

Recording works on **both** topologies; the difference is only *where* the audio is mixed.

**Server-bridged sessions** (LiveKit/Zoom/Teams/Twilio): the server-side `IRealtimeSession` carries the
media (`OnOutput` = model speech; `SendInput` = inbound), so the `RealtimeSessionRunner` attaches the
`RealtimeRecordingController` there — it taps `OnOutput`, wraps `SendInput`, mixes to a mono PCM16 WAV,
computes capture-time peaks, and finalizes on `Stop()`.

**Client-direct browser sessions** negotiate audio in the browser — the server never sees those frames —
so capture happens **in the browser** via `RealtimeAudioRecorder` (`@memberjunction/ng-conversations`):

- It mixes the user's microphone with the agent's remote-audio stream through the Web Audio API and
  captures Float32 PCM frames off an `AudioWorkletNode` (preferred) or `ScriptProcessorNode` (fallback) —
  **not** a `MediaRecorder` (whose webm/opus output is header-less, so range seeking is unreliable). At
  `Stop()` the accumulated PCM is encoded to a seekable 16-bit PCM WAV via `encodePcm16Wav`.
- A bounded `PeakAccumulator` computes the waveform peaks **during** capture (cost stays O(buckets)
  regardless of call length); these become the `peaks.json` sidecar on upload.
- **Agent-audio mixing:** the agent's WebRTC track usually lands *after* recording has already begun
  (mic-only). The recorder exposes `AttachRemoteStream(stream)`, and the session service subscribes to
  the client driver's `OnRemoteMediaStream(cb)` hook (`BaseRealtimeClient` / `OpenAIRealtimeClient`) so
  the agent stream is wired into the live mix the moment it arrives — capturing both sides, not just the
  mic. The recorder degrades gracefully (no `AudioContext` / no worklet+scriptprocessor / no remote
  stream ⇒ disable or mic-only) so a recording problem never blocks the live call.

## Playback: streaming the recording

Playback **streams** the stored WAV over HTTP Range rather than downloading it. The
`mj-storage-media-player` component (`@memberjunction/ng-media-player`) takes the recording's
`RecordingFileID` and:

1. Calls the **`CreateMediaAccessToken`** mutation, which runs a per-user permission check, mints a
   short-lived signed token, returns the authenticated `GET /media/:fileId?token=` streaming URL, and —
   when the `peaks.json` sidecar exists — returns the precomputed waveform peaks.
2. Hands the URL (and any peaks) to the generic `mj-media-player`, whose `<audio>` element streams the
   WAV natively over HTTP Range via the `/media` route (re-verifies the token, then range-streams from
   the storage provider through `FileStorageBase.GetObjectStream`). Supplied peaks render the real
   waveform instantly with no client-side decode.

The in-conversation **session-review overlay** (`realtime-session-overlay`) embeds
`mj-storage-media-player` directly, passing the recording file id + the `ConversationDetail` transcript
cues for click-to-seek + active-turn highlight. (The older `RealtimeEvidencePlaybackComponent` remains a
generic, input-driven time-aligned player for callers that already hold an audio URL, falling back to
`__mj_CreatedAt − RecordingStartedAt` when a turn has no precise `UtteranceStartMs`.)

## The Media channel (showing media during a call)

Separate from capture: `RealtimeMediaChannel` (client) + `MediaChannelServer` (server, a state validator)
let the agent show images/video/audio/PDF/web embeds during a conversation via `Media_*` tools, rendered
as **tabs**. It reuses `MJ: Files` + the channel `Config` state — no new entity. Registered via the
`MJ: AI Agent Channels` metadata row (`ServerPluginClass='MediaChannelServer'`,
`ClientPluginClass='RealtimeMediaChannel'`); `LoadMediaChannelServer()` is called from MJServer's
`agentSessions` static path to survive tree-shaking.

### Showing an MJStorage file (not just a public URL)

`Media_ShowMedia` accepts **either** a public `url` **or** an MJ `fileId` (one of the two is required;
neither ⇒ the tool rejects). A `fileId` points at an `MJ: Files` row, so the agent can put a
permission-gated, MJStorage-backed file on the surface without ever exposing a public URL. `MediaItem`
carries the optional `FileID` alongside `Url`, and the pure `RouteForMediaItem` helper centralizes the
render decision per item:

| Item | Route | Rendered by |
|---|---|---|
| `audio` / `video` with a `FileID` | `storage-player` | `<mj-storage-media-player [FileID]>` — HTTP-range, permission-gated, full transport + waveform |
| `audio` / `video` with only a `Url` | `url-player` | `<mj-media-player>` (replaces the old raw `<audio>`/`<video>`) |
| `image` / `pdf` / `web` (either source) | `iframe-or-img` | a `CreateMediaAccessToken` streaming URL for a `FileID`, or the `Url` directly, with loading + no-access states |

`FileID` wins over `Url` for audio/video (secure streaming is preferred). A file-backed item streams the
same way recordings do — through `CreateMediaAccessToken` → the `GET /media/:fileId?token=` route — so it
inherits the per-user permission check and HTTP-range streaming for free; there is **no** base64 download
and the model never sees a raw URL for a `fileId` item.

Because the storage player and the token mutation run server calls, the channel threads the **live
session `Provider`** through `RealtimeChannelContext` into the surface (`BindSurface`), so playback and
token-minting run under the session's authenticated provider — multi-provider safe. When the context's
`Provider` is `null`, the surface falls back to the global default.

## Meeting-Room recording (LiveKit egress → MJStorage)

> **Status: BUILT.** The full loop — egress → register the MP4 as an `MJ: Files` row → stamp the
> Conversation → play it back in the Meet app — is implemented and unit-tested. The one **deployment**
> requirement is the storage config (`MJ_MEETING_RECORDING_STORAGE_PROVIDER`, below); without it the
> recording still stops, it just isn't registered as a Files row.

The per-session recording above captures *one agent session's* audio. A LiveKit **meeting** is different:
it maps 1:1 to a **Meeting-Room Conversation** (`ApplicationScope='Application'`, so it stays out of normal
chat), and a single meeting can span **multiple** agent sessions. The room-level **composite** recording —
one MP4 that LiveKit egress produces for the whole room — therefore belongs on the **room (the
Conversation)**, not on any single `AIAgentSession` (which keeps its own per-agent `RecordingFileID`).

- **Schema** (additive + nullable): `Conversation.RecordingFileID` (FK → `MJ: Files`, the composite egress
  MP4) and `Conversation.EgressID` (the LiveKit egress session id — set when recording starts, used to stop
  the egress and correlate its completion result back to the conversation).
- **Egress service** (`LiveKitEgressService`, `packages/LiveKitRoomServer/src/livekit-egress-service.ts`):
  `StartRoomRecording` starts a composite MP4 egress and returns its `EgressID`; on stop/complete,
  `RecordingInfo` surfaces the egress's **`OutputLocation`** (the file's path/key in the egress sink),
  **`OutputSizeBytes`**, and **`OutputDurationMs`** (normalized from the SDK's nanosecond duration),
  extracted from `EgressInfo.fileResults[0]`. While a recording is still in progress (no `fileResults` yet),
  those three fields are `undefined`.
- **Registration** (`packages/MJServer/src/resolvers/meetingRecordingRegistration.ts`, invoked from
  `RealtimeBridgeResolver`):
  - **On `StartLiveKitRecording`** — best-effort `correlateRecordingStart(roomName, egressID)` stamps
    `Conversation.EgressID` onto the room's Meeting-Room Conversation *if it exists*, so a live recording is
    correlated. If the conversation doesn't exist yet, it's skipped silently (the stop-flow resolves/creates
    it). The recording start never fails on this.
  - **On `StopLiveKitRecording`** — after stopping egress, `registerMeetingRecordingFile(...)`:
    1. **Resolves the Meeting-Room Conversation** — prefer match by `EgressID`, fall back to room name
       (`ExternalID` + `Type='Meeting Room'`), else create one (scoped `Application`, mirroring the
       transcript sink).
    2. **Resolves the storage account** — the `MJStorage` account linked to the configured provider (see
       config below) whose sink LiveKit egress wrote to.
    3. **Creates the `MJ: Files` row** — `ProviderID` = that provider, `ProviderKey` = the egress
       `OutputLocation`, `ContentType='video/mp4'`, `Status='Uploaded'`, `Name='Meeting Recording — <Room> —
       <date>'`. **v1 points the Files row DIRECTLY at the egress output — no byte copy** — so playback
       streams straight from the sink.
    4. **Stamps the Conversation** — `RecordingFileID` (+ `EgressID` if unset) and saves.
    5. Returns the new file id, which `StopLiveKitRecording` surfaces as `LiveKitRecordingResult.RecordingFileID`.
  - **All best-effort** — wrapped in try/catch, returns a non-throwing failure result with a clear message
    (missing config, no account, save failure) and `LogError`s. A failed registration never crashes the
    stop-recording mutation; the recording still stopped.

#### Required storage configuration

The egress sink and the MJStorage account must point at the **same** bucket/container so MJ can read the
file LiveKit wrote. Configure the provider whose accounts target the sink:

- **env**: `MJ_MEETING_RECORDING_STORAGE_PROVIDER=<MJ: File Storage Providers ID>`
- **config** (`mj.config.cjs`): `meetingRecordingStorageProviderID: '<provider id>'`

When unset, registration returns a clear, non-throwing failure (the recording stops, but isn't registered).

#### Point-at-sink (default) vs. copy-to-canonical ("copy into Box")

- **Default (point-at-sink)** — the Files row's `ProviderKey` IS the egress `OutputLocation` in the sink
  provider. No bytes are moved; playback streams from the sink. Use when the egress sink (S3/Azure/MinIO/GCS)
  is itself an MJStorage-readable provider.
- **Optional (copy-to-canonical)** — set a **different** canonical provider via
  `MJ_MEETING_RECORDING_CANONICAL_STORAGE_PROVIDER` (or `meetingRecordingCanonicalStorageProviderID`). When
  set and different from the sink, `copyEgressOutputToCanonical(...)` reads the bytes via the sink driver's
  `GetObject({ fullPath })` and re-uploads them into the canonical provider (e.g. **Box**) via
  `FileStorageEngine.UploadFile`, then points the Files row there. **OFF by default.**

#### Meet app playback

The Meet UI (`mj-livekit-agent-room`, `packages/Angular/Generic/mj-livekit-room/`) renders a dismissable
**"Meeting recording"** panel with `<mj-storage-media-player [FileID]="recordingFileId" [Provider]="Provider">`
whenever the room has a recording. `recordingFileId` is set two ways: (a) when the user **stops** a
recording, `StopRecording` returns the freshly-registered `RecordingFileID`; (b) on **join/start**, the
component resolves any prior recording for the room from its Meeting-Room Conversation
(`ExternalID` + `Type='Meeting Room'`, `RecordingFileID IS NOT NULL`). Playback streams over HTTP Range via
the same `mj-storage-media-player` pipeline used for per-session recordings.

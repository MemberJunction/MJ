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
- Audio is captured server-side, mixed to a mono PCM16 **WAV**, and stored via **MJStorage**; the session
  row holds `RecordingFileID` (→ `MJ: Files`), `RecordingMedia`, and `RecordingStartedAt` (the `t0`).
- Recording is **OFF by default**, resolved **runtime param > agent (`RecordingDefault`) > off**,
  **consent-gated**, and **fail-closed** (no storage provider or no consent ⇒ no capture).

## The pieces

| Concern | Where |
|---|---|
| Turn lifecycle persistence | `BaseAgent.persistRealtimeTranscript` (`packages/AI/Agents/src/base-agent.ts`) |
| Recording resolution + finalize | `BaseAgent.resolveRealtimeRecording` / `finalizeRealtimeRecording` |
| Audio accumulation + WAV encode | `RealtimeRecordingController` (`packages/AI/Agents/src/realtime/realtime-recording-capture.ts`) |
| Session attach + finalize seam | `RealtimeSessionRunner` (`Recording` / `FinalizeRecording` deps) |
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
encodes the WAV, `UploadFile`s it to the resolved account, creates a `MJ: File Entity Record Links` row
(EntityID = `MJ: AI Agent Sessions`, RecordID = session id), and stamps `RecordingFileID/Media/StartedAt`
on the session. Any failure is logged, never thrown — a recording problem must not fail the session.

## Topology: where audio is captured

The server-side `IRealtimeSession` carries audio (`OnOutput` = model speech; `SendInput` = inbound) **only
on the server-bridged topology** (LiveKit/Zoom/Teams/Twilio), where a bridge proxies the media. The
`RealtimeSessionRunner` attaches the controller there: it taps `OnOutput` and wraps `SendInput`, then
finalizes on `Stop()`.

**Client-direct browser sessions** negotiate audio in the browser — the server never sees those frames —
so browser-side capture (record mic + remote audio, upload to MJStorage) is a **follow-up**. The schema,
storage, config resolution, and the evidence player all already support it; only the browser capture +
upload is outstanding. To add recording to any other live session, give that wiring a
`RealtimeRecordingController`: feed `AppendOutbound`/`AppendInbound` and call `EncodeWav` on close.

## The evidence player

`RealtimeEvidencePlaybackComponent` (`@memberjunction/ng-conversations`) renders the time-aligned
transcript + audio: clicking a turn seeks the audio to `UtteranceStartMs/1000` (falling back to
`__mj_CreatedAt − RecordingStartedAt` when the precise offsets are absent) and highlights the active turn
during playback. It reads the stored recording's signed URL + the `ConversationDetail` rows.

## The Media channel (showing media during a call)

Separate from capture: `RealtimeMediaChannel` (client) + `MediaChannelServer` (server, a state validator)
let the agent show images/video/audio/PDF/web embeds during a conversation via `Media_*` tools, rendered
as **tabs**. It reuses `MJ: Files` + the channel `Config` state — no new entity. Registered via the
`MJ: AI Agent Channels` metadata row (`ServerPluginClass='MediaChannelServer'`,
`ClientPluginClass='RealtimeMediaChannel'`); `LoadMediaChannelServer()` is called from MJServer's
`agentSessions` static path to survive tree-shaking.

---
"@memberjunction/ng-media-player": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-mj-livekit-room": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/storage": minor
"@memberjunction/server": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-realtime-client": minor
"@memberjunction/livekit-room-server": minor
"@memberjunction/graphql-dataprovider": minor
---

feat(media+realtime): generic media player, end-to-end media streaming, and the realtime/LiveKit recording stack

A new media + recording platform spanning the player, storage, server, and the realtime/voice stack.

**Generic media player (`@memberjunction/ng-media-player`, new package)** — a framework-agnostic
`mj-media-player` (transport, click/drag scrubber, playback speed, ±skip, keyboard, fullscreen,
multi-track video grid, a real decoded audio waveform that doubles as the scrubber and accepts
precomputed `MediaTrack.Peaks`, a time-synced clickable transcript, loading/buffering state with an
`aria-live` status, cancelable `Before*` events, and an imperative API) plus an MJStorage-bound
`mj-storage-media-player` that resolves a `FileID` to an authenticated, range-streamed source. The
artifact audio/video viewers and previews now embed it.

**MJStorage streaming (`@memberjunction/storage`)** — `FileStorageBase.GetObjectStream` +
`SupportsStreaming` + `StreamingNotSupportedError`, implemented for all seven drivers (Box, AWS S3,
Azure, GCS, Google Drive, SharePoint, Dropbox).

**Authenticated media delivery (`@memberjunction/server`)** — a `CreateMediaAccessToken` mutation
(short-lived, permission-gated, returns precomputed waveform peaks) and a `GET /media/:fileId?token=`
HTTP-Range streaming route — any stored asset is served to the browser by `FileID` with real
streaming + permissions, no public links.

**Realtime co-agent recording (`@memberjunction/ng-conversations`, `@memberjunction/ai-realtime-client`,
`@memberjunction/ai-agents`)** — client-direct sessions record a seekable 16-bit WAV with capture-time
waveform peaks (a `peaks.json` sidecar); the agent's remote audio is mixed in when its WebRTC track
lands (`OnRemoteMediaStream`/`AttachRemoteStream`); transcript cue timing anchors to real audio onset
across tool-call gaps; recorded sessions stream back through the player. Plus reactive fixes
(`ConversationEngine.EnsureConversationLoaded` in `@memberjunction/core-entities`) so new conversations
and recordings appear without a refresh.

**LiveKit meeting recording (`@memberjunction/livekit-room-server`, `@memberjunction/server`,
`@memberjunction/graphql-dataprovider`, `@memberjunction/ng-mj-livekit-room`)** — egress output is
registered as an `MJ: Files` row linked to the Meeting-Room `Conversation` (new `RecordingFileID` /
`EgressID`), with point-at-sink or copy-to-canonical storage, and played back in the Meet UI.

**Realtime surface-tab overhaul (`@memberjunction/ng-conversations`)** — channel tabs appear only once
used (Whiteboard excepted), each color/icon-coded; the Activity tab is gated, restyled, and
right-aligned; agent-run artifacts move out of per-artifact tabs into the Activity tab with a
resizable, `UserInfoEngine`-persisted split viewer.

The Media channel can now show MJStorage files (`fileId`) in addition to URLs. The realtime
recordings dashboard (`@memberjunction/ng-dashboards`) and CodeGen-regenerated entity forms
(`@memberjunction/ng-core-entity-forms`) reflect the new recording fields.

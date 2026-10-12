---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/realtime-runtime": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-core-entity-forms": minor
---

Client-direct realtime recordings no longer depend on the browser surviving the end of the call (#5294).

- **Opus shards during the call.** The browser captures at 48 kHz into one continuous Opus encoder (WebCodecs, or libopus WebAssembly in a Worker where WebCodecs cannot encode Opus) and uploads a 5 s `MJOPUS1` shard as raw bytes to `POST /realtime/recording/:agentSessionId/shard/:index`. Each shard is kept in IndexedDB until the server acknowledges it, so shards survive network drops and reloads and are uploaded on the next page load.
- **Keepalive terminal.** End, `pagehide` and `visibilitychange`→hidden send `POST /realtime/recording/:agentSessionId/end` with the last partial window as a `keepalive` request, then re-send every unacknowledged shard with `keepalive`. A hidden tab's terminal carries `final=false`: the server stamps the counts but assembles only after the grace period, so switching tabs does not rewrite the recording. `EndRealtimeSession()` waits for the terminal's acknowledgement for at most 3 s. The whole-call `UploadRealtimeRecording` upload and the `beforeunload` prompt are gone from new clients. The mutations remain for older clients.
- **Server ledger and assembly.** Migration `V202610122000` adds `RecordingStatus`, `RecordingExpectedShards`, `RecordingCapturedSamples`, `RecordingGaps` and `RecordingAssemblyVersion` to `AIAgentSession`, and the new `MJ: AI Agent Session Recording Shards` entity, written through guarded stored procedures. MJAPI assembles `recording.wav` and `peaks.json` within seconds of the terminal. A recording with missing shards is assembled as `Partial` after `realtime.recordingAssemblyGraceSeconds` (default 90): each gap is silence and is listed in `RecordingGaps`. The session janitor assembles sessions that never sent a terminal. Recovery of legacy `seg-*.pcm` storage shards is unchanged.
- **Breaking for custom hosts:** `IRealtimeSessionRecorder` now returns Opus packets (`TakeEncodedPackets()`, `Stop(): Promise<number>`) instead of base64 audio. `BrowserRecordingUnloadGuard` is removed. A host that wires its own page-lifecycle events calls `SendRecordingTerminal({ Final: false })` when the page is hidden and `SendRecordingTerminal()` on `pagehide`.

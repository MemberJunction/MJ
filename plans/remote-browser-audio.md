# Remote Browser Audio — Generic, MJ-Convention Plan

## Goal
Stream audio **FROM** the remote browser to the user (browser → user) so a co-agent demoing YouTube/etc. is heard. Must be **generic across all remote-browser backends** — each backend captures/transports its own way — but handled **uniformly via MJ conventions**: a capability-gated session contract, the existing PUSH_STATUS push transport (same as the screencast), and a client Web-Audio player. Architecture is **bidirectional-ready** (user → browser virtual-mic later) but v1 ships **browser → user only**.

This mirrors the existing **screencast** pattern (`StartScreencast`/`StopScreencast` + `RemoteBrowserScreencastFrame` + `publishFrame` + canvas render) one-for-one. Read `guides/REMOTE_BROWSER_GUIDE.md` first.

## Capability gating — by implementation (v1), metadata flag (fast-follow)
The screencast capability (`ScreenStreaming`) is a CodeGen-generated `IRemoteBrowserProviderFeatures` flag on the `MJ: AI Remote Browser Providers.SupportedFeatures` column. Adding a new generated flag traps the build behind migration + CodeGen. **For v1, gate audio by BACKEND IMPLEMENTATION**: the CDP session's `StartAudioStream` delegates to an OPTIONAL backend capture hook; if the backend doesn't provide one, throw `RemoteBrowserCapabilityNotSupportedError` (the server then reports `Streaming:false`, exactly like screencast on a non-streaming backend). **Fast-follow (separate, documented):** add an `AudioStreaming?: boolean` flag to the `IRemoteBrowserProviderFeatures` JSONType interface (migration → CodeGen → add to `KNOWN_REMOTE_BROWSER_FEATURE_KEYS` → seed `AudioStreaming: true` on the Self-Hosted Chrome provider via metadata sync) for UI discoverability. Do NOT block v1 on it.

## Layers (mirror screencast exactly)

### 1. Base — `@memberjunction/remote-browser-base` (`remote-browser-session.ts`)
- New type `RemoteBrowserAudioChunk` (sibling of `RemoteBrowserScreencastFrame`):
  `{ DataBase64: string; Codec: 'webm-opus' | 'opus' | 'pcm16'; SampleRate: number; Channels: number; SequenceNumber: number; DurationMs?: number }`.
- Add to `IRemoteBrowserSession`:
  - `StartAudioStream(onChunk: (chunk: RemoteBrowserAudioChunk) => void): Promise<void>` — capability-gated, mirror `StartScreencast`.
  - `StopAudioStream(): Promise<void>` — mirror `StopScreencast`.
  Document that backends without audio capture throw `RemoteBrowserCapabilityNotSupportedError`.

### 2. CDP kit — `@memberjunction/remote-browser-cdp`
- `ICdpSessionBackend` gains OPTIONAL `StartAudioCapture?(page, onChunk): Promise<ICdpAudioCaptureHandle>` where the handle has `Stop(): Promise<void>`. Backends that can capture implement it; others omit it.
- `CdpRemoteBrowserSession.StartAudioStream` / `StopAudioStream`: if `backend.StartAudioCapture` is absent → throw `RemoteBrowserCapabilityNotSupportedError`; else start/stop it, mapping raw capture chunks → `RemoteBrowserAudioChunk`. Tear the capture down in `Close()`.
- **Self-host capture mechanism (the concrete first backend impl), in-page, headless-safe, no OS audio device, no extension:**
  Inject a capture agent via Playwright `page.exposeBinding('__mjAudioChunk', cb)` + `addInitScript`. The agent:
  1. Watches for media elements (`<video>`/`<audio>`) — `MutationObserver` + initial scan.
  2. When one starts playing, taps it: `const stream = el.captureStream()` (audio tracks only).
  3. `const rec = new MediaRecorder(new MediaStream(stream.getAudioTracks()), { mimeType: 'audio/webm;codecs=opus' })`; on `dataavailable`, base64-encode the blob and call `window.__mjAudioChunk({ dataBase64, codec:'webm-opus', sampleRate:48000, channels:2, seq })`. Use a small `timeslice` (e.g. 250ms) for low latency.
  4. Handle element swap / play/pause / src change by restarting the recorder on the active element.
  This covers media-element audio (YouTube and most video/audio sites). **Documented limitation:** pure Web-Audio-API sound (some games/apps) and DRM/EME media (captureStream blocked) aren't captured — a server-side virtual-sink path (PulseAudio null-sink / macOS BlackHole + ffmpeg) is the documented future option for full-fidelity/DRM capture. Note this clearly in the guide.

### 3. Server — `@memberjunction/server` (`RemoteBrowserActionResolver.ts`)
- New mutations `StartRemoteBrowserAudioStream(agentSessionID)` → `RemoteBrowserAudioStreamResult { Streaming: boolean }` and `StopRemoteBrowserAudioStream(agentSessionID): boolean`. Mirror `StartRemoteBrowserScreencast`/`Stop` exactly: ownership-gated, idempotent (track started sessions in a `Set`), capability fallback (catch `RemoteBrowserCapabilityNotSupportedError` → `Streaming:false`).
- `publishAudioChunk(pubSub, userPayload, agentSessionID, chunk)` mirrors `publishFrame`: publish on `PUSH_STATUS_UPDATES_TOPIC` with envelope `{ resolver:'RemoteBrowserActionResolver', type:'RemoteBrowserAudioChunk', agentSessionID, dataBase64, codec, sampleRate, channels, seq }`, scoped by `userPayload.sessionId`.

### 4. Client — `@memberjunction/ng-conversations` (remote-browser channel + surface)
- Channel: `START_AUDIO_STREAM` / `STOP_AUDIO_STREAM` mutation constants + calls; subscribe to push messages of `type:'RemoteBrowserAudioChunk'` for this `agentSessionID`; feed chunks to a `RemoteBrowserAudioPlayer`.
- `RemoteBrowserAudioPlayer` (new, pure-ish, unit-testable seams): an `AudioContext`-based sequential player. For `webm-opus` chunks, append to a `MediaSource`/`SourceBuffer` (audio/webm;codecs=opus) feeding a hidden `<audio>` element, OR decode each self-contained chunk; pick whichever gives gapless playback — MediaSource + SourceBuffer is the robust choice for a continuous webm-opus stream. Maintain a queue, drop on overflow, resync on gaps via `SequenceNumber`.
- Surface: an **audio on/off toggle** in the live-view toolbar (speaker icon), default ON when the stream starts successfully; autoplay is fine because the call is already a user gesture. Respect `--mj-*` tokens. Start the audio stream when the surface binds (alongside the screencast), stop on unbind.

### 5. Loopback proof + tests
- A `LoopbackAudioCapture` (test backend or a fake `ICdpSessionBackend.StartAudioCapture`) that emits a synthetic tone (or fixed PCM/opus blob) as chunks — proves the full path (session → server publish → client queue) without a real browser.
- Unit tests: Base type + session gating (throws when no capture hook); Cdp `StartAudioStream` start/stop + Close teardown + chunk mapping; server `publishAudioChunk` envelope + idempotent start + capability fallback; client `RemoteBrowserAudioPlayer` queue/seq/decode seam.

## MJ conventions (enforce)
- Capability-gated (engine/server gate, session `RequireFeature`/throw as defense-in-depth) — same two-layer model as screencast.
- ClassFactory/metadata-resolved providers; per-backend capture behind the `ICdpSessionBackend` seam (generic contract, backend-specific transport) — this is the "each backend its own way" requirement.
- Reuse the existing PUSH_STATUS transport (no new infra for v1).
- No `any`; PascalCase public / camelCase private; TSDoc on new public surfaces; functions < ~40 lines; design tokens for CSS. Watch `*/` inside JSDoc.
- Build every touched package (`npm run build` in its dir); add/keep tests green.

## Out of scope (v1)
- User → browser audio (virtual mic). Contract is shaped to allow it later; do not build.
- The metadata `AudioStreaming` feature flag migration (fast-follow, documented).
- WebRTC/binary transport (PUSH_STATUS base64 is fine for v1; note in guide that a binary/WebRTC transport is the future efficiency upgrade, shared with the screencast).

---
"@memberjunction/ai-realtime-client": patch
---

Adds the `@memberjunction/ai-realtime-client/media` entry point: frame capture, the video source arbiter, frame pacing, the channel video bridge and the audio meter, with no provider driver or `@google/genai` behind it. An app that imports only `/media` bundles none of the drivers. `ChannelInboundVideoBridge` now accepts any `IVideoFrameSink`; a `BaseRealtimeClient` still works. The main entry exports the same names as before. The package now has an `exports` map, so a deep import such as `@memberjunction/ai-realtime-client/dist/...` no longer resolves; nothing in this repo uses one.

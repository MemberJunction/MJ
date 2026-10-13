---
"@memberjunction/ai-bridge-livekit": minor
---

The LiveKit row in `MJ: AI Bridge Providers` no longer claims `ScreenOut`. The meeting bot shares no screen: its only video out is the agent's avatar, and the bridge drops `screen-out` frames. The row keeps on-demand join, audio in and out, cameras (`VideoIn`) and shared screens (`ScreenIn`) in, the avatar as video out (`VideoOut`) and per-participant diarization. Once `mj sync push` applies the row, Explorer's provider form shows Screen out off. A unit test checks the row in `metadata/` against these flags and drives the bridge with them. Minor because the row is metadata.

---
"@memberjunction/ai-agents": patch
"@memberjunction/integration-test-suite": patch
---

A bridged realtime session (a meeting bot, a phone call) now stores the usage its model session reports while closing, so a meeting's last avatar seconds are stored and priced (#5355).

Closing a bridged session finalized its co-agent runs first and closed the model session after. What the model session reported while closing reached a usage recorder that was already closed and was dropped: a Gemini avatar session reports its last seconds of video then, about 10 s of 145 s in a live meeting.

- The `Close()` that `WireBridgeRealtimeSession` wraps now cancels pending narration, closes the model session, waiting up to `BRIDGE_SESSION_CLOSE_WAIT_MS` (5 s), and then finalizes the runs, whether the close finished, failed or ran out of time. A failed close still rejects, after the finalize; a close that runs out of time is logged, and what it reports later is not stored.
- A model session the bridge replaces when the bot takes the avatar down closes the same way, so its last seconds stay on its own run.
- Usage reported after the runs were finalized is still not stored.
- Integration check RD15's stand-in session reports 1.5 s more video while it closes. The run must store 4 s, and on a model-vendor pair with an avatar video price (Gemini 3.8 Live on Vertex AI) price the 4 s on its video line.

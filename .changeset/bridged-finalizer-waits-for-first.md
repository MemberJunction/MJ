---
"@memberjunction/ai-agents": patch
---

A bridged realtime session's `Close()` now resolves only once its co-agent runs are finalized, also when a dropped connection started the finalize (#5394).

A bridged session finalizes its runs once: from the `Close()` that `WireBridgeRealtimeSession` wraps, or from the driver's `OnClose` when the connection drops. The finalizer returned at once on a second call, so a `Close()` after a drop could resolve while the runs were still being written and priced. Every call now returns the first call's promise, and the first call's `success` still stands.

---
"@memberjunction/core": patch
"@memberjunction/ai": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
---

Add sliding forward-progress liveness watchdog (`AgentLivenessWatchdog`), always-on internal liveness streaming sink, long-running `undici` HTTP dispatcher helpers (`CreateLongRunningFetchDispatcher`), and semantic `AgentStuckDetector` (canonical repeated tool-call breaker + 30-step read-only spiral wrap-up directive) backed by centralized `LimitsConfigResolver` `Liveness` and `StuckDetector` config sections (Slice s12 / A7b).

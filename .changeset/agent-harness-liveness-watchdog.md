---
"@memberjunction/ai-agent-harness": minor
---

Add mid-turn liveness watchdog (`limits.maxIdleSeconds`), consecutive identical tool-call loop circuit breaker (`limits.maxConsecutiveIdenticalToolCalls`), throttled `liveness-heartbeat` pulses with bounded stdout/stderr tail ring buffer in `BaseCliHarnessAdapter`, and optional `onActivityHeartbeat` callback support in `HarnessAgentBase`.

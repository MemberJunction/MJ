---
"@memberjunction/ai-agents": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/core-actions": minor
"@memberjunction/messaging-adapters": minor
"@memberjunction/server": minor
---

Enforce fail-closed Active coordination policy wake gating via batched Simple RunView lookups across all event-driven and scheduled wake paths, coalesce per-(UserID, ApplicationID) event wakes into single bounded wake keys within configurable coalescing windows, and add an AIDP server startup/deployment guard watermark preventing spurious startup or retroactive wakes while preserving recovery of pre-existing pending routines.

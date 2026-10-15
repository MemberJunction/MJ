---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/integration-test-suite": patch
---

A realtime session that runs on the server (a LiveKit meeting bot, a phone call, a Teams meeting) now records its model usage, as browser calls do.

Until now nothing subscribed a bridged session's usage events: its co-agent prompt run finished with zero tokens and no cost, so meetings and calls showed only their delegated runs' cost.

- `WireBridgeRealtimeSession` subscribes the session's `OnUsage` and adds the usage to the session's co-agent prompt run through `AccumulatePromptRunUsage`, 10 s after the first unwritten update and once more before the run is finalized. The run is priced at finalize from its final counts, and the co-agent run's totals follow.
- Per-modality usage goes into the run's `RealtimeUsage` record (`ModelSpecificResponseDetails`), with the same rules browser calls use (`AddRealtimeUsageRecord`, `MergeRealtimeUsageRecord`).
- The record gains `DurationSeconds`, the provider's session duration so far (GPT-Live reports it): a running total that keeps the larger value. Only a server-side session writes it; `ParseRealtimeUsageRecord` drops it from a relayed record.
- A replaced model session (a recovery after the model dropped) keeps its usage on its own run; the replacement records on its own.
- Usage a session reports after its run was finalized is not stored, and the first such update is logged. Up to 10 s of usage per live session can be lost when MJAPI stops without closing its sessions.
- The Gemini server driver now reports the response's split by modality (`responseTokensDetails`) as `OutputTokenDetails`, beside the prompt's split, and VIDEO tokens as `VideoTokens` in both directions (the browser client's table: TEXT, AUDIO, IMAGE, VIDEO). A report whose counts are all in other modalities keeps no block.
- New deterministic check RD15: a bridged session's usage lands on its co-agent prompt run before finalize prices it, and usage after close is not stored.

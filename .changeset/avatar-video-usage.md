---
"@memberjunction/ai": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/integration-test-suite": patch
---

Avatar video in realtime usage and cost. The Gemini browser client counts the seconds of avatar video a model turn generated from the fragments' durations (Core's fragmented MP4 reader gains track timescales and `Fmp4VideoSeconds`), until `generationComplete` (an interrupted turn counts what arrived before `interrupted`), and emits them once, as amounts, in `OutputTokenDetails.VideoSeconds`; it also reads Google's response-side token split, VIDEO included (`RealtimeUsageModalityDetail.VideoTokens`). The runtime relays the full input and output detail blocks, and an update that carries only video seconds; `RelayRealtimeUsage` takes them as an optional `usageDetailsJson` argument, and `AccumulatePromptRunUsage` adds them into the co-agent prompt run's `ModelSpecificResponseDetails.RealtimeUsage` record, with the stored video seconds capped at the run's elapsed time plus 30 seconds. At finalize, a run whose model vendor configuration has `Realtime.Pricing.AvatarVideoOutput` (per minute) is priced at its cost row plus a video line, the video's output tokens leave the cost row's output bucket, and the lines are written under `CostLines`; without that price the run prices as before. The agent-run analytics cost card shows the avatar video on its own line and no longer prices the video's tokens as output. Integration check RD16 stores a minute of avatar usage on a co-agent-shaped prompt run for Gemini 3.8 Live on Vertex AI, finalizes it, and checks its cost lines.

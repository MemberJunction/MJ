---
"@memberjunction/ai": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-conversations": patch
---

fix(realtime): confirm whiteboard agent edits only when the tool succeeded, and source inbound-video capability from per-model profile data

Review follow-ups to #4512.

- **A failed whiteboard tool no longer reports success to the model.** `ApplyAgentTool` pushed a confirmation frame and a "visual confirmation of your action — do NOT narrate or announce your own change" note unconditionally, including when the tool returned `{ success: false, error }` (invalid JSON arguments, unknown tool, per-tool validation). The model received its failure result alongside an assertion that the edit had landed, plus an instruction not to mention it — so a failed edit disappeared from the user's view. It also pushed a frame identical to the previous one, since a failed tool mutates nothing.
- **Inbound-video capability and its frame-rate ceiling are now per-model data.** `GeminiLiveModelProfile` gains `MaxInboundVideoRate`, the mint carries both it and `SupportsInboundVideo` in the session config, and the browser driver reads them instead of inferring capability from the model id with `startsWith('gemini-3.8-live')`. That sniff and the profile table were two answers to one question, agreeing only because the model names happened to line up; a model that broke the naming pattern would have diverged silently. A future model that accepts a faster feed now declares it in the profile and every consumer follows.
- **The whiteboard channel is change-driven with no liveness heartbeat.** Its `WHITEBOARD_HEARTBEAT_MS` constant could never fire — the elapsed check lived inside the mutation path, which an idle board never enters — so it read as a liveness guarantee while providing none.
- `RealtimeTrack.Descriptor`'s doc now states that negotiation refinement covers `Rate` only, so no one reads `Encoding` or `UsageBasis` off a live track expecting the model's answer.

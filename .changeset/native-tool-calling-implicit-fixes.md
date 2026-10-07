---
'@memberjunction/ai-agents': minor
'@memberjunction/ai-prompts': patch
'@memberjunction/ai-gemini': patch
'@memberjunction/ai-vertex': patch
'@memberjunction/ai-anthropic': patch
'@memberjunction/ai': patch
'@memberjunction/core-entities': patch
'@memberjunction/testing-engine': patch
---

fix: native tool calling — object action params, a one-turn `complete_task` finish, an implicit-mode Loop prompt, and Gemini thought signatures across failover

Found running Skip's Query Writer on Gemini 3 Flash with native implicit control flow. `Simple Object` action params are declared as `object` and a JSON-string argument is decoded before the Action runs (`Other` stays `string`). A new `complete_task` control tool applies the final payload change and completes in one turn; its `payloadChangeRequest` is a JSON string because the forced final turn is schema-constrained and an open object decodes as `{}`, and the final permitted turn now forces `complete_task` instead of `'none'` (downgraded to `'none'` for hybrid models). The Loop system prompt's implicit mode no longer tells the model to answer in a JSON envelope, and unreadable JSON text is a Retry rather than a final answer that drops its payload. The Gemini driver records where a thought signature was minted and replays it only there, so a failover between Google AI Studio and Vertex AI no longer fails with a 400 "Corrupted thought signature." A model that rejects a forced tool choice gets `'auto'` instead: Claude Opus 5.5 and Sonnet 5.5 through a new catalog flag, `LLM.SupportsForcedToolChoice: false`, and any Claude request using budget thinking in the Anthropic driver. Envelope and hybrid prompts render byte-identically.

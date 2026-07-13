---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ng-conversations": patch
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": patch
---

Loop agents can now stream their final reply as live text, gated by a new per-agent opt-in: `AIAgent.EnableFinalResponseStreaming` (default OFF — a developer must explicitly enable streaming for each agent, via a new "Stream Final Response" card on the AI Agent form or metadata). A new per-turn `LoopAgentStreamExtractor` incrementally parses the streamed JSON turn envelope and re-emits the root-level `message` text as `kind:'final-response'` deltas — but only for the root agent on a `taskComplete: true` turn — which the conversation client (5.45's streaming render path) types into the chat bubble as it's generated. Raw envelope chunks keep flowing unchanged for existing consumers; non-final turns, sub-agent turns, and nested `message` keys are never emitted; if a model emits `message` before `taskComplete`, the text is buffered and flushed once finality is known. Agent types opt in via the new `BaseAgentType.CreateFinalResponseStreamExtractor()` virtual (default null). Also exports the `AgentStreamChunkKind` union from ai-core-plus as the source of truth for the chunk `kind` discriminator.

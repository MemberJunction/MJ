---
"@memberjunction/core": minor
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/sql-converter": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-core-entity-forms": patch
---

Agent conversation compaction: durable cross-turn summaries stored on the conversation (Sequence + SummaryPromptRunID, budget knobs on AIAgentType/AIAgent, Compaction run steps), conversation-history retrieval tools (getMessageBySequence, getMessagesByRange, searchConversation, summarizeRange), edit handling with OriginalMessageChanged flagging and a wired chat edit affordance, plus hardening fixes: failed message expansions now surface a reason to the model (breaks an unbounded retry loop), json5 ESM import fix restores the local JSON-repair tier, and SQLConverter no longer truncates PG column comments at escaped apostrophes.

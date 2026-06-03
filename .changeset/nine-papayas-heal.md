---
"@memberjunction/ai": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/ai-anthropic": minor
"@memberjunction/ai-azure": minor
"@memberjunction/ai-bedrock": minor
"@memberjunction/ai-cerebras": minor
"@memberjunction/ai-fireworks": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-groq": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
---

Loop agent prompt improvements for cache optimization. Capture cache-read and cache-write token counts from every LLM provider that reports them (Anthropic, OpenAI, Gemini, Groq, Cerebras, Fireworks, Azure, Bedrock) and surface them on AI Prompt Runs and Agent Runs. Adds `CacheReadTokens`/`CacheWriteTokens` columns to `AIPromptRun` (migration included — run CodeGen after applying), normalizes cache-token accounting in `baseModel` so usage totals are consistent across providers, and enables Gemini implicit/explicit cache reporting. The Prompt Run form and Agent Run analytics now display cache hit/write token breakdown

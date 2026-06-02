---
"@memberjunction/ai": minor
"@memberjunction/ai-anthropic": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-groq": minor
"@memberjunction/ai-cerebras": minor
"@memberjunction/ai-fireworks": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Capture provider prompt-cache token usage across LLM providers and surface it on AI Prompt Runs.

`ModelUsage` gains optional `cacheReadTokens` / `cacheWriteTokens`. Provider adapters now populate
them from each provider's reported usage, normalizing the differing conventions (Anthropic reports
`input_tokens` EXCLUDING cached tokens with separate `cache_read_input_tokens` /
`cache_creation_input_tokens`; OpenAI/Gemini/Groq/Cerebras/Fireworks INCLUDE cached tokens in the
prompt count and report the cache-read subset at `prompt_tokens_details.cached_tokens`). The
Anthropic adapter previously read a non-existent `cached_tokens` field, so cache usage was never
captured — it now reads the real fields on both the non-streaming and streaming paths, and supports
an optional `ANTHROPIC_CACHE_BREAKPOINT` marker to place a `cache_control` breakpoint between a
stable prefix and volatile suffix.

Adds `TokensCacheRead` / `TokensCacheWrite` columns to `MJ: AI Prompt Runs` (informational token
counts; no cost-formula change); `AIPromptRunner` persists them. The AI Agent Run Analytics tab
shows a "Prompt Cache" summary card with cached-token totals aggregated from the run's prompt runs.

Run CodeGen after applying the migration to regenerate entity types and metadata.

---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

AI model & vendor metadata refresh (off-cycle research run for v6.2.0-edge.2, 2026-10-02).

- Adds **Claude Sonnet 5.5** (`claude-sonnet-5-5`, released 2026-09-28) on Anthropic, Amazon Bedrock and OpenRouter at $2/$10 per 1M, cache read $0.20.
- Adds **GPT-6.1 Sol** (`gpt-6.1-sol`, released 2026-09-29) on OpenAI, Azure, Amazon Bedrock and OpenRouter at $2/$10 per 1M, cache read $0.10. No Azure cost row: Microsoft has not published the rate.
- Adds the missing cost rows for Claude Opus 5.5 on Bedrock ($4/$20) and GPT-6 Sol ($2/$10) and GPT-6 Luna ($0.10/$0.50) on Azure, and a GLM 5.3 OpenRouter row ($1.40/$4.40). GLM 5.3's OpenRouter output cap becomes 131,072.
- Re-rates Groq GPT-OSS-120B ($0.15/$0.60) and GPT-OSS-20B ($0.075/$0.30), Cerebras GPT-OSS-120B ($0.35/$0.75) and Z.AI GLM 5.1 ($1.40/$4.40), expiring the superseded rows.
- Retires seven routes their vendors have already shut down: Cerebras `gemma-4-31b` and `llama3.1-8b`, Fireworks `glm-5p2`, Google `gemini-3-pro-image-preview`, `gemini-2.0-flash` and `gemini-2.0-flash-lite`, and Groq `compound-beta` (Groq Compound becomes inactive).

---
"@memberjunction/core": minor
---

Restores two `MJ: AI Prompt Models` rows on **Sage - System Prompt** that the v5.38 Gemini 3.5 Flash migration deleted although its commit message says they were left untouched: Gemini 3.1 Flash-Lite through Google at priority 20 (`608B38EC`), and GPT-OSS-120B through Cerebras for the Sage Text configuration at priority 22 (`14AD0B61`). Without the first, an install with a Gemini API key but no Vertex AI or Cerebras key ran every Sage request on the OpenAI last resort, GPT 5.5 Instant. The rows keep their original IDs, and their `sync` blocks are dropped so the next push re-creates them.

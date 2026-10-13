---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

AI model & vendor metadata refresh (weekly research run, 2026-09-14).

- Adds **Sakana AI** as a vendor and its two orchestration models, **Fugu Max** (`sakana/fugu-max`, $2/$6 per 1M) and **Fugu Ultra v2** (`sakana/fugu-ultra-v2`, $5/$30 per 1M short-context), both routed through OpenRouter.
- Corrects **GPT 5.6** (Sol) pricing: the $5/$30 cost row is expired at 2026-08-21 and replaced by OpenAI's current $4/$20 rate (cached input $0.40), which OpenAI guarantees only through 2026-11-21.
- Adds the missing **DeepSeek V4.1 Flash** OpenRouter cost row ($0.15/$0.60 off-peak, $0.003 cache read).
- Corrects the **GLM 5.3** OpenRouter context window (200,000 → 1,310,720) and refreshes its description, which still claimed no rate card had been published.

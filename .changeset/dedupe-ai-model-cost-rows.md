---
"@memberjunction/aiengine": minor
---

Removes four duplicate `MJ: AI Model Costs` entries from `metadata/ai-models/.ai-models.json`. Llama 4 Maverick, Llama 4 Scout (Groq), Claude 4 Sonnet and Claude 4 Opus (Anthropic) each listed the same cost record twice, identical field for field and with the same primary key, so both copies pointed at one database row. No database row changes; the file just stops tripping duplicate-ID checks.

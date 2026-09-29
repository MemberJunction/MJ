---
"@memberjunction/ai-prompts": minor
"@memberjunction/core-actions": minor
---

Image generation now runs through a new `AIImageGenerationRunner`, which fails over between image models and records every call as an AI Prompt Run, so image spend is no longer invisible. The Generate Image action uses it with the same model choice, API key, output params and result codes as before, and a new `Default Image Generation` prompt sets the models it may use.

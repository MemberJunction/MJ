---
"@memberjunction/ai-prompts": patch
---

Refactor prompt-run persistence lifecycle: move chat-specific request/result fields from BaseModelRunner to AIPromptRunner, introduce generic createRunRecord and finalizeRunRecord on BaseModelRunner. No behaviour change: every `MJ: AI Prompt Runs` field is written with the same value as before, and `createPromptRun` / `updatePromptRun` keep their signatures.

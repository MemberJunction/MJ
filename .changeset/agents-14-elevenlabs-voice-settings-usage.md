---
'@memberjunction/core': minor
'@memberjunction/ai': minor
'@memberjunction/ai-elevenlabs': minor
'@memberjunction/ai-engine-base': minor
'@memberjunction/ai-prompts': minor
---

ElevenLabs text-to-speech sends all five voice settings in the SDK's camelCase shape, so `similarity_boost` and `use_speaker_boost` are no longer dropped (#4863), and reports its usage as the input text's characters (#4865). New price unit type `Per 1K Characters` (`Linear`, Characters, 1,000 per billing unit). ElevenLabs cost rows are not added yet: the rate depends on the account's plan.

---
"@memberjunction/ai-prompts": patch
---

A prompt run whose model turn answered only with tool calls no longer records `ErrorMessage` "Failed to parse result into expected format; raw output saved instead". Such a turn has no text to parse, so the empty result is expected. Every native tool-calling agent turn used to carry the message, which hid real errors when debugging. An empty text-only turn still records it.

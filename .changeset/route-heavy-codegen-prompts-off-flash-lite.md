---
"@memberjunction/cli": patch
---

fix(codegen): route heavy CodeGen prompts off Gemini Flash-Lite to OpenAI (issue #2765)

The two heavy CodeGen prompts -- "CodeGen: Smart Field Identification" and "CodeGen: Form Layout Generation" -- had model candidate lists that topped out at Gemini 3.1 Flash-Lite (Priority 11/12). On these large prompts Flash-Lite returns 0 output tokens, producing empty output and breaking CodeGen's advanced generation.

Adds a forward migration that raises the existing OpenAI 'GPT 5.5 Instant' `AIPromptModel` row for each of these two prompts to Priority 20 -- above every Gemini candidate -- so the prompt runner selects OpenAI first (validated live to return parseable output). Gemini rows remain in place as lower-priority fallbacks. The UPDATEs reference the prompts/model by name and are idempotent.

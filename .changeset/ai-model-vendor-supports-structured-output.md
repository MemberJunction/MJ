---
"@memberjunction/ai": minor
"@memberjunction/ai-prompts": minor
---

Add a vendor-level `AIModelVendor.SupportsStructuredOutput` capability that marks a specific model × inference-provider pairing as supporting native, provider-enforced structured output (constrained JSON decoding against a schema).

- **`@memberjunction/ai`** — `BaseLLM` gains a `SupportsStructuredOutput` virtual getter (code-level default `false`; DB metadata overrides, same precedent as `SupportsPrefill`), and `ChatParams` gains a `supportsStructuredOutput?: boolean` hint.
- **`@memberjunction/ai-prompts`** — `AIPromptRunner` threads the capability through model selection (`ModelVendorCandidate` → `ModelSelectionResult`, populated from the vendor only — no model-level fallback) and the execution path (`executeWithValidationRetries` → `executeModelWithFailover` → `executeModel`). `executeModel` sets `ChatParams.supportsStructuredOutput = true` only when the selected vendor supports it **and** the effective `responseFormat` requests structured JSON (`'JSON'` | `'ModelSpecific'`).

Safe-by-default: the `ChatParams` flag is a capability hint, not a schema. Drivers that implement constrained decoding can honor it (e.g. attach a provider `json_schema` response format); drivers that don't ignore it, so enabling the flag never changes behavior for a provider lacking the capability — preserving cross-provider portability. Per-provider constrained-decoding implementations and schema derivation from a prompt's `OutputExample` are follow-up work.

---
"@memberjunction/core": minor
"@memberjunction/ai": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-openrouter": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add `GeminiDecision`, a `BaseDecision` driver for Google's Gemini Decisions API (`POST https://generativelanguage.googleapis.com/v1beta/decisions`), and the `Gemini Decision 1` model (type Decision, `PowerRank` 61, $0.10 per million input tokens, no output charge; up to 1,000 questions, 255 Choice options and 255 Score levels per call, 262,144 input tokens) with two Inference Provider routes: Google direct (`GeminiDecision`, `gemini-decision-1`, preferred) and OpenRouter (`OpenRouterDecision`, pinned `google/gemini-decision-1-20261111`). Gemini's questions and answers use the System One shape, so `GeminiDecision` extends `BaseHostedSystemOneDecision` and adapts the `x-goog-api-key` header, `input` in place of `state`, `total_input_tokens`/`total_output_tokens` usage, and `prompt_feedback.block_reason` input-filter blocks (which fail with the block reason as a failover-eligible `ModelError`). Google's `400` (`INVALID_ARGUMENT` and `invalid_request`) and `403 PERMISSION_DENIED` responses are pinned to failover-eligible `ModelError`, keeping `Default Decision`'s failover loop running while leaving `401` a fatal `Authentication` error. MJ sends text only. `Gemini Decision 1` is not bound to `Default Decision` (which selects `Jev` or `LLM Decision` first), but as an active `Decision` model it joins `Default Decision`'s power-matched fallback list on hosts with a `Google` or `OpenRouter` vendor credential (or `AI_VENDOR_API_KEY__GEMINIDECISION` / `AI_VENDOR_API_KEY__OPENROUTERDECISION`); set `Status = 'Inactive'` on the corresponding model-vendor row to keep `Default Decision` off it.


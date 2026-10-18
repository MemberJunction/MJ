---
"@memberjunction/ai": patch
"@memberjunction/ai-prompts": patch
---

fix(ai): a vendor spend cap now fails over instead of failing the prompt silently.

- `ErrorAnalyzer` classified Anthropic's "You have reached your specified API usage limits" (sent as HTTP 400 `invalid_request_error`) as `InvalidRequest`, which may not fail over — so every prompt whose top candidate was a capped vendor failed outright. It is now `NoCredit`, which fails over to the next vendor.
- `AIPromptRunner` returned a failed result that could not fail over through its success path with nothing logged. It still returns it as-is, but now logs the error type, message, prompt, model and vendor.

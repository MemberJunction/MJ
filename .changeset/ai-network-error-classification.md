---
"@memberjunction/ai": patch
"@memberjunction/ai-gemini": patch
---

A dropped connection to an AI provider is now classified as a `NetworkError` instead of `Unknown` (#2392).

Node's built-in fetch reports a connection failure as `TypeError: fetch failed`, or `terminated` when the socket closes mid-response, and keeps the real reason (`ECONNRESET`, `ENOTFOUND`, ...) on the error's `cause`. SDKs built on fetch, including `@google/genai`, rethrow that error unchanged, so `ErrorAnalyzer` saw no network wording and returned `Unknown`. It now also checks the `cause` chain for Node and undici connection error codes. A prompt whose failover scope is `NetworkOnly` therefore fails over on a real connection failure, and prompt runs record the right error type.

- A plain `AbortError` is still not a network error, because a caller's cancellation looks the same.
- `httpStatusCode` is now only a number in the HTTP range. It used to pick up a system error code (`'ECONNRESET'`) or a DOMException's legacy number (`20`) from `code`.
- New Gemini test `geminiNetworkErrors.test.ts` drives the real SDK against local sockets that refuse, reset, close mid-response or fail DNS.

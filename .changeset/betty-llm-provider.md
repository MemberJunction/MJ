---
"@memberjunction/ai-betty": minor
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Add `@memberjunction/ai-betty` — a `BaseLLM` provider for **Betty**, the MJ-native
organization-scoped assistant, registered as `BettyLLM`.

This sits **alongside** `@memberjunction/ai-betty-bot` rather than replacing it. The two target
different services with different wire protocols: `BettyBotLLM` exchanges its key for a JWT at
`POST /settings` and posts `{ input }` to `POST /response`; `BettyLLM` uses the API key directly as
a bearer and posts `{ message, conversationId }` to `POST /messages`.

**No breaking change.** `@memberjunction/ai-betty-bot` is untouched, so no existing deployment has
to move and nobody needs to be contacted or given a deadline. Both can run in one instance;
migrating a deployment is repointing one `AIModelVendor.DriverClass` from `BettyBotLLM` to
`BettyLLM`, and rolling back is repointing it back.

A separate driver class rather than a configuration mode on the existing one, because
`GetAIAPIKey()` is keyed by driver class — one class serving both protocols would read a single
`AI_VENDOR_API_KEY__BETTYBOTLLM` for two unrelated services, and a misconfiguration would silently
send a customer's key to the wrong host.

Configuration: `BETTY_API_BASE_URL` (required, no default — Betty is deployed per customer, so a
default risks answering from the wrong tenant) and `AI_VENDOR_API_KEY__BETTYLLM`.

Notes:

- Citations keep the legacy response shape (`choices[1]` formatted, `choices[2]` raw JSON with
  `finish_reason: 'references_json'`), so anything already parsing `BettyBotLLM` output survives a
  `DriverClass` repoint.
- Multi-turn is handled correctly. The legacy provider uses `messages.find(m => m.role === user)`,
  which returns the *first* match and silently discards follow-ups; this provider sends the latest
  user turn and passes the earlier ones as advisory, non-authorizing `context.text`.
- Streaming is not implemented yet (`SupportsStreaming` is `false`). The API does support SSE via
  `Accept: text/event-stream`, so this is a follow-up rather than a dead end.

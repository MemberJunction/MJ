# @memberjunction/ai-betty

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [f3c6161]
- Updated dependencies [5148534]
- Updated dependencies [ce1a5c3]
- Updated dependencies [4d647e6]
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/network-utils@6.2.0-edge.2

## 6.2.0-edge.1

### Minor Changes

- 48f77ea: Add `@memberjunction/ai-betty` — a `BaseLLM` provider for **Betty**, the MJ-native
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
    which returns the _first_ match and silently discards follow-ups; this provider sends the latest
    user turn and passes the earlier ones as advisory, non-authorizing `context.text`.
  - Streaming is not implemented yet (`SupportsStreaming` is `false`). The API does support SSE via
    `Accept: text/event-stream`, so this is a follow-up rather than a dead end.

### Patch Changes

- Updated dependencies [a50948e]
- Updated dependencies [15a4333]
- Updated dependencies [5da3ad2]
- Updated dependencies [e1dd673]
- Updated dependencies [c261eb8]
- Updated dependencies [1d43161]
- Updated dependencies [80905a1]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/network-utils@6.2.0-edge.1

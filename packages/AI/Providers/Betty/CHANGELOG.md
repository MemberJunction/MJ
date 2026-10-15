# @memberjunction/ai-betty

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [8bac4d6]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [22c9074]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [afe9eb4]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/network-utils@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [bea2386]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/network-utils@6.2.0-edge.3

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

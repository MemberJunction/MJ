---
"@memberjunction/ai": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-agents": patch
"@memberjunction/actions-base": patch
"@memberjunction/core-actions": patch
---

A run can now be restricted to the credentials its caller supplied, so a customer's work never silently runs on the platform's AI keys.

Key resolution matched per driver class and fell back to the platform for any class the run did not key. A host running work on a customer's own key had no way to say "only these keys": when the customer's Google key was rejected, failover moved to Vertex, found no customer key, and finished the run on the platform's account — reporting success. Internal prompts that dropped `apiKeys` (AI JSON repair, the parallel result selector) reached the platform key the same way with no failover at all.

- **`CredentialScope: 'Any' | 'RuntimeOnly'`** (`AICredentialScope` in `@memberjunction/ai`) on `ExecuteAgentParams` and `AIModelRunParams` (so `AIPromptParams`). Omitted means `'Any'` — no behaviour change. `'RuntimeOnly'` allows only `apiKeys` and a prompt's per-request `credentialId`: every platform source — `AICredentialBinding`s, the vendor's default credential and `AI_VENDOR_API_KEY__*` — is skipped.
- Every scope decision goes through `CredentialScopeAllows(scope, source)` in `@memberjunction/ai`, where `source` is an `AICredentialSource` — `'Runtime'`, `'PlatformCredential'` or `'Environment'`. Its exhaustive switch makes a new scope value a compile error until it is answered, and an unknown value at runtime throws rather than falling back to the platform.
- Enforced in `BaseModelRunner.HasCredentialsAvailable` and `ResolveCredentialForExecution`, which every runner shares. Because candidate selection uses the first, failover stays on vendors the caller keyed; a run they do not cover fails with "No suitable model found … credential scope is RuntimeOnly" instead of running on the platform's key.
- `BaseAgent` carries the scope to every prompt, sub-agent, action, realtime delegate and realtime session in the run. `GetAIAPIKey` and `MakeAIAPIKeyResolver` take an optional `scope`; `RealtimeClientSessionService` drops its `getAPIKeyForDriver` seam under `'RuntimeOnly'`; image and media runner params gain `CredentialScope`.
- `@memberjunction/actions-base`: `RunActionParams.CredentialScope` (`RuntimeCredentialScope`). Under `'RuntimeOnly'` the `RuntimeAPIKeyResolver`'s answer is final. `Generate Image` honours it.
- **Prompts started on a run's behalf now run under its scope** — user, provider, configuration, `apiKeys`, `credentialId`, `CredentialScope` — via the new `PickPromptExecutionScope` / `AIPromptExecutionScope`: AI JSON repair, the parallel `PromptSelector` judge, `BaseAgent`'s summarize-range and message-compaction sub-calls, conversation compaction (`CompactIfNeededInput.ExecutionScope`) and conversation naming. Each forwarded `contextUser` at most, so each ran on platform keys and the default configuration inside a customer's run. This applies whatever the scope.
- `ErrorAnalyzer` classifies Google's invalid-key response ("API key not valid", `API_KEY_INVALID`, HTTP 400) as `Authentication`. It fell through to `VendorValidationError`, so an invalid key failed over to another vendor instead of failing.
- **A failed streaming call keeps its driver's classification.** `BaseLLM` rejects a failed stream with its `ChatResult`, not an `Error`. The prompt runner analyzed that object afresh, so an invalid key the driver classified `Authentication`/`Fatal` became `Unknown`/`Transient` with no message: failover continued onto the same dead key, agents retried the step up to their consecutive-failure limit, and every run recorded "Unknown error". `ErrorAnalyzer` now returns an `errorInfo` the value already carries, and the runner records a rejected `ChatResult` as an `Error` with its real message. Affects any streamed prompt with a non-retryable error, whatever the credential scope.

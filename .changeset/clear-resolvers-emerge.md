---
"@memberjunction/ai-prompts": minor
---

Extract `ModelResolver` as the public model + vendor selection and cross-vendor failover primitive (PR #2471, Phase 1).

The model+vendor candidate-building, credential pre-flight, and failover loop that were previously private to `AIPromptRunner` now live on a public `ModelResolver` singleton in `@memberjunction/ai-prompts`. `AIPromptRunner.ExecutePrompt` continues to behave identically — same selection algorithm, same vendor failover order, same `MJ: AI Prompt Runs` record contents — it just delegates.

New public API:
- `ModelResolver.Instance.ResolveForPrompt(prompt, overrides?, contextUser?)` — drive selection from an `MJAIPrompt` entity (honors `SelectionStrategy`, `AIPromptModel` bindings, `AIConfiguration` inheritance, `RequireSpecificModels`, `MinPowerRank`, `PowerPreference`).
- `ModelResolver.Instance.ResolveForRequirements(req, contextUser?)` — drive selection from a flat parameter object for non-prompt callers (embeddings, rerankers, ad-hoc LLM calls, image-gen).
- `ModelResolver.Instance.WithFailover<T>(candidates, fn, options?)` — execute an arbitrary async function across the candidate list with the runner's full error-classification, vendor filtering, rate-limit retry, and `ContextLengthExceeded` short-circuit logic.
- `ModelResolver.Instance.ResolveCredential(driverClass, targets, options?)` — walk the 7-tier credential hierarchy.
- `ModelResolver.Instance.HasCredentialsAvailable(...)` — synchronous in-memory pre-flight check.
- `ModelResolver.Instance.IsInferenceProvider(modelVendor)` — vendor-type predicate, also used by the runner's surviving `executeModel` and `createPromptRun`.

`FailoverStrategy='None'` is preserved verbatim — `WithFailover` short-circuits to a single attempt with no list-walking on failure (the prompt designer's hard-fail escape hatch, audit §3.5.8).

Also re-publishes the `AIPrompt.FailoverStrategy` CHECK constraint as a clean `IN (...)` form (drops the redundant `OR FailoverStrategy IS NULL` clause that broke the CodeGen parser and produced duplicated TypeScript-union literals like `'None' | 'None'`).

This is the foundation for the audit's Phase 2+ retrofits, which will route the 14 hard-gap call sites identified in `MODEL_VENDOR_FALLBACK_AUDIT.md` (embeddings, the GraphQL `ExecuteSimplePrompt` mutation, the Templates `{% AIPrompt %}` extension, the `Generate Image` action, etc.) through the new resolver to inherit cross-vendor failover.

---
"@memberjunction/ai": patch
"@memberjunction/server": patch
---

Fix `ExecuteSimplePrompt`: four stacked defects in model selection, each reporting as something else (#3532)

`ExecuteSimplePrompt` could not run at all, and every failure pointed somewhere other than its cause.

1. **A model row with a null `DriverClass` threw while BUILDING the candidate list.**
   `AIAPIKeys.GetAPIKey` did `AIDriverName.toUpperCase()`, so one malformed row took out prompt
   execution entirely with `Cannot read properties of null (reading 'toUpperCase')`, naming neither
   the row nor the operation. A driver-less row has no key — that is an answer, and every caller
   already handles a falsy one.

2. **`AIModelType` is a virtual column that is not populated on the engine's model objects**, so the
   LLM filter matched nothing and the caller was told *"No AI models with valid API keys found"* — a
   message about keys for a problem with nothing to do with keys, which sends you to your
   environment. Selection now resolves the type through `ModelTypesByID` (an ID lookup that cannot be
   absent), with the virtual column as a fallback rather than the source of truth.

3. **`DriverClass` lives on the model's VENDOR now**, so `GetAIAPIKey(model.DriverClass)` could never
   match and the list stayed empty — the same misleading key message again.

4. **`APIName` also moved to the vendor**, so `chatParams.model` went out empty and the provider
   answered 404 with an empty error message, which reads as "that model doesn't exist" and sends you
   to a model list where the model is plainly present.

Selection is now vendor-first and uses MJ's own rules rather than a local heuristic: for each Active
LLM model, its Active **inference-provider** vendors (`AIEngine.IsInferenceProvider` — the same
predicate `AIPromptRunner` selects with) in `Priority` order, and the first whose `DriverClass`
resolves an API key wins. Deliberately not "any vendor whose driver class ends in LLM": a vendor can
be attached to a model as its *developer* without serving an endpoint.

The model and its chosen vendor are returned as a pair rather than stamped onto the model entity —
those entities are the engine's process-wide cache, so writing the winning driver onto one would leak
into every other caller and make the next request's answer depend on this one's.

Both of the issue's asks beyond the fix are covered: the failure message now says **which** of the
three walls was hit (no LLM models / no Active inference vendor / no key resolved), and an empty wire
name is refused client-side with the row to fix instead of being sent and 404'd.

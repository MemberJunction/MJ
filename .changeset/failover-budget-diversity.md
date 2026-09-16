---
'@memberjunction/ai-prompts': patch
'@memberjunction/ai-core-plus': patch
---

`FailoverMaxAttempts` was read into `failoverConfig.maxAttempts` and then consulted by nobody — its only readers have no callers — so `executeModelWithFailover` walked the FULL priority-ordered candidate list, which for a prompt without `RequireSpecificModels` is every active model of the prompt's type crossed with every active inference vendor (317 entries on a stock tenant), with `executeWithValidationRetries` wrapping the whole walk in `MaxRetries + 1` passes. The cap is now applied where calls are issued: it counts only requests a provider actually saw, so a keyless tail costs nothing, and a non-positive configured value is treated as unconfigured rather than as "no calls allowed".

The failover budget bounds what a prompt SPENDS, not who it asks. A priority-ordered candidate list is usually the same driver class repeated across vendors and models, so three attempts are three requests to one upstream having one bad minute, and the prompt fails without any other provider being asked. That is the ordinary shape on a tenant fronted by a single metered provider, not an edge case.

When every attempt so far went to ONE driver class, the walk now continues **without spending** — same-class candidates are skipped, not called — until the first credentialed candidate on a different class, and allows exactly one call there. The extra call adds its own class to the attempted set, so `size === 1` is false at every later candidate: the ceiling is `FailoverMaxAttempts + 1` and never more, the scan issues no requests of its own, the credential skip still applies (a keyless provider is never called to satisfy the rule), and `lastError` semantics are unchanged. A walk that already spread across several providers is unaffected.

The "no suitable model found" message now names the distinct driver classes behind the candidate list and which of them hold credentials, so a failure reads `101 candidates over 1 driver class (OpenRouterLLM); credentialed: none` instead of a bare candidate count that reads like a misconfigured chain. Candidates the short-circuit never probed are reported as such, so `credentialed: none` is not over-read. `AIModelSelectionInfo.modelsConsidered[]` gains an optional `driverClass`, also persisted in `AIPromptRun.ModelSelection`; the message is unchanged for callers that record none.

The message builder moved out of `AIPromptRunner` into `no-model-found-message.ts`. As a private method its only coverage was a re-implementation of it inside the test file, which asserted against its own copy — those tests now import the production function.

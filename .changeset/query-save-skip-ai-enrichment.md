---
"@memberjunction/core-entities-server": patch
"@memberjunction/integration-test-suite": patch
---

Saving a query with `SkipEntityAIActions` now skips the LLM enrichment step of query extraction.

Every save of a new query, or of a query whose SQL changed, runs the extraction pipeline, and with an AI vendor key present that includes an awaited LLM call (the `SQL Query Parameter Extraction` prompt) to describe parameters and fields. Nothing could turn it off. `MJQueryEntityServer.Save()` and the re-extraction a matching `MJ: Query SQLs` dialect save triggers now honour `EntitySaveOptions.SkipEntityAIActions`: the deterministic extraction still runs and writes parameters, fields, entities and dependencies, with heuristic descriptions in place of the LLM's, exactly as when the call fails. Without the option nothing changes. `RerunExtraction()` takes an optional `skipAIEnrichment` argument.

The integration bundles that create queries (runquery-rendering, runquery-cache, runquery-features, materialized-read, server-cache) no longer make that call: they create their queries through `DeterministicEntityFactory`, which opts each instance out (`SkipAIEnrichment`), and the deterministic tier switches save-time prompts off for the run. They assert only on deterministic extraction, and the deterministic tier is meant to need no credentials, but with keys present IT102 made about 80 paid LLM calls and timed out at 300 s. It now passes 13/13 in 39 s with keys present.

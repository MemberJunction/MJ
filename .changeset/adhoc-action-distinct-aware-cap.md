---
"@memberjunction/core-actions": patch
---

Route `RunAdhocQueryAction.ensureRowLimit` through `QueryPagingEngine.WrapWithMaxRows` instead of the regex it had been using. The prior regex produced invalid T-SQL for `SELECT DISTINCT …` inputs (injecting `TOP N` between `SELECT` and `DISTINCT`, but T-SQL requires `SELECT DISTINCT TOP N`), silently dropped the cap on `WITH`/CTE-headed inputs, and only capped the first branch of `UNION`/`INTERSECT`/`EXCEPT` queries. The agent's "Run Ad-hoc Query" tool routinely emits DISTINCT and was getting stuck in retry loops because every SQL it generated got mangled. Delegating to the AST-based path picks up the full DISTINCT / set-op / CTE / TOP-PERCENT / WITH-TIES handling already in place for saved queries via `RenderPipeline`, plus the hard-ceiling enforcement added on this branch.

---
"@memberjunction/ai-prompts": patch
"@memberjunction/core-actions": patch
---

Follow-ups from the review of #5063.

- A rejected model call that carries an `errorMessage` but no `errorInfo` keeps the classification its message implies (`RateLimit`, `Authentication`, `ContextLengthExceeded`). #5063 made it read as `Unknown`/`Transient`, because the raw result has no `message` for `ErrorAnalyzer` to read. Only out-of-tree drivers reject this way.
- Run Ad-hoc Query no longer drops a failed analysis. With `ReturnType` `analysis only` it now fails (`ANALYSIS_FAILED`, with the reason) instead of returning `SUCCESS` with no analysis; with `data and analysis` it returns the data plus an `AnalysisError` and says why there is no analysis. The analysis fails by design under a `'RuntimeOnly'` credential scope.

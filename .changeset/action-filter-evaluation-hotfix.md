---
"@memberjunction/actions": patch
---

Implement Action Filter evaluation — `ActionEngineServer.RunSingleFilter` was a `return true` stub, making every Action Filter a no-op. Filters now resolve via a registered `BaseActionFilter` subclass (ClassFactory, keyed by filter ID) or by evaluating the filter's `Code` column with an `ActionFilterContext`, cached per row version. Failure semantics are fail-closed: a filter that throws, yields a non-boolean, or has no evaluable logic prevents the action and logs the reason. No shipped metadata contains ActionFilter rows, so no existing behavior changes.

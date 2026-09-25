---
"@memberjunction/ai-agents": patch
---

A `While` loop whose condition cannot be evaluated now fails instead of silently succeeding.

`executeWhileIterations` treated "the evaluator could not evaluate the condition" exactly like "the condition is false". It broke out of the loop, discarded the evaluator's error, and `completeWhileLoop` finalized the step as a success, reporting "after 0 iteration(s)". A malformed or disallowed condition — an assignment, a parse error, a property read on `undefined` — produced a green, zero-iteration loop with the cause recorded nowhere.

- An unevaluable condition is now recorded as a loop error carrying the evaluator's message, so the loop step finalizes with `success: false`.
- If the condition fails before the first iteration, the loop returns a `Failed` step with that message instead of completing.
- If it fails mid-loop, the earlier results are kept and the message returned to the model says the loop stopped, and why.
- Loop step error messages (`While` and `ForEach`) now render each error's text. Joining the raw error objects had written `[object Object]` into the step's `ErrorMessage`.

A loop whose condition evaluates normally behaves exactly as before, including the message returned to the model.

From the typed-decision plan (#4660), Phase 0 Task 0.8.

---
"@memberjunction/ai-agents": patch
---

A `While` loop whose condition cannot be evaluated now fails instead of silently succeeding.

`executeWhileIterations` treated "the evaluator could not evaluate the condition" exactly like "the condition is false". It broke out of the loop, discarded the evaluator's error, and `completeWhileLoop` finalized the step as a success, reporting "after 0 iteration(s)". A malformed or disallowed condition — an assignment, a parse error, a property read on `undefined` — produced a green, zero-iteration loop with the cause recorded nowhere.

- An unevaluable condition is now recorded as a loop error carrying the evaluator's message, so the loop step finalizes with `success: false`.
- If the condition fails before the first iteration, the loop returns a `Failed` step with that message instead of completing.
- If it fails mid-loop, the earlier results are kept, and the loop-results message the model sees lists the condition error under `Errors`.
- A Loop agent's model is now shown the error whenever a loop fails before its first iteration: a `While` condition that cannot be evaluated, an invalid `While` or `ForEach` configuration, or a `ForEach` collection that is not an array. It arrives as the usual loop-results message, with the error under `Errors`. A Loop agent answers a `Failed` step by prompting again, and nothing on that path showed the model the step's error, so it got another turn with nothing new to go on.
- Loop step error messages (`While` and `ForEach`) now render each error's text. Joining the raw error objects had written `[object Object]` into the step's `ErrorMessage`.

**What you will notice:** a Flow agent whose `While` condition cannot be evaluated, and which has no outgoing path from that step, now ends `Failed` where it used to end `Success`. A Loop agent whose model writes such a condition sees the evaluator's error on its next turn.

A loop whose condition evaluates normally behaves exactly as before, including the message returned to the model.

From the typed-decision plan (#4660), Phase 0 Task 0.8.

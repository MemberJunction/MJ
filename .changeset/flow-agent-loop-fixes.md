---
"@memberjunction/ai-agents": minor
---

Flow agent loop fixes: correct loop-body action resolution + static collections

- **Fix**: ForEach/While loop-body **Action** steps now resolve against the standard Action registry (`ActionEngineServer.Instance.Actions`) instead of the legacy AI Actions collection (`AIEngine.Instance.Actions`). Previously any flow loop over a normal Action (e.g. Google Custom Search) failed with "Action not found for loop body" even though the action existed and ran fine as a non-loop step.
- **Feature**: ForEach `collectionPath` now supports a `static:[...]` literal collection (e.g. `static:[1,2,3,4,5]`), letting a flow iterate a fixed list/range without a prior step to build the array in the payload.

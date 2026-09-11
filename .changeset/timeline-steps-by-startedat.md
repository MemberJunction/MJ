---
"@memberjunction/ng-core-entity-forms": patch
---

The AI Agent Run timeline lists steps by `StartedAt` (execution time), not persist time.

A 1ms Artifact Tool whose fire-and-forget INSERT lost a race with the next Execute Agent Prompt was painted *after* that prompt even though its clock was 2ms earlier. `__mj_CreatedAt` is when the INSERT committed; `StartedAt` is when the step actually began. The query and a client-side sort both use `StartedAt` then `StepNumber`, so siblings (and loop children) read in the order the clocks already show.

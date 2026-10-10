---
"@memberjunction/search-engine": patch
"@memberjunction/ng-search": patch
---

Follow-ups from the #4993 review: tests for the semantic floor on the scoped search path (the agent-facing path), a pinned contract for partly tagged `FusionLane` lists, and comments explaining why the server-side `ApplySemanticFloor` may fall back to the raw `Score` while the client-side `PassesSemanticFloor` must not. No behavior change.

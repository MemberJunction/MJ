---
"@memberjunction/core-actions": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/core": patch
---

Tests only: widen tight wall-clock ceilings added since v6.3.0-edge.1 so the publish gate's single shared runner doesn't flake. Pathological-input checks get 2 s; the fast-judge early-return and microtask coalescing checks stay below the timings they prove (500 ms).

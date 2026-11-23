---
"@memberjunction/ai-agents": patch
"@memberjunction/health": patch
"@memberjunction/feature-pipelines": patch
"@memberjunction/ng-conversations": patch
---

Tests: raise tight wall-clock bounds on pathological-input checks (TextToolLibrary ReDoS, template, RouteScrubber, FeaturePipelines numeric coercion) to 500–2000 ms, and the conversations pre-discovery "returns without waiting" checks from 5/15 ms to 45 ms (still below the fake worker's 50 ms delay). They guard against catastrophic backtracking or waiting, not machine speed; v6.3.0-edge.0's publish gate failed a 200 ms bound at 211 ms on a CI runner.

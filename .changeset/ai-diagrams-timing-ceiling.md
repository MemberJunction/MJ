---
"@memberjunction/ai-diagrams": patch
---

Tests: raise the wall-clock ceiling on the two "rejects pathological input quickly" checks from 250 ms to 2000 ms. They guard against quadratic comparison, not machine speed, and failed the v6.2.0-edge.8 publish gate at 807 ms on a CI runner.

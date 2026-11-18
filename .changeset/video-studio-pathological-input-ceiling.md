---
"@memberjunction/video-studio-core": patch
"@memberjunction/video-studio": patch
"@memberjunction/video-studio-render-worker": patch
---

Tests: raise the wall-clock ceiling on the "pathological 50,000-character input" checks from 200 ms to 2000 ms. They guard against quadratic/backtracking scans, not machine speed; one failed the v6.3.0-edge.0 publish gate at 211 ms on a CI runner.

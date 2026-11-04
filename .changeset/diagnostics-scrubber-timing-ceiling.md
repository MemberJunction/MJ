---
"@memberjunction/diagnostics": patch
---

Tests: the four linear-time (ReDoS) guards in `review-scrubber.test.ts` use a 2500 ms ceiling instead of 500 ms. The 1.6 MB case ran 100 ms locally and 765 ms on the v6.2.0-edge.8 publish-gate runner.

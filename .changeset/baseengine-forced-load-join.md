---
"@memberjunction/core": patch
---

`BaseEngine`: a `Config(true)` that arrives while another load is running now reads again once that load finishes, instead of returning its result. The running load may have read before the caller's own writes, so those writes could be missing until something else refreshed the engine. Forced calls that arrive during the same load share one extra read.

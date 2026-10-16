---
"@memberjunction/integration-test-suite": patch
---

IT67 (Content Vectorization) refreshes the AIEngineBase cache after creating its fixture vector indexes. The Vector Indexes cache moved to AIEngineBase, which applies save events only as a debounced full refresh, so the checks looked the new index up before it landed and CV1–CV9 failed.

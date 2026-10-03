---
"@memberjunction/integration-test-suite": patch
---

The content-vectorization integration checks (IT67) reload the Vector Indexes cache after creating their fixture indexes. Since #4962 the vectorizer looks indexes up in `AIEngineBase`, which picks up a saved index only after a 1.5 s debounce, so CV1–CV9 failed with "Vector index … not found in AIEngine cache" on the nightly run (they are mutation-gated, so PR and push runs skip them).

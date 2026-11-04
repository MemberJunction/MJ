---
"@memberjunction/core": patch
"@memberjunction/aiengine": patch
"@memberjunction/tag-engine": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/storage": patch
"@memberjunction/esignature": patch
"@memberjunction/web-search-engine": patch
---

A forced engine load (`Config(true)`) now returns only with data read after it was called.

- `BaseEngine`: a forced load that arrives while another load is running reads again once that load finishes, instead of returning its result. Forced calls that arrive during the same load share one extra read.
- `BaseEngine`: a full refresh that a newer refresh of the same property overtook still commits its rows when the newer one hasn't committed yet, so the load that ran it never returns with the property's previous rows. An older refresh still never overwrites a newer one that has committed, a failed read never counts as a commit, and a superseded refresh whose read failed changes nothing.
- New `SharedLoad` in `@memberjunction/core` applies the same rules to engines that run their own `Config`. `AIEngine`, `TagEngine`, `QueryEngineServer`, `FileStorageEngine` and `SignatureEngine` returned the running load's promise for a forced call; `WebSearchEngine` started a second load alongside the running one. All six now use it.

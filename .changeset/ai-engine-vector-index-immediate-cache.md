---
"@memberjunction/ai-engine-base": patch
---

A saved or deleted Vector Index reaches `AIEngineBase.VectorIndexes` immediately again. Since #4962 moved the index cache into `AIEngineBase`, which overrides `AdditionalLoading`, `BaseEngine` refreshed it only through its 1.5 s debounced full reload. Code that saved an index and read it back inside that window missed it: `AutotagBaseEngine` threw "Vector index … not found in AIEngine cache", and the Knowledge Hub configuration dashboard, which reloads its index list from that cache right after creating an index, could show the list without it. `AdditionalLoading` never reads Vector Indexes, so `AIEngineBase` now lets that config take `BaseEngine`'s in-place update, as the Knowledge Hub engine's cache did before #4962. Every other `AIEngineBase` config still reloads in full.

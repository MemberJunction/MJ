---
"@memberjunction/ai-local-embeddings": patch
---

Local embeddings load the q8 batched driver again and turn off the ONNX CPU memory arena, so a sync no longer holds about 1 GB; `ClearSharedCache()` now releases the model's ONNX sessions. Set `MJ_LOCAL_EMBEDDINGS_CPU_ARENA=true` to keep the arena (MJ#6689).

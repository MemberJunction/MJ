---
"@memberjunction/ai-local-embeddings": patch
---

Local embedding inference no longer blocks the server. `LocalEmbedding` now runs its ONNX model on a worker thread that loads each model once and keeps it, so a batch of embeddings (and the first-use model load) no longer holds every HTTP request and WebSocket on the process (MJ #5510). In a live MJAPI run of the "Entity Vector Sync" job, the worst `/healthcheck` wait dropped from about 1.5s to under 0.2s. If the worker cannot start or keeps crashing, embeddings run in-process as before; set `MJ_LOCAL_EMBEDDINGS_IN_PROCESS=true` to force that.

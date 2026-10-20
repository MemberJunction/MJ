---
'@memberjunction/integration-test-suite': patch
---

The content-vectorization integration checks stub `AIEmbeddingRunner.prototype.RunEmbedding`, which the autotag pipeline now calls, instead of `AIModelRunner`'s, and drop the stub for the removed `createEmbeddingInstance` seam.

---
"@memberjunction/aiengine": patch
---

Fix AIEngine lazy embedding loader poisoning the cache on first-call failure. `ensureEmbeddingsGenerated` now wraps the in-flight load in `try/finally` so a transient failure (e.g., model download flake) clears `_embeddingsPromise` and the next FindSimilar* call retries cleanly. Previously, a single failed load would reject every subsequent FindSimilar* call for the rest of the process lifetime.

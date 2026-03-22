---
"@memberjunction/external-change-detection": patch
"@memberjunction/core-actions": patch
---

Fix External Change Detection OOM crashes by replacing unbounded OR-clause record fetching with paginated detection queries (ot.* + ORDER BY), interleaved per-entity detect-replay to bound memory, and dynamic concurrency based on table row counts. Adds production safety mechanisms: circuit breaker, cooldown pause, and heap guard.

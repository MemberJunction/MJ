---
"@memberjunction/ai-agents": patch
---

Serve Memory Manager maintenance reads from the AIEngine cache instead of per-cycle `RunView`/`RunViews` calls. The scheduled Memory Manager job (every ~15 min) was re-querying `MJ: AI Agent Notes` and `MJ: AI Agent Examples` — entities `AIEngineBase` already holds fully in memory and keeps current via `BaseEntity` events — tripping the "Entity Already in Engine" redundancy telemetry on every run. The consolidation event-trigger count and the orphan-prune, TTL-expiry, and decay-candidate scans now filter/sort/cap the cached arrays in-memory (projecting to plain rows; mutation paths still re-`Load()` fresh owned entities, so cached instances are never aliased). The hardening pass, the cache-miss note-resolver fallback, and transactional `MJ: AI Agent Runs` reads intentionally remain DB queries.

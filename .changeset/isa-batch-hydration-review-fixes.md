---
"@memberjunction/core": patch
---

Fix bugs in batched IS-A hydration: `FindCachedEntity` no longer serves a permission-denied or failed engine property as a cache; batched child reads set `IgnoreMaxRows`; batch-linked children hydrate inherited mirror fields from the parent so edits record the real old value, and keep their own `__mj_` timestamps and ancestors' virtual columns; a known-subtype parent missing from a child engine cache is read from the DB, without re-reading a child whose answer cannot change; subtype-hint misses log like the per-row path, and a failed read is not reported as a miss.

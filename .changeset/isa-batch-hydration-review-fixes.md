---
"@memberjunction/core": patch
---

Fix six bugs in batched IS-A hydration: `FindCachedEntity` no longer serves a permission-denied or failed engine property as a cache; batched child reads set `IgnoreMaxRows`; batch-linked children hydrate inherited mirror fields from the parent so edits record the real old value; a known-subtype parent missing from a child engine cache is read from the DB; subtype-hint misses log like the per-row path; a child `LoadFromData` override is respected.

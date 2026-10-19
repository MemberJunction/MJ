---
"@memberjunction/core": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-prompts": patch
---

Less work on the entity-load and agent hot paths, with the same results.

- **`BaseEntity.GetAll()`** reads a record that hasn't built its fields yet straight from the loaded row, with the same date parsing and fixed-width trimming as `Get()`. It no longer builds every field just to serialize it.
- **Loaded records skip metadata defaults** when their fields are built. Each loaded value replaces the default anyway, and a field the row didn't include is marked not loaded, so it no longer holds a default nobody loaded. New records still get their defaults.
- **`BaseEngine`** reads its own configs on every entity save or delete event instead of deep-copying them through `JSON.stringify` each time. **`LocalCacheManager`** totals entry sizes directly when deciding whether to evict.
- **`PayloadManager`** copies payloads with a faster deep clone, doesn't clone the parent payload twice on a wildcard merge, and compiles each allowed-path pattern to a regex once. `DeepMerge` now merges only plain objects: a `Date` or class instance in the source replaces the destination value instead of collapsing to `{}`.
- **`AIPromptRunner`** parses output that starts with `{` or `[` with `JSON.parse` before falling back to `CleanJSON`, which re-serialized valid JSON and parsed it a second time.

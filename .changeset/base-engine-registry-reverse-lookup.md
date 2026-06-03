---
"@memberjunction/core": minor
---

feat(core): BaseEngineRegistry cross-engine cache reverse-lookup + `ExtendedType='Icon'`

- **`BaseEngineRegistry.FindCachedEntity<T>(entityName, { unfilteredOnly? })`** and
  **`TryGetCachedRecords<T>(...)`** — let UI/code ask "is this entity already fully
  cached by a loaded `BaseEngine`?" and use the live array (favoring unfiltered,
  authoritative sets). Returns the engine, its property config, the live records, and
  whether the cache is unfiltered. Powers instant, DB-free dropdowns for cached entities.
- **`EntityFieldInfo.ExtendedType`** (`EntityFieldExtendedType`) gains `'Icon'`, marking a
  field whose value is a FontAwesome class for per-row icon rendering.

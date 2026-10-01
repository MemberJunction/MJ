---
"@memberjunction/integration-engine": patch
---

Discovery stops for memory instead of being killed, and no longer has to hold the whole catalog to finish.

- **A memory budget beside the time budget.** Introspect and PK classification stop taking on new work when the V8 heap reaches `HEAP_STOP_FRACTION` of its limit or resident memory reaches `RSS_STOP_FRACTION` of the box, keep what they gathered, and report `HOST_MEMORY_PRESSURE`. PK classification refreshes only the catalog (not every engine dataset) and yields to the collector every 25 objects. A discovery sample never requests a page larger than its target.
- **An absolute heap floor.** `heap_size_limit` includes a fixed ~192 MB young-generation reserve that live data never occupies, so a fraction of it alone sits above V8's real abort line on any heap under ~2.4 GB. The heap gate also stops when no more than `HEAP_STOP_MIN_HEADROOM_BYTES` (320 MB) remain; large heaps are unaffected.
- **Streaming introspection.** `IntrospectSchemaOptions.OnObject` lets a caller take each object as a base connector builds it (`SourceSchemaInfo.Streamed` says it did). The creation pipeline uses it to sample and persist each object as it is produced, carrying only object names to a final pass that retires absent objects — so peak memory is one object, not the catalog. `PersistDiscoveredSchema` gains `DeactivateAbsentObjects` / `DeactivateAbsentFields`, each defaulting to `DeactivateAbsent`. Connectors whose `IntrospectSchema` does not forward the option behave exactly as before.

---
"@memberjunction/core": minor
---

Know a record's IsA subtype on load without a query, for entities that opt in.

A loaded record whose entity has IsA children finds its subtype with a discovery query across every child table, then loads the child row: in the browser, three round trips to open one record, and two more per row for a `RunView` of entity objects (201 for 100 records). An entity can now opt in to asking its subtype rule first. When the rule names a child, that child's load, which happens anyway, checks the answer, and the discovery query runs only on a miss: two round trips to open a record whose subtype is a leaf, and 101 for 100 records.

- `EntitySubtypeResolver.ResolveLoadHint(record)` answers the load-time question, from memory only; `null` means "no hint". The base implementation gives none, so overriding it is the opt-in, and a resolver that doesn't override it is never constructed when records load. `Resolve()` stays the create-time question and may await an engine's `Config()`. A registered resolver owns the rule, so the entity's `SubtypeSelector` isn't consulted on load in its place.
- The `SubtypeSelector` JSON (`IEntitySubtypeSelectorConfig`) gains an optional `UseForLoadedRecords`, default `false`. With it, the selector is walked on load through the entity objects that loaded `BaseEngine` caches hold, found through an index over each cached array; a hop that isn't cached gives no hint, never a query. A selector without it, such as the ones bizapps-orders declares today, loads as before.
- For well-formed data a hint changes the number of round trips, not which child is linked or whether the load succeeds. A hinted child with no row, where the record has no subtype row at all, is normal: it costs one extra round trip and logs nothing as an error. When the discovery query finds a different child, "the rule and the data disagree" is logged once per entity and pair of subtypes. A promotion (`AttachToParent`) never asks the rule. A failure reading the hinted row falls back to the discovery query; a failure after the row was read fails the load, as without a hint.
- `BaseEntity.ClearSubtypeLookupCache()` also clears the load-hint caches and the record of load-hint messages already logged.

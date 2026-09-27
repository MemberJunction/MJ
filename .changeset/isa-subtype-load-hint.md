---
"@memberjunction/core": patch
---

Know a record's IsA subtype on load without a query.

A loaded record whose entity has IsA children found its subtype with a discovery query across every child table, then loaded the child row: in the browser, three round trips to open one record, and two more per row for a `RunView` of entity objects (201 for 100 records). Nothing cached the answer, and the entity's `EntitySubtypeResolver` and `SubtypeSelector` were read only when a record was created.

A loaded disjoint parent now asks its subtype rule first. When the rule names a child, that child's load, which happens anyway, checks the answer, and the discovery query runs only on a miss: two round trips to open a record whose subtype is a leaf, and 101 for 100 records.

- `EntitySubtypeResolver.UseForLoadedRecords` (default `false`): a resolver opts in to being asked on load, since resolvers written for create time may query. While a resolver is registered, the `SubtypeSelector` isn't consulted in its place.
- A `SubtypeSelector` answers on load only from entity objects that loaded `BaseEngine` caches already hold. A hop that isn't cached gives no hint, never a query.
- A hint never changes the outcome. A wrong hint falls back to the discovery query (and `LogError` reports that the rule and the data disagree); "no subtype" still runs the query; a child the user can't read isn't loaded from the hint; a resolver that throws or names an undeclared child is logged and ignored. Overlapping parents, entities with no rule, and the create-time single-child default load exactly as before.

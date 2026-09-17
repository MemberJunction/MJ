---
"@memberjunction/core": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/metadata-sync": patch
---

A query's parameters can now be declared in metadata instead of existing only because extraction inferred them.

Declaring a `MJ: Query Parameters` row under a `MJ: Queries` record previously failed the whole push with `Violation of UNIQUE KEY constraint 'UQ_QueryParameter_QueryID_Name'`: the query's own Save() runs the extraction pipeline, which created its own row for the same parameter before the declared child — ordered after its parent, because it carries the parent's foreign key — was written. Two changes fix it:

- `BaseEntity` gains `DeferDerivedData` and `ProcessDeferredDerivedData()`. An entity that derives child records from its own data records the work during `Save()` instead of performing it, and the caller runs it once the whole record graph is written. `mj sync push` sets the flag and runs the derivation per graph, immediately before that graph's transaction commits, so derived rows still settle atomically with the authored ones. `MJQueryEntityServer` implements it for the extraction pipeline; the flag is inert for entities that derive nothing.
- Extraction now treats a parameter row whose `DetectionMethod` is `'Manual'` as authoritative for how the parameter is described: it no longer rewrites `DetectionMethod`, `Description`, `SampleValue`, `Type`, `IsRequired` or `DefaultValue` on such a row. `'Manual'` is the column's own default and means the row was authored deliberately, by a person or by a metadata sync. The SQL still decides which parameters exist, so a row the SQL stops referencing is still removed whatever declared it — keeping it would break the query, because parameter validation demands a value for every `IsRequired` definition whether or not the SQL uses it — and a declared row removed this way now logs a warning naming the query and parameter.

Fixes #4545.

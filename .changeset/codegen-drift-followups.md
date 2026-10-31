---
'@memberjunction/codegen-lib': patch
---

CodeGen keeps more of its metadata in step with the database and with what it was told:

- A layered entity's outer view is refreshed before its CRUD procedures are generated, so they compile against current columns (#4927).
- IS-A child views select a parent's persisted computed columns, which can then serve as the child's name field (#5899); an out-of-scope IS-A child whose view is missing a parent column gets a warning (#4821).
- Field category settings are merged instead of replaced, and blank categories are filled on a forced advanced-generation run (#5369, #4831).
- Relationship metadata: pinned foreign keys are not overwritten by LLM suggestions, the relationship insert guard uses the natural key so replayed SQL is safe, and stale relationships are reported each run and removed when `cleanupStaleRelationships` is on; a relationship that joins on a non-key parent column is never treated as stale (#3160, #4053, #2071).
- A soft primary key removed from `additionalSchemaInfo` is retracted (#2568).
- Value lists: long values no longer truncate their code, a value containing an apostrophe no longer breaks the insert, and a list with no values is reported (#2577, #3986).
- Scope: cleanup no longer deletes or keeps the wrong generated files when schemas are included or excluded, empty core passes are skipped, the CRUD validator uses the run's scope, and an `includeSchemas` entry that matches no schema fails the run (#3384).
- The SQL output log's EntityField inserts get a regression test (#3158). The stale view binding in #4770 is fixed by the live view refresh that landed in #6067; its extra geo columns come from the app's migrations lagging its metadata, not from CodeGen (#4770).

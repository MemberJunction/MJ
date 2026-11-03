---
"@memberjunction/core": minor
"@memberjunction/codegen-lib": minor
---

`spDeleteEntityWithCoreDependencies` now deletes an entity's `GraphEdge` rows (as source or target) and its `GraphEdgeTypeEndpoint` rows, so removing an entity that has semantic graph data no longer fails on the new foreign keys. The CodeGenLib delete-policy fixture records the three references. CI's unit-test shards also now fail when a test task fails, instead of reporting `tee`'s exit code.

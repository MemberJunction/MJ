---
'@memberjunction/codegen-lib': minor
'@memberjunction/schema-engine': minor
'@memberjunction/server': minor
'@memberjunction/integration-schema-builder': minor
---

CodeGen keeps EntityField metadata in step with the views and procedures it regenerates, and fails the run when a step fails instead of reporting success.

- Custom and layered base views are refreshed live, inner view first, before fields are synced; orphaned EntityField rows are pruned across every entity once per run, and the Sequence renumber no longer collides on them (#4050, #4336, #4737, #5976, #6028).
- Self-referencing keys that still have `Root*` fields or a `GetRootID` function keep their hierarchy after the 6.1 opt-in change (#5976).
- IS-A child entities keep the foreign-key metadata of inherited fields (#4569).
- Stale create/update/delete procedures are found by comparing them with what CodeGen generates (#3343); expression column defaults no longer produce procedures that fail to compile (#4000).
- `spDeleteEntityWithCoreDependencies` handles every reference to an entity from a checked-in policy and runs in one transaction (#3546).
- The runtime schema update path resolves `additionalSchemaInfo` from the config file's folder and fails when CodeGen creates no entity for a table (#5858).
- Batch, script and step failures are collected and the run exits non-zero listing all of them.

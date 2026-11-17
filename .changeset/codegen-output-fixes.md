---
"@memberjunction/codegen-lib": patch
"@memberjunction/integration-test-suite": patch
---

CodeGen output fixes:

- A stored validator with real line breaks and `\"` escapes is unescaped when only that form parses; one that parses neither way is written unchanged with a warning naming the entity and validator (#6510).
- Search-flag hygiene filters by `includeSchemas` and the authored `excludeSchemas`, never the compiled exclude list, so an Open App capture no longer touches entities in other schemas (#6384).
- The auto FK and soft-PK index guards skip the index when another unfiltered index already leads with the column(s), on SQL Server and PostgreSQL. Every entity's index file is rewritten once. Integration check MC4 accepts such an index (#6466).
- A pinned name field (`AutoUpdateIsNameField = 0`) always wins, so CodeGen no longer flags a second one; the integrity check warns about entities with more than one name field (#6554).
- `mj codegen --all-schemas` re-emits the generated files of every schema for one run (#5163).

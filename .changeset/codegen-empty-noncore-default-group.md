---
"@memberjunction/codegen-lib": patch
"@memberjunction/installer": patch
---

Fix a fresh `mj install` that could not boot MJAPI or Explorer (MemberJunction/MJ#4477). Since the schema-scale emit change, CodeGen produced the entity-subclass, GraphQL and Angular outputs by iterating a per-directory partition of the non-core entities. On a fresh database that list is empty, the partition was empty, and the generators were never called, so `packages/GeneratedEntities/src/generated/entity_subclasses.ts` and the Angular generated-forms module were never written while CodeGen still reported "complete". `partitionEntitiesByOutputDirectory` now always includes the default directory with an empty group when one is configured, restoring the pre-change behaviour of emitting an empty barrel. The installer's post-CodeGen artifact check now treats a missing `entity_subclasses.ts` as critical and names the missing file in the failure, instead of trusting the exit code.

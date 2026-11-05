---
"@memberjunction/codegen-lib": patch
---

The entity field sequence integrity check now warns when an entity's base view has more columns than the entity has fields, which breaks every create and update on that entity. It is a warning for one release and is planned to become a failure.

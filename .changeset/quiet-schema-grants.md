---
"@memberjunction/codegen-lib": patch
---

Stop generating and applying GRANT files for excludeSchemas entities. Open App CodeGen was failing with "Cannot find the object 'vw…'" on sibling-schema permission files, and the entity-field sequence integrity check was querying those same out-of-scope base views.

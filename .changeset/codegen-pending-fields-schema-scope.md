---
"@memberjunction/codegen-lib": patch
---

Scope createNewEntityFieldsFromSchema to excludeSchemas (the compiled includeSchemas allow-list) so an Open App CodeGen run does not INSERT EntityField rows for sibling schemas.

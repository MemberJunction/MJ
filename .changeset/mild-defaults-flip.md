---
"@memberjunction/core": minor
"@memberjunction/codegen-lib": patch
---

Scope the Developer delete-permission grant migration to the `__mj` schema so it never touches customer-defined schemas, and flip CodeGen's default `CanDelete` for the Developer role to `true` so newly registered entities ship with the Developer role's full CRUD permissions.

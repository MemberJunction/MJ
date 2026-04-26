---
"@memberjunction/codegen-lib": patch
"@memberjunction/cli": patch
---

Scope CodeGen Pass 2 entity field management to changed entities. Adds optional `@EntityIDs` (comma-delimited UUID list) parameter to `spDeleteUnneededEntityFields` and `spUpdateExistingEntityFieldsFromSchema`; adds `--forced-advanced-gen` CLI flag for bypassing scoped behavior in regression testing.

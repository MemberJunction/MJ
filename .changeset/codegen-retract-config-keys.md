---
"@memberjunction/codegen-lib": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Add a `Source` column (`Check` / `Config` / `Manual`) to `EntityFieldValue` and (`Config` / `Manual`) to `EntityOrganicKey`, and have CodeGen stamp it on every row it writes. With the new `retractRemovedSoftKeys` option, CodeGen removes soft foreign keys, value lists and organic keys it created from `additionalSchemaInfo` once the file stops declaring them, on tables the file still lists, including organic-key related entities and bridge views nothing uses any more. Rows from CHECK constraints or entered by hand are never removed. With the option off (the default), each run reports what it would remove (#4535).

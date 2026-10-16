---
"@memberjunction/codegen-lib": patch
---

CodeGen records every table-level CHECK-constraint validator of an entity in `GeneratedCode`, not just the first. The insert guard for a table-level validator now also matches its name, since every table-level validator links to the same entity row. Field-level guards are unchanged.

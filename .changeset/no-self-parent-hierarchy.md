---
"@memberjunction/codegen-lib": patch
---

CodeGen no longer treats an entity's own primary key as its hierarchy parent. FK auto-detection can mark a `<prefix>_key` primary key as referencing its own table; the recursive root-id view CodeGen then generated joined the key to itself and failed to compile ("column reference is ambiguous"), taking the base view and its CRUD routines with it.

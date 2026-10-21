---
"@memberjunction/codegen-lib": patch
---

CodeGen no longer records a column as its own hierarchy parent: a self-referencing foreign key whose column is the table's primary key is skipped when CodeGen infers parent/child hierarchies, so a recursive tree is never built from a row pointing at itself.

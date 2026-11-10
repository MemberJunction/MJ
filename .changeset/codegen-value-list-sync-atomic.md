---
"@memberjunction/codegen-lib": patch
---

CodeGen no longer opens transactions that covered none of its writes. A field's value-list rows are now synced in one atomic batch, and an entity whose value list changed is marked modified, so its generated union and Zod enum are re-emitted when only a CHECK value list changed.

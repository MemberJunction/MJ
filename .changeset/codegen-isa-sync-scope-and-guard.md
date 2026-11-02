---
"@memberjunction/codegen-lib": patch
---

CodeGen: the IS-A parent-field sync now honours the compiled `includeSchemas`/`excludeSchemas` scope, so an Open App publisher run no longer processes sibling apps' IS-A children or writes their `EntityField` INSERTs into its own migration capture, and the IS-A `EntityField` INSERT it does emit is wrapped in the same existence guard as the schema-field inserts so a replayed capture is idempotent (#4879).

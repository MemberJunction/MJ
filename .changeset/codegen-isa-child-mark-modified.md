---
"@memberjunction/codegen-lib": patch
---

CodeGen: the IS-A parent-field sync now marks a child entity as modified whenever it inserts, updates or removes one of the child's virtual `EntityField` rows, so the child's entity subclass, zod schema and GraphQL types are regenerated in the same run instead of staying stale until a `--skipdb` pass (#5961).

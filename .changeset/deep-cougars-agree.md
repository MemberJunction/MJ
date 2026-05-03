---
"@memberjunction/codegen-lib": minor
"@memberjunction/sql-dialect": minor
---

lift CRUD-routine generation to the base class via new SQLDialect abstractions (IsNull, ParameterRef, ParameterDefault, NullLiteral, EmptyUUIDLiteral) so SP generation logic lives once and dialects override only what's syntax-specific

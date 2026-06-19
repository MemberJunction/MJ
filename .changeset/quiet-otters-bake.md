---
"@memberjunction/sql-converter": patch
"@memberjunction/cli": patch
"@memberjunction/sqlglot-ts": patch
---

Add inline CodeGen baking for PostgreSQL migrations (`mj migrate convert --bake-codegen` and `mj migrate rebake`) plus a one-time PG CodeGen cutover migration and a repeatable `EntityField.AllowsNull` self-heal, enabling codegen-free PostgreSQL deploys (`mj migrate` + `mj sync push`, no `mj codegen`).

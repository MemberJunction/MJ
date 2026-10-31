---
"@memberjunction/codegen-lib": patch
---

CodeGen's Flyway conversion now replaces a schema name with its placeholder only where the schema name stands alone (`[__mj].`, `__mj.`, `'sys,__mj'`). Names that merely start with it stay literal: `__mj_` system columns such as `__mj_Latitude_BillToAddressID`, view aliases such as `__mj_rgc`, and Open App schemas such as `__mj_BizAppsCommon`. Before, those were rewritten to `${mjSchema}_…` / `${flyway:defaultSchema}_…` and resolved correctly only on a host whose core schema is `__mj` (#5563). The substitution is now the public `SQLLogging.ApplySchemaPlaceholders()`.

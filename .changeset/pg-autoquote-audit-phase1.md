---
"@memberjunction/sql-dialect": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/server": patch
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/ai-agents": patch
---

PostgreSQL auto-quote shim, removal phase 1 (#4435). A statement the shim changes is logged once at verbose level (`pgAutoQuoteAudit` in `databaseSettings` for MJAPI and in the CodeGen config; default on unless `NODE_ENV` is `production`). RLS filters render their `PlatformVariants` text for the provider's platform. The memory manager's high-value-runs filter is quoted with the provider's dialect. No behavior change for rows without a platform variant.

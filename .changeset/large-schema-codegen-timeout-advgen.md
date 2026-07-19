---
"@memberjunction/codegen-lib": patch
---

Large-schema CodeGen hardening: raise the CodeGen DB request-timeout fallback from mssql's 120s to 600s (metadata reconciliation exceeds 2 min at ~2,000 tables; any explicit `codegenPool.statementTimeoutMs` / `MJ_CODEGEN_REQUEST_TIMEOUT` still wins), and make advanced-generation LLM calls degrade gracefully so a provider/network/credential error during entity-name or entity-description generation can never fail metadata management (codegen runs at container start in production).

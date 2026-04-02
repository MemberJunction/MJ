---
"@memberjunction/core": patch
"@memberjunction/global": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/cli": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-dashboard-viewer": patch
"mj_explorer": patch
---

Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and fix Golden Layout duplicate tab rendering.

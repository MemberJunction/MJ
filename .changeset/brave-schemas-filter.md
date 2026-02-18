---
"@memberjunction/codegen-lib": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Fix CodeGen to apply excludeSchemas filter consistently across all generators (TypeScript, Angular, GraphQL), not just SQL generation. Also adds cleanup for orphaned Angular entity form directories when entities are renamed or deleted.

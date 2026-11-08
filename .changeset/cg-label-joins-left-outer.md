---
"@memberjunction/codegen-lib": minor
"@memberjunction/core-entities": minor
"@memberjunction/computer-use-engine": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/ng-agents": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-file-storage": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-record-tags": patch
"@memberjunction/react-runtime": patch
"@memberjunction/testing-cli": patch
---

CodeGen base views: display-label joins (related-entity name fields) and the embedded-record geo join are always `LEFT OUTER JOIN`, regardless of the foreign key's nullability, so an unmatched related row yields a NULL label instead of removing the row from the view (#4533). IS-A parent joins stay `INNER`. Ships a migration that regenerates the affected core base views. The display-name fields those joins feed are now typed `string | null` in the generated entity classes, and the call sites that read them handle the null.

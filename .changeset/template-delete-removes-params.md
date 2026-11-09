---
"@memberjunction/core-entities-server": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/integration-test-suite": patch
---

Deleting a template now deletes its template params first, in the same transaction, so a template whose content save derived params can be deleted (including through `mj sync push`). AI Prompts, Entity Documents and other records that reference the template still block the delete.

---
"@memberjunction/codegen-lib": patch
---

An AI-generated entity name is validated before it is used, a failed entity INSERT propagates instead of being swallowed (so the surrounding transaction can roll back rather than commit a partial set of new entities), a rolled-back batch no longer leaves its names in the process-static new-entity list, and in-process CodeGen runs with advanced generation off unless `RSU_CODEGEN_ADVANCED_GENERATION=1`.

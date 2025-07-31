---
"@memberjunction/codegen-lib": patch
---

feat(codegen-lib): Add cascade delete dependency tracking for
stored procedures

When an entity's schema changes (e.g., new columns added), any
delete stored procedures that reference its update SP via cascade
operations need to be regenerated to include the new parameters.
This prevents runtime failures when cascade delete operations
reference outdated stored procedure signatures.

- Track cascade delete dependencies during SQL generation
- Detect entities with schema changes from metadata management
  phase
- Automatically mark dependent delete SPs for regeneration
- Ensure SQL logging captures cascade dependency regenerations
- Respect spDeleteGenerated flag - never modify custom stored
  procedures

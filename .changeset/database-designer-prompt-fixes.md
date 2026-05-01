---
'@memberjunction/schema-engine': minor
---

Database Designer prompts and SchemaEngine fixes:

- **Agent Manager prompt**: deterministic schema-work guard that fails loudly when the user's request implies schema work but the plan didn't include `pendingSchemaChanges`, instead of silently building an agent that depends on tables that were never created.
- **Database Designer prompt**: success messages now require `entityName` on every `open:resource` actionableCommand so the "View [Entity] Entity" buttons actually navigate.
- **Schema Designer prompt**: UDT entities are explicitly UUID-only at the PK layer; the agent now declines non-UUID PK requests on UDT targets instead of silently overriding the user's INT request. Column removals must omit the column from the desired `Columns` array (not tag it with a fabricated `__DELETE__` marker), and the agent must be explicit that the SQL column is left in place and must be dropped manually.
- **SchemaEngine.SchemaEvolution**: `GenerateEvolutionMigration` now throws when the diff contains only column removals (no adds or modifications). Previously this case emitted SQL comments for each removal that executed as no-ops while the rest of the pipeline reported success — a false-success bug for destructive operations. Removed-column comments are also rewritten as explicit "DROP NOT EXECUTED" warnings.

---
"@memberjunction/codegen-lib": minor
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/global": patch
"@memberjunction/metadata-sync": patch
---

Achieve 100% CodeGen idempotency relative to database state and eliminate metadata churn across SQL Server and PostgreSQL:

- **Idempotency (No-Change Runs)**: Running CodeGen against an unchanged schema produces zero diffs and zero surviving migration artifacts. The run report confirms `fieldsNew = 0`, `fieldsChanged = 0`. Empty capture files are cleaned up automatically.
- **Minimal Blast Radius (Single-Column Changes)**: Adding a column to an entity modifies only that entity's artifacts (`__mj.ts`, specific entity zod/schema files, `generated.ts` type block, and `mjentity.form.component.*`). Sibling fields and other entities are strictly untouched.
- **Field Metadata Lock & Migration Single Source of Truth**: Field categorization and metadata decisions are locked in the database via the field-metadata lock (`field-metadata-lock.ts`) and committed via the migration's CodeGen capture SQL, making migration SQL the authoritative single source of truth.
- **Stable Form Submodule Partitioning**: Replaced array index-chunking in Angular form submodule generation with stable hash buckets of entity names, preventing unrelated form files from shifting when an entity is added or removed.
- **Deterministic Ordering**: Unified entity, field, and relationship sorting around `OrdinalCompare` across TypeScript and SQL, eliminating locale and database collation discrepancies.
- **MetadataSync Preservation**: Preserved runtime and CodeGen-managed fields during push synchronization while maintaining deterministic lookup index caching.
- **Description Lock Protection**: Corrected inverted `AutoUpdateDescription` logic in `MJEntityFieldEntityExtended` and `MJEntityEntityExtended` so that user edits to `Description` flip `AutoUpdateDescription` to `false`, preventing subsequent CodeGen runs from overwriting customized descriptions.


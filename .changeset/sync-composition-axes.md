---
"@memberjunction/core": minor
"@memberjunction/metadata-sync": minor
"@memberjunction/sqlserver-dataprovider": minor
---

Support entity composition axes in MetadataSync and BaseEntity.

- Implements IsA subtype extension, authoritative/upsert collections, and embeds composition axes across sync push, pull, and validation.
- Adds BaseEntity.EnsureISAChild() for prospective and existing subtype child resolution.
- Adds entity subtype selector schema and metadata support.
- Wires transaction depth draining, graph rollback, authoritative collection deletion confirm gating, and cycle-protected dirty/validation checking.

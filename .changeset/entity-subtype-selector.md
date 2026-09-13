---
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Add `Entity.SubtypeSelector` column, JSONType metadata, and CodeGen artifacts for prospective IsA subtype resolution.

- **Schema & Migration**: Migration `V202609081111__v6.1.x__Entity_SubtypeSelector.sql` adds nullable `SubtypeSelector NVARCHAR(MAX)` on `__mj.Entity` with extended property documentation, regenerated CRUD stored procedures, and view refresh.
- **Metadata**: Created `IEntitySubtypeSelectorConfig` interface (`metadata/entities/JSONType-interfaces/IEntitySubtypeSelectorConfig.ts`) and configured JSONType metadata on `Entity.SubtypeSelector` via `metadata/entities/.entity-field-jsontype-entity-subtype-selector.json`.
- **Generated Code**: Generated `SubtypeSelector` and typed `SubtypeSelectorObject: MJEntityEntity_IEntitySubtypeSelectorConfig | null` accessor on `MJEntityEntity` in `@memberjunction/core-entities`, GraphQL schema definitions in `@memberjunction/server`, and updated Angular entity forms in `@memberjunction/ng-core-entity-forms`.

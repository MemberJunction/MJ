---
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

feat(integration): Phase 0 CodeGen — expose new Integration Object / Integration Object Field columns through the generated layer

CodeGen output for the v5.39.x Integration Framework Expansion migration. Surfaces the schema columns added in the foundation changeset through the regenerated entity, GraphQL, and form layers:

- **`@memberjunction/core-entities`** — `IntegrationObjectEntity` / `IntegrationObjectFieldEntity` gain strongly-typed accessors for the per-operation write columns (`CreateAPIPath`/`Method`/`BodyShape`/`BodyKey`/`IDLocation`, `UpdateAPI*`, `DeleteAPIPath`/`DeleteIDLocation`), `IncrementalWatermarkField`, and the `MetadataSource` enum (`'Declared' | 'Discovered' | 'Custom'`).
- **`@memberjunction/server`** — regenerated resolvers/GraphQL types expose the new fields.
- **`@memberjunction/ng-core-entity-forms`** — regenerated `MJ: Integration Objects` / `MJ: Integration Object Fields` forms render the new fields.

All changes are additive (new nullable fields + a new enum field), so this is a **minor** bump — no existing field is removed, renamed, or narrowed. Pairs with the `integration-framework-expansion-foundation` changeset, which covers the migration DDL and engine code.

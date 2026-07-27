---
'@memberjunction/codegen-lib': patch
---

Exclude externally-owned entity schemas from generated GraphQL server code. `generateGraphQLServerCode` received the unfiltered `nonCoreEntities` list, so a package configured with external schemas emitted `@ObjectType` classes for entities owned by sibling packages. When two such packages were loaded together, `buildSchemaSync` threw `Schema must contain uniquely named types but contains multiple types named "..."` and the API crash-looped at boot. GraphQL generation now uses the same external-schema-filtered list already used for entity subclass and Angular generation.

Withholding those entities also withholds their `@ObjectType` class declarations, so relationship members that named them would have been dangling identifiers. A local entity with a one-to-many to an externally-owned entity emitted `@Field(() => [<external>_])` and a matching `@FieldResolver`, neither of which resolves once the class is no longer declared in the file — turning the boot crash into a TypeScript compile error. Those members are now omitted (with a comment naming the relationship) when the related entity's schema is owned by another package. MJ-core related entities are unaffected: they resolve through the `mj_core_schema_server_object_types` namespace import rather than a local declaration.

---
'@memberjunction/codegen-lib': patch
---

Exclude externally-owned entity schemas from generated GraphQL server code. `generateGraphQLServerCode` received the unfiltered `nonCoreEntities` list, so a package configured with external schemas emitted `@ObjectType` classes for entities owned by sibling packages. When two such packages were loaded together, `buildSchemaSync` threw `Schema must contain uniquely named types but contains multiple types named "..."` and the API crash-looped at boot. GraphQL generation now uses the same external-schema-filtered list already used for entity subclass and Angular generation.

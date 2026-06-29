---
'@memberjunction/core': minor
'@memberjunction/external-data-sources': minor
'@memberjunction/codegen-lib': minor
---

CodeGen-integrated external-entity field sync (`manageExternalEntities`).

CodeGen now introspects the **remote** schema of external-data-source entities and syncs their `EntityField` metadata — the remote analogue of how it already manages view-backed `VirtualEntity` fields from `INFORMATION_SCHEMA`. This removes the manual-field-definition limitation for external entities.

- **`@memberjunction/core`**: the schema-introspection contracts (`ExternalObjectType` / `ExternalSchemaColumn` / `ExternalSchemaObject` / `ExternalSchemaDescriptor`) move here from the engine; `ExternalDataSourceReadRouter` gains abstract `IntrospectExternalSchema(externalDataSourceID, schemaName?, contextUser?, provider?)` — so build-time consumers reference them without a hard dependency on the engine/driver SDKs.
- **`@memberjunction/external-data-sources`**: `ExternalDataSourceReadRouterImpl.IntrospectExternalSchema` resolves the driver and delegates to its `IntrospectSchema`.
- **`@memberjunction/codegen-lib`**: a new `manageExternalEntities` / `manageSingleExternalEntity` pass (mirroring `manageSingleVirtualEntity`) introspects each external entity's remote object, maps native types to MJ types (`mapExternalNativeTypeToMJ` — best-effort across PostgreSQL/Snowflake/MongoDB, falling back to `nvarchar(MAX)`), and creates/updates/deletes `EntityField` rows, reusing the virtual-entity field machinery. Real PK info from introspection is honored (falling back to first-column-as-PK).

The pass resolves the router via `MJGlobal.ClassFactory`, so it requires the EDS engine + the relevant driver to be loaded in the CodeGen process; when none is registered it logs a clear message and skips (no effect on non-external entities). Native-type→MJ mapping is best-effort and refined by the existing LLM field-decoration pass + review.

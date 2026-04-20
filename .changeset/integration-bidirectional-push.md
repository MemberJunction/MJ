---
"@memberjunction/integration-engine": minor
"@memberjunction/integration-connectors": minor
"@memberjunction/integration-schema-builder": patch
"@memberjunction/schema-engine": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/server": minor
---

feat: bidirectional sync engine, HubSpot/YM connector improvements, RSU #2239 fixes

- Integration engine now respects SyncDirection (Pull/Push/Bidirectional) on entity maps
- Push sync uses Record Changes to detect MJ-side modifications, reverse-maps fields, and calls connector CRUD methods
- Separate Push watermarks tracked alongside Pull watermarks
- New IntegrationWriteRecord GraphQL mutation for ad-hoc writes to any connector
- HubSpot: 130 objects with full field metadata; association CRUD via v4 PUT/DELETE API; composite hs_object_id for association sync
- YourMembership: 228 objects with accurate PKs across all endpoints; 400 errors now surfaced (not silently swallowed); DateTime.MinValue → null conversion
- SchemaBuilder logs DDL history to __mj_integration.SchemaHistory (separate schema, not surfaced as MJ Application)
- IntegrationObject.IsCustom column added to distinguish static vs runtime-discovered objects
- RSU #2239: in-process SQL execution for CodeGen (no sqlcmd dependency)
- RSU #2239: RSU_RESTART_COMMAND env var override for non-PM2 environments
- SQLServerDataProvider: incremental schema sync improvements

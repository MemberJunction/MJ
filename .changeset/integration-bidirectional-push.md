---
"@memberjunction/integration-engine": minor
"@memberjunction/integration-connectors": minor
"@memberjunction/integration-schema-builder": patch
"@memberjunction/schema-engine": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/server": minor
---

feat: bidirectional sync engine, push watermarks, IntegrationWriteRecord mutation, RSU #2239 fixes

- Integration engine now respects SyncDirection (Pull/Push/Bidirectional) on entity maps
- Push sync uses Record Changes to detect MJ-side modifications, reverse-maps fields, and calls connector CRUD methods
- Separate Push watermarks tracked alongside Pull watermarks
- New IntegrationWriteRecord GraphQL mutation for ad-hoc writes to any connector
- HubSpot: association CRUD via v4 PUT/DELETE API
- QuickBooks: added CustomerType and VendorType entities
- SchemaBuilder logs DDL history to __mj_integration.SchemaHistory
- RSU #2239: in-process SQL execution for CodeGen (no sqlcmd dependency)
- RSU #2239: RSU_RESTART_COMMAND env var override for non-PM2 environments

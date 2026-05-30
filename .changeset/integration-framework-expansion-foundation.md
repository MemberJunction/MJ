---
"@memberjunction/integration-engine": minor
"@memberjunction/core-entities": minor
---

feat(integration): framework expansion foundation — Phase 0 schema + base-class changes

Schema (v5.39.x migration):
- IntegrationObject: explicit per-operation write columns (CreateAPIPath/Method/BodyShape/BodyKey/IDLocation; UpdateAPIPath/Method/BodyShape/BodyKey/IDLocation; DeleteAPIPath/DeleteIDLocation). Existing WriteAPIPath/WriteMethod kept one release as deprecated alias.
- IntegrationObject: IncrementalWatermarkField — vendor cursor/timestamp field name driving incremental sync filter.
- IntegrationObject + IntegrationObjectField: MetadataSource enum {Declared, Discovered, Custom} — provenance for merge precedence in IntegrationSchemaSync.

Engine code:
- ExternalFieldSchema: add IsPrimaryKey (distinct from IsUniqueKey). Fixes IntrospectSchema bug where IsPrimaryKey was incorrectly mapped from IsUniqueKey — an object can have multiple unique fields but only one is the PK.
- BaseRESTIntegrationConnector: new TransformRecord hook — optional per-record customization seam between NormalizeResponse and ToExternalRecord. Default identity. Override for vendor-specific record-level shape changes.
- BaseRESTIntegrationConnector: generic metadata-driven CRUD — CreateRecord/UpdateRecord/DeleteRecord/GetRecord read per-operation columns and execute generically. Concrete connectors only override when API is genuinely idiosyncratic. Replaces hand-rolled write logic that previously lived duplicated across every concrete connector.

Full Phase 0 design: plans/integration-phase-0-pr1.md

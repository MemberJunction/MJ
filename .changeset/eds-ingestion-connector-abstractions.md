---
"@memberjunction/integration-connectors": minor
---

Add the External-Data-Source-backed ingestion connector abstractions (the "heart"): `BaseExternalDataSourceConnector` (family-neutral — resolves the shared `MJ: External Data Sources` row via the EDS router, `TestConnection`, `IntrospectSchema` mapping `ExternalSchemaDescriptor` → `SourceSchemaInfo`, and generic incremental `FetchChanges` via a dialect-quoted watermark predicate on `driver.RunView`), plus the `BaseSqlExternalDataSourceConnector` (SQL family — dialect quoting + authoritative discovery) and `BaseDocumentDataSourceConnector` (document/NoSQL family — verbatim identifiers + non-authoritative sampled discovery) families. Deprecates the SQL-Server-hardcoded `RelationalDBConnector`. Thin per-engine leaves ship as Open Apps in the MemberJunction/Integrations repo.

---
"@memberjunction/core": minor
---

Remove connector-specific Integration metadata from core MemberJunction. Each connector (Salesforce, NetSuite, MemberSuite, GrowthZone, Pheedloop, etc.) now ships its own Integration + Integration Object/Field rows and credential type from the `MemberJunction/Integrations` repo as an installable Open App, rather than being seeded natively by MJ.

- Deletes the connector-specific `metadata/integrations/<connector>/` folders, the single-file `.<connector>.json` definitions, and the 22 connector-specific credential-type files (and their schemas) from `metadata/credential-types/`. Only generic integration/credential metadata remains in core.
- Adds migration `V202606251241__v5.43.x__Remove_Connector_Integration_Metadata.sql`, which deletes the corresponding `Integration` / `Integration Object` / `Integration Object Field` / `IntegrationURLFormat` rows and the 22 `Credential Type` rows from the database, and nulls `RecordChange.IntegrationID` for the removed integrations.

The migration is a data-only (record) change — no schema change, so no CodeGen run is required. It is guarded so it never touches an integration that has a live `CompanyIntegration` connection, and never deletes a credential type still referenced by an `Integration`, `AIVendor`, `MCPServer`, or `Credential` row. "File Feed" and "Betty AI" are retained (not yet moved to the repo).

---
"@memberjunction/integration-connectors": minor
---

feat(connectors): add the SharePoint (Microsoft Graph) and Microsoft Dynamics 365 (Dataverse) connectors

Two connectors added to the v2 unified set, each extending `BaseRESTIntegrationConnector` with the per-operation CRUD + incremental-watermark contract:

- **SharePoint** — Microsoft Graph v1.0; sites / drives / lists / listItems with soft PKs proven from the Graph schema, delta-token incremental sync (the deltaLink token as the watermark, not a timestamp), and an FK graph via push-time `@lookup` (`&IntegrationID=@parent:IntegrationID`).
- **Microsoft Dynamics 365 (Dataverse)** — Dataverse Web API (OData) with entity discovery, pagination, and change-tracking incremental sync.

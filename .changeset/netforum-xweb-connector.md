---
"@memberjunction/integration-connectors": minor
"@memberjunction/integration-engine": patch
---

Add the netFORUM Enterprise (Community Brands AMS) connector — xWeb SOAP/XML route.

- **`NetForumConnector`** (`@memberjunction/integration-connectors`): integrates netFORUM Enterprise via the xWeb SOAP/XML web service (`netForumXML.asmx`), implemented as SOAP-over-HTTP on `BaseRESTIntegrationConnector`. Two-step `Authenticate` token auth; `GetQuery`/`GetQueryDefinition`/`ExecuteMethod` reads; per-facade `*_last_updated_dt` incremental watermarks; facade CRUD where the xWeb docs establish it. The standard Enterprise object model (34 Integration Objects) is Declared from the public xWeb WSDL; customer-specific queries/views/custom columns are runtime-discovered via `GetQueryDefinition` (`DiscoveryIsAuthoritative=false`), never baked into the connector.
- **`@memberjunction/integration-engine`**: adds the optional `OAuth2TokenRequest.ExtraParams` field (extra `application/x-www-form-urlencoded` grant-body params, e.g. Auth0 `audience`), forwarded by `OAuth2TokenManager` with standard params taking precedence. This is the engine half of the OAuth2 change `RhythmConnector` already depends on.

> **Note:** netFORUM's denormalized facades (e.g. `Individual`, `FundraisingGift`) can exceed SQL Server's hard 1024-column-per-table limit when fully flattened; those objects need column-overflow handling at the framework level before they can materialize as single tables.

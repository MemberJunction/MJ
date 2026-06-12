---
"@memberjunction/integration-connectors": minor
---

Add Path LMS (Blue Sky eLearn) GraphQL Reporting API connector — pull-only / read-only. Rides `BaseRESTIntegrationConnector` with GraphQL over the single `/graphql` endpoint; two-step `applicationId`/`applicationSecret` → bearer token auth (with a `PreconfiguredToken` exchange-free path and an optional `Configuration.BaseURL`/`GraphQLEndpoint` host override for sandbox/self-host). Discovery is credential-free from the public SpectaQL schema (84 record types / 1175 fields), with a live-introspection overlay that only adds tenant fields.

Key capability: **per-object access paths (tables ≠ doors)** — the 84 record types are reached through 16 GraphQL query entry points, so each IO carries an `AccessPath` (`{ Door, Segments[] }`) and `FetchChanges` walks the nesting path to emit leaf records (depth-0 flat, depth-1/2/3 nested; the 6 polymorphic survey-question subtypes are marked unresolved and skipped with a `NO_ACCESS_PATH` warning rather than shipped as silent 0-row objects). PK = each record's `id`; FK derived from the SDL typed references; no watermark → content-hash idempotency. Includes the connector class, 37 unit tests, and declared integration metadata.

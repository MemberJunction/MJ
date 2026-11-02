---
"@memberjunction/ai-mcp-server": minor
"@memberjunction/cli": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/diagnostics": minor
"@memberjunction/diagnostics-server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/global": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-diagnostics": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/sqlserver-dataprovider": minor
---

Add Diagnostic Bundles: scoped diagnostic sessions that capture server logs, SQL and traces and client logs, network and telemetry; a two-stage scrubber; the `.mjdiag` archive format with structural verification; X25519 + AES-256-GCM envelope encryption; an MJAPI intake endpoint with quarantine-then-promote storage; automated findings; and CLI and Explorer surfaces. Adds the diagnostic session, chunk and bundle tables and their metadata. Adds `SanitizeForLog` to `@memberjunction/global`, and MJ console logging now strips CR and LF from string values.

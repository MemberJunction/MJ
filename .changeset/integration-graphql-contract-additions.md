---
"@memberjunction/server": minor
"@memberjunction/integration-engine": minor
"@memberjunction/integration-progress-artifacts": minor
---

Integration GraphQL additions: `IntegrationStartSchemaRefresh` (detached discovery start returning a tailable run id), live `RecordsCreated/Updated/Errored/Skipped` that actually count, offset paging on sync history and run listing with per-entity counts recovered from the run artifact, `IntegrationGetActiveOperations`, and `IntegrationProbeCredentials` (tests credentials without persisting anything).

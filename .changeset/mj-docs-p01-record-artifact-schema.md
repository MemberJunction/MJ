---
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
---

Add the `[__mj].[RecordArtifact]` polymorphic join table (SQL Server + deterministic PostgreSQL parity), register `EntityIDFieldName='EntityID'` on `MJ: Record Artifacts.RecordID`, update `spDeleteEntityWithCoreDependencies`, generate `MJRecordArtifactEntity` with synchronized server resolvers, Explorer form registrations, and bootstrap class-registration manifests, and add default entity-level Read/Update permission delegation fallback in `ArtifactPermissionEngine`.

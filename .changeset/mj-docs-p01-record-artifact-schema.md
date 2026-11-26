---
"@memberjunction/core-entities": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
---

Add the `[__mj].[RecordArtifact]` polymorphic join table (SQL Server + deterministic PostgreSQL parity), register `EntityIDFieldName='EntityID'` on `MJ: Record Artifacts.RecordID`, update `spDeleteEntityWithCoreDependencies`, generate `MJRecordArtifactEntity` with synchronized server resolvers, Explorer form registrations, and bootstrap class-registration manifests, add default entity-level Read/Update permission delegation fallback in `ArtifactPermissionEngine`, add `PromoteNoteToArtifact` / `LinkArtifactToRecord` in `@memberjunction/core-entities`, and add reusable `@memberjunction/ng-artifacts` primitives (`MJArtifactSlideoverService`, `<mj-artifact-slideover>`, `<mj-record-docs-list>`, and `<mj-embedded-doc-panel Mode="compact" | "full">`).

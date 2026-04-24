---
"@memberjunction/core": minor
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/notifications": patch
"@memberjunction/communication-sendgrid": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-resource-permissions": patch
---

Phase 2 of the unified permissions architecture: introduces the `IPermissionProvider` interface with 9 domain providers (Entity, Application Role, Dashboard, Resource, Artifact, AI Agent, Collection, Query, Access Control Rule) aggregated by a new `PermissionEngine` singleton, adds explicit Allow/Deny support to `EntityPermission`, and ships the Permissions admin dashboard. Includes migrations for the Permission Domain catalog, EntityPermission.Type column, Dashboard FK cascade delete, ResourcePermission.SharedByUserID, and UI role permission fixes.

---
"@memberjunction/core-entities": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-conversations": patch
---

Replace client-side `ExtraFilter` subqueries against `[__mj].[vw*]` base views with separate `RunView` entity reads across `@memberjunction/ng-artifacts` and `@memberjunction/ng-conversations` (including `AgentStateService`, `LibraryWorkspaceComponent`, `ArtifactPermissionService`, and `SearchService`), deprecate `ConversationEngine.ScopeSubquery` for client filters, and add `ConversationEngine.FilterArtifactVersionsToScope` in `@memberjunction/core-entities` so row-level-security-filtered users are no longer refused by `ClientClauseScreen`.
